import { randomUUID } from 'node:crypto';
import { detectUserHealthSignal } from './userHealthSignal.mjs';
import { deriveBmiFromFacts } from '../../src/services/derivedHealthMeasures.mjs';
const MAX_ITEMS = 100;
const MAX_PROFILE_SYNTHESIS_ITEMS = 32;
const RETRIEVABLE_FACT_STATUSES = new Set(['confirmed', 'reviewed']);
const usableAskFact = (fact) => fact && RETRIEVABLE_FACT_STATUSES.has(fact.status) && !fact.validUntil && fact.versionStatus !== 'earlier' && fact.reviewState !== 'user_retracted';
const LINK_RELATIONS = new Set(['same_source', 'happened_around', 'measured_during', 'treatment_for', 'related_by_me', 'user_note']);
const MEMORY_EVIDENCE_KINDS = new Set(['user_record', 'treatment_record', 'care_visit', 'document_context']);
const UNSUPPORTED_MEANING_LANGUAGE = /\b(?:you|your|i|we|our|recommend(?:s|ed|ation)?|should|must|need to|start|stop|change|take|avoid|increase|decrease|adjust|treat(?:ment)?|diagnos(?:e|is|ed)|cause[sd]?|urgent|safe)\b/i;
const EMPTY_MEANING = { text: '', citations: [] };
const SOURCE_CONTEXT_KINDS = {
  dates: new Set(['report_date', 'collected_at', 'received_at', 'approved_at', 'issued_at', 'effective_period']),
  entities: new Set(['laboratory', 'provider', 'insurer', 'analyzer', 'technology']),
  notes: new Set(['fasting_guidance', 'clinical_significance', 'clinical_decision_limits', 'remarks', 'sample_notice', 'other']),
};
const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'based', 'been', 'before', 'between', 'can', 'could', 'does', 'from', 'have', 'here', 'into', 'just', 'like', 'more', 'most', 'my', 'near', 'need', 'not', 'only', 'other', 'please', 'should', 'some', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'this', 'those', 'through', 'what', 'when', 'where', 'which', 'with', 'would', 'your']);
const cleanText = (value, limit = 500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const normalizeEvidenceText = (value) => cleanText(value, 2000).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const explicitlyRequestsMemory = (question) => /^\s*(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+(?:please\s+)?|i want you to\s+|i(?:'d| would) like you to\s+)?(?:remember|save|add|put)\s+(?:that\s+)?(?:i\b|my\b|this\b|that\b|it\b)/i.test(question);
const isPolicyTermSource = (source) => source?.kind === 'user_record' && /^(insurance coverage|coverage_term|coverage term)$/i.test(cleanText(source.category, 80));

const policyText = (source) => `${cleanText(source?.title, 240)} ${cleanText(source?.detail, 2000)}`.normalize('NFKC');
const policyAssessmentKinds = (source) => {
  const text = policyText(source).toLocaleLowerCase();
  const absentExclusions = /\b(?:no|none)\s+(?:specific\s+)?exclusions?\s+(?:are\s+)?(?:listed|stated|specified|shown|found|noted|identified|recorded)\b|\bexclusions?\s+(?:are\s+)?not\s+(?:listed|stated|specified|shown|found|noted|identified|recorded)\b/;
  if (absentExclusions.test(text)) return ['unclear'];
  const exclusionText = text.replace(/\b(?:not|never)\s+excluded\b|\bno\s+(?:specific\s+)?exclusions?\s+(?:apply|applies)\b/g, '');
  if (/\b(?:excluded|excludes|not covered|no coverage|ineligible)\b/.test(exclusionText)) return ['explicit_exclusion'];
  const kinds = [];
  if (/\b(?:unclear|ambiguous|not specified|not stated|subject to confirmation|depends on|reasonable and customary|usual and customary|medically necessary|medical necessity|pre[- ]existing|pre[- ]approval|waiting period|prior authorization|prior approval|subject to insurer approval|as determined by the insurer)\b/.test(text) || /\bexclusions?\b/.test(text)) kinds.push('unclear');
  if (/\b(?:limit|cap|maximum|max|deductible|co-?insurance|copay|co-pay|per day|per (?:policy )?year|per visit|up to)\b|\b\d+(?:\.\d+)?\s*%|(?:[$€£]\s?\d|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:usd|eur|gbp|sgd|myr)\b)/.test(text)) kinds.push('explicit_limit');
  if (/\b(?:covered|coverage|benefit|reimburse|reimbursement|payable|eligible|included)\b/.test(text)) kinds.push('explicit_benefit');
  return kinds;
};
const policyDetailIsQuoted = (source, detail) => {
  const clause = normalizeEvidenceText(cleanText(source?.detail, 2000));
  const quote = normalizeEvidenceText(detail);
  return quote.length >= 8 && clause.includes(quote);
};
const noExclusionsClaim = /\b(?:no\s+(?:specific\s+)?exclusions?\s+(?:apply|exist|are\s+(?:listed|stated|set\s+out|included|identified)|were\s+(?:found|identified|listed)|apply\s+to)|(?:the\s+|this\s+|your\s+)?(?:policy|plan)\s+(?:has|contains|lists|includes)\s+no\s+exclusions|there\s+(?:are|were)\s+no\s+exclusions|nothing\s+is\s+excluded|all\s+(?:care|services|conditions|treatments)\s+(?:are|is)\s+covered)\b/i;
const sourceConfirmsNoExclusions = (sources) => sources.filter(isPolicyTermSource).some((source) => /\bno\s+(?:specific\s+)?exclusions?\s+(?:apply|applies|exist|affect)\b/i.test(policyText(source)));
const removeUnsupportedNoExclusionsSentences = (value) => cleanText(value, 4000)
  .split(/(?<=[.!?;])\s+/)
  .filter((part) => !noExclusionsClaim.test(part))
  .join(' ')
  .trim();
const recordUnit = (value) => {
  const primaryValue = cleanText(value, 2400).split(/\.\s*(?:Reference interval printed|Method recorded|Source wording):/i, 1)[0];
  const match = primaryValue.match(/\b\d+(?:[.,]\d+)?\s*(mmol\s*\/\s*mol|mmol\s*\/\s*l|mg\s*\/\s*dl|mg\s*\/\s*l|mmhg|g\s*\/\s*l|µmol\s*\/\s*l|umol\s*\/\s*l|mEq\s*\/\s*l|mIU\s*\/\s*l|IU\s*\/\s*l|kg\/m²|kg\/m2|kg|cm|bpm|%)(?=$|[\s.,;])/i);
  return match?.[1]?.toLocaleLowerCase().replace(/\s+/g, '').replace('µ', 'u') ?? '';
};
const recordMarkerKey = (title) => {
  const value = normalizeEvidenceText(title);
  if (/\b(?:hba1c|hemoglobin a1c|haemoglobin a1c|glycated hemoglobin|glycated haemoglobin)\b/.test(value)) return 'hba1c';
  if (/\bldl\b/.test(value)) return 'ldl';
  if (/\bhdl\b/.test(value)) return 'hdl';
  if (/\btriglycerides?\b/.test(value)) return 'triglycerides';
  if (/\bcholesterol\b/.test(value)) return 'cholesterol';
  if (/\b(?:glucose|blood sugar)\b/.test(value)) return 'blood sugar';
  if (/\bblood pressure\b/.test(value)) return 'blood pressure';
  return value;
};
const recordMarkerLabel = (key, records) => ({
  hba1c: 'HbA1c', ldl: 'LDL cholesterol', hdl: 'HDL cholesterol', triglycerides: 'triglycerides',
  cholesterol: records.some((record) => /\btotal\b/i.test(record.title)) ? 'total cholesterol' : 'cholesterol',
  'blood sugar': 'blood sugar', 'blood pressure': 'blood pressure',
}[key] ?? records[0]?.title ?? key);

function recordQualityReview(sources) {
  const records = (Array.isArray(sources) ? sources : []).filter((source) => source?.kind === 'user_record' && !isPolicyTermSource(source));
  const byMarker = new Map();
  for (const source of records) {
    const key = recordMarkerKey(source.title);
    const unit = recordUnit(source.detail);
    if (!key || !unit) continue;
    const entries = byMarker.get(key) ?? [];
    entries.push({ source, unit });
    byMarker.set(key, entries);
  }
  const conflicts = [...byMarker].flatMap(([key, entries]) => {
    const units = new Set(entries.map((entry) => entry.unit));
    return units.size > 1 ? [{ key, label: recordMarkerLabel(key, entries.map(({ source }) => source)), records: entries.map(({ source }) => source) }] : [];
  });
  if (conflicts.length) {
    const labels = conflicts.slice(0, 2).map((item) => item.label);
    const joinedLabels = labels.length === 2 ? `${labels[0]} and ${labels[1]}` : labels[0];
    const citedConflicts = conflicts.slice(0, 2);
    const citations = [...new Set(citedConflicts.flatMap((item) => item.records.map((source) => source.reference)))].slice(0, 8);
    const nextSteps = citedConflicts.map(({ label }) => `Check the ${label} units against the original report`);
    if (nextSteps.length === 1) nextSteps.push('Add the report’s reference interval');
    return {
      answer: `Your saved records are a useful starting point, but the ${joinedLabels} entries use different units. Keep each value as recorded and check the units and reference intervals against the original lab reports before comparing them.`,
      citations,
      unknowns: [],
      nextSteps,
    };
  }

  const missingRanges = records.filter((source) => !/Reference interval printed in report:/i.test(cleanText(source.detail, 2400)));
  if (!records.length) return {
    answer: 'I don’t have any health records selected for this review yet. Choose the records or reports you want me to check, and I can look at their dates, units, reference intervals, and sources.',
    citations: [], unknowns: [], nextSteps: ['Choose records to review', 'Add an original lab report'],
  };
  const qualityCitations = [...new Set((missingRanges.length ? missingRanges : records).map((source) => source.reference))].slice(0, 8);
  return {
    answer: missingRanges.length
      ? 'Your saved records are a useful starting point for tracking, but the selected entries don’t show the lab’s reference intervals. Add the ranges from the original reports so future results are easier to compare.'
      : 'Your saved records give you a useful basis for tracking. Keeping each result linked to its report, date, unit, and reference interval will make future comparisons clearer.',
    citations: qualityCitations,
    unknowns: [],
    nextSteps: missingRanges.length
      ? ['Add the original report ranges', 'Check each result’s date and unit']
      : ['Compare results over time', 'Review a specific result'],
  };
}

const recordQualityAnswerLooksOff = (value) => {
  const answer = cleanText(value, 4000);
  return /\b(?:i\s+)?(?:can(?:not|'t)|won't)\s+(?:rate|assess|judge)\s+(?:your|the)?\s*(?:overall\s+)?health\b/i.test(answer)
    || /\b(?:records reviewed include|the current records show|the records show)\b/i.test(answer)
    || answer.split(/\s+/).filter(Boolean).length > 65;
};

function sanitizeContextEntries(items, allowedKinds, maxItems, maxValueLength) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const kind = cleanText(item?.kind, 48).toLowerCase();
    const value = cleanText(item?.value, maxValueLength);
    if (!allowedKinds.has(kind) || !value) return [];
    const page = Number.isInteger(item?.page) && item.page > 0 ? item.page : null;
    return [{ kind, value, page, quote: cleanText(item?.quote, 600) }];
  }).slice(0, maxItems);
}

function sanitizeDocumentSources(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 5).flatMap((item) => {
    const id = cleanText(item?.id, 96);
    const title = cleanText(item?.title, 180);
    if (!/^[a-zA-Z0-9-]{1,96}$/.test(id) || !title) return [];
    const documentType = cleanText(item?.documentType, 120);
    const dates = sanitizeContextEntries(item?.dates, SOURCE_CONTEXT_KINDS.dates, 12, 120);
    const entities = sanitizeContextEntries(item?.entities, SOURCE_CONTEXT_KINDS.entities, 12, 180);
    const notes = sanitizeContextEntries(item?.notes, SOURCE_CONTEXT_KINDS.notes, 16, 1200);
    if (!documentType && !dates.length && !entities.length && !notes.length) return [];
    return [{ id, title, documentType, dates, entities, notes }];
  });
}

function sanitizeReadingSource(rawReading) {
  if (!rawReading || typeof rawReading !== 'object') return null;
  const title = cleanText(rawReading.title, 180);
  if (!title) return null;
  let url = '';
  try {
    const parsed = new URL(cleanText(rawReading.url, 1200));
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.toString();
  } catch { /* A source URL is optional context, never authority. */ }
  return {
    title,
    publisher: cleanText(rawReading.publisher, 140),
    topic: cleanText(rawReading.topic, 120),
    mediaType: rawReading.mediaType === 'video' ? 'video' : 'article',
    summary: cleanText(rawReading.summary, 1200),
    url,
  };
}

export function sanitizeRunBody(input) {
  if (!input || input.consentConfirmed !== true) throw new Error('Please confirm before sharing your selected health details for this answer.');
  const question = cleanText(input.question, 2000);
  if (!question) throw new Error('Write a question first.');
  const mode = input.mode === 'symptom_support' ? 'symptom_support' : 'general';
  const readingSource = sanitizeReadingSource(input.readingSource);
  const recentMessagesConsent = input.recentMessagesConsent === true && mode !== 'symptom_support';
  const historyContextConsent = input.historyContextConsent === true && mode !== 'symptom_support';
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  const rawDemographics = context.demographics && typeof context.demographics === 'object' ? context.demographics : {};
  const ageAtMeasurement = Number.isInteger(rawDemographics.ageAtMeasurement) && rawDemographics.ageAtMeasurement >= 0 && rawDemographics.ageAtMeasurement <= 120
    ? rawDemographics.ageAtMeasurement : null;
  const measurementDate = /^\d{4}-\d{2}-\d{2}$/.test(cleanText(rawDemographics.measurementDate, 10)) ? cleanText(rawDemographics.measurementDate, 10) : '';
  const facts = Array.isArray(context.facts) ? context.facts.slice(0, MAX_ITEMS).map((fact) => ({
    id: cleanText(fact?.id, 96), label: cleanText(fact?.label, 140), value: cleanText(fact?.value, 500),
    date: cleanText(fact?.date, 64), category: cleanText(fact?.category, 80), source: cleanText(fact?.source, 120), status: cleanText(fact?.status, 32),
    referenceRange: cleanText(fact?.referenceRange, 120), method: cleanText(fact?.method, 180), sourceQuote: cleanText(fact?.sourceQuote, 400), page: Number.isInteger(fact?.page) && fact.page > 0 ? fact.page : null,
    validFrom: cleanText(fact?.validFrom, 64), validUntil: cleanText(fact?.validUntil, 64), versionStatus: fact?.versionStatus === 'earlier' ? 'earlier' : '',
  })).filter((fact) => fact.id && fact.label && fact.value && RETRIEVABLE_FACT_STATUSES.has(fact.status) && (fact.versionStatus !== 'earlier' || historyContextConsent) && !(mode === 'symptom_support' && /medication|medicine|drug|dose|treatment|prescri|pharma|care plan|tablet|capsule|\b\d+\s?(?:mg|mcg|μg|ml|units?)\b/i.test(`${fact.category} ${fact.label} ${fact.value}`))) : [];
  const topics = Array.isArray(context.topics) ? context.topics.slice(0, MAX_ITEMS).map((topic) => ({ id: cleanText(topic?.id, 96), label: cleanText(topic?.label, 120) })).filter((topic) => topic.id && topic.label) : [];
  const links = mode === 'symptom_support' ? [] : Array.isArray(context.links) ? context.links.slice(0, MAX_ITEMS).map((link) => ({ id: cleanText(link?.id, 96), from: cleanText(link?.from, 96), to: cleanText(link?.to, 96), relationType: LINK_RELATIONS.has(link?.relationType) ? link.relationType : 'user_note', label: cleanText(link?.label, 240), createdAt: cleanText(link?.createdAt, 64) })).filter((link) => link.id && link.from && link.to && link.label) : [];
  const treatments = mode === 'symptom_support' || input.treatmentContextConsent !== true ? [] : Array.isArray(context.treatments) ? context.treatments.slice(0, MAX_ITEMS).map((treatment) => ({
    id: cleanText(treatment?.id, 96), name: cleanText(treatment?.name, 140), dose: cleanText(treatment?.dose, 120), schedule: cleanText(treatment?.schedule, 140),
    purpose: cleanText(treatment?.purpose, 240), prescriber: cleanText(treatment?.prescriber, 140), careLocation: cleanText(treatment?.careLocation, 180),
    pharmacy: cleanText(treatment?.pharmacy, 140), status: treatment?.status === 'past' ? 'past' : treatment?.status === 'current' ? 'current' : '',
    startedOn: cleanText(treatment?.startedOn, 64), endedOn: cleanText(treatment?.endedOn, 64), source: cleanText(treatment?.source, 120),
  })).filter((treatment) => treatment.id && treatment.name && treatment.status) : [];
  const visits = mode === 'symptom_support' || input.visitContextConsent !== true ? [] : Array.isArray(context.visits) ? context.visits.slice(0, MAX_ITEMS).map((visit) => ({
    id: cleanText(visit?.id, 96), purpose: cleanText(visit?.purpose, 180), appointmentAt: cleanText(visit?.appointmentAt, 64),
    clinician: cleanText(visit?.clinician, 140), location: cleanText(visit?.location, 180), status: visit?.status === 'completed' ? 'completed' : visit?.status === 'upcoming' ? 'upcoming' : '',
    source: cleanText(visit?.source, 120), questions: Array.isArray(visit?.questions) ? visit.questions.slice(0, 20).map((question) => cleanText(question, 240)).filter(Boolean) : [],
    outcome: cleanText(visit?.outcome, 1000), followUp: cleanText(visit?.followUp, 500),
    followUpActions: Array.isArray(visit?.followUpActions) ? visit.followUpActions.slice(0, 40).map((action) => ({
      id: cleanText(action?.id, 96), title: cleanText(action?.title, 240), dueOn: cleanText(action?.dueOn, 64),
      status: action?.status === 'done' ? 'done' : action?.status === 'open' ? 'open' : '', source: cleanText(action?.source, 120),
    })).filter((action) => action.id && action.title && action.status) : [],
  })).filter((visit) => visit.id && visit.status && (visit.purpose || visit.outcome || visit.followUp || visit.questions.length || visit.followUpActions.length)) : [];
  const documentSources = mode === 'symptom_support' || input.sourceContextConsent !== true ? [] : sanitizeDocumentSources(context.documentSources);
  const history = recentMessagesConsent && Array.isArray(input.history) ? input.history.slice(-8).map((message) => {
    const historicalReading = sanitizeReadingSource(message?.readingSource);
    return {
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(message?.content, 2000),
      ...(historicalReading ? { readingSource: historicalReading } : {}),
    };
  }).filter((message) => message.content) : [];
  const runId = typeof input.runId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(input.runId) ? input.runId : randomUUID();
  return { runId, mode, question, readingSource, context: { facts, topics, links, treatments, visits, documentSources, demographics: input.derivedAgeConsent === true && mode !== 'symptom_support' && ageAtMeasurement !== null && measurementDate ? { ageAtMeasurement, measurementDate } : null }, history, recentMessagesConsent, externalSearchConsent: input.externalSearchConsent === true, derivedAgeConsent: input.derivedAgeConsent === true && mode !== 'symptom_support' && ageAtMeasurement !== null && Boolean(measurementDate), treatmentContextConsent: input.treatmentContextConsent === true && mode !== 'symptom_support' && treatments.length > 0, visitContextConsent: input.visitContextConsent === true && mode !== 'symptom_support' && visits.length > 0, sourceContextConsent: input.sourceContextConsent === true && mode !== 'symptom_support' && documentSources.length > 0, historyContextConsent };
}

export function classifyIntent(question, { history = [], readingSource = null } = {}) {
  const q = String(question ?? '').toLowerCase();
  const recentMessages = Array.isArray(history) ? history.slice(-8) : [];
  const historyText = recentMessages.map((message) => String(message?.content ?? '')).join(' ').toLowerCase();
  const historicReading = [...recentMessages].reverse().find((message) => message?.readingSource?.title)?.readingSource ?? null;
  const activeReading = readingSource?.title ? readingSource : historicReading;
  if (/\b(?:records?|record keeping)\b/.test(q) && /\b(?:good|complete|reliable|accurate|consistent|quality|useful|organized|organised)\b/.test(q)) return { key: 'record_quality', label: 'health record quality review' };
  if (/re[- ]?contextualiz(?:e|ation)/.test(q)) return { key: 'profile_summary', label: 'profile recontextualization' };
  if (/first-pass synthesis|synthesi[sz]e.*profile/.test(q)) return { key: 'profile_summary', label: 'first profile synthesis' };
  if (/\bwhat\s+should\s+i\s+(?:focus|prioriti[sz]e|pay\s+attention\s+to)\b.{0,48}\bhealth\b/.test(q)) return { key: 'profile_summary', label: 'overall health review' };
  if (/\bwhat\s+do\s+you\s+know\s+(?:of|about)\s+me\b|\boverall\s+(?:health|wellbeing|well-being|health profile)\b|\bhow(?:'s| is)\s+my\s+(?:overall\s+)?health\b|\bhow\s+(?:good|healthy)\s+(?:is|am)\s+(?:my\s+health|i)\b|\btell\s+me\s+how\s+good\s+my\s+health\s+is\b|\bhow\s+am\s+i\s+(?:doing|healthwise)\b|\b(?:summari[sz]e|review|analy[sz]e)\s+(?:my\s+)?(?:overall\s+)?(?:health|profile|health records)\b|\b(?:insight|overview)\b.{0,48}\bmy\s+health\b|\bmy\s+health\s+(?:picture|summary|status|state)\b/.test(q)) return { key: 'profile_summary', label: 'overall health review' };
  if (/\bmy\b/.test(q) && /\b(?:alongside|together with|relative to|in relation to|side by side)\b/.test(q) && /\b(?:cholesterol|hba1c|blood sugar|glucose|weight|height|bmi|blood pressure|results?|measurements?)\b/.test(q)) return { key: 'profile_summary', label: 'connected health-results review' };
  if (/\b(?:any(?: of (?:mine|my results|these))?|which|are|is)\b.{0,48}\b(?:high|elevated|above (?:the )?range|out of range|low)\b|\b(?:high|elevated|outside (?:the )?range)\b.{0,48}\b(?:mine|my results|my numbers|my readings)\b/.test(q)) return { key: 'result_check', label: 'check your saved results' };
  if (activeReading && /\b(?:this|that|it|video|article|source|watch|learn from|pick up|takeaway)\b/.test(q)
    && /\b(?:what|explain|tell|learn|understand|mean|relate|connect|summari[sz]e|take|notice)\b/.test(q)) {
    return { key: 'selected_reading', label: 'selected health reading' };
  }
  const recentHealthContext = /\b(?:health|cholesterol|hba1c|a1c|blood sugar|glucose|bmi|triglycerides?|lab results?|measurements?|vitals?|vital signs|blood pressure)\b/.test(historyText);
  const followUpTopic = /\b(?:cholesterol|lipids?|hba1c|a1c|blood sugar|glucose|bmi|triglycerides?|blood pressure|vitals?|vital signs|weight|height|lab results?|measurements?)\b/.test(q);
  if (recentHealthContext && followUpTopic && /\b(?:then|also|and|but|what about|how about|as for)\b/.test(q)) {
    return { key: 'profile_follow_up', label: 'follow-up about your health results' };
  }
  if (recentHealthContext && /\b(?:what does (?:that|it|this|\d)|what about (?:that|it|this)|how does (?:that|it|this)|and (?:the|my)|what next|what should i (?:do|check)|should i be concerned|why is that|tell me more|can you explain that)\b/.test(q)) {
    return { key: 'profile_follow_up', label: 'follow-up about your health results' };
  }
  if (/insurance|coverage|covered|claim|benefit|policy|deductible|copay/.test(q)) return { key: 'coverage', label: 'insurance or coverage' };
  if (/medicine|medication|drug|dose|tablet|prescription|treatment|side effect/.test(q)) return { key: 'treatment', label: 'treatment or medicines' };
  if (/\b(diet|nutrition|food|foods|meal|meals|eating|protein|fiber|fibre|carbohydrate|carbohydrates|carbs|organic)\b/.test(q)) return { key: 'education', label: 'food and nutrition education' };
  if (/lab|blood|result|test|cholesterol|sugar|pressure|measurement|trend/.test(q)) return { key: 'results', label: 'test results or measurements' };
  if (/timeline|history|when|changed|before|since/.test(q)) return { key: 'history', label: 'health history' };
  if (/\b(search|web|article|articles|latest|guideline|guidelines|research|evidence|source|sources)\b/.test(q)) return { key: 'education', label: 'general health information' };
  return { key: 'profile', label: 'your saved health information' };
}

const tokens = (value) => cleanText(value, 2000).toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 2 && !STOP_WORDS.has(word)) ?? [];
const toolSearch = { type: 'function', name: 'search_profile', description: 'Search only the health facts, selected health areas, user-authored links, treatment records, visit history, and explicitly selected source-document details supplied for this run. Describe a record as an earlier saved version only when its returned status is earlier_saved_version; use it only for a history or comparison question. Do not infer duplicate records, unit conversions, diagnoses, or medical relationships.', strict: true, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } };
const toolGet = { type: 'function', name: 'get_saved_record', description: 'Open one exact record that was already returned by search_profile. Use it when its full value or source needs closer inspection.', strict: true, parameters: { type: 'object', properties: { recordId: { type: 'string' } }, required: ['recordId'], additionalProperties: false } };
export const healthSearchTool = { type: 'function', name: 'search_health_sources', description: 'Search general health education from an allowlisted set of trusted public sources. Only available when the user explicitly opted into web search for this run. Search a generic topic, never a person’s identity or personal record.', strict: true, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } };
export const profileTools = [toolSearch, toolGet];

export function createEvidenceTools(context) {
  const known = new Map();
  const references = new Map();
  const external = new Map();
  let nextReference = 1;
  const issueReference = (record) => {
    if (!references.has(record.id)) {
      const ref = `R${nextReference++}`;
      references.set(record.id, ref);
      known.set(record.id, { ...record, reference: ref });
    }
    return known.get(record.id);
  };
  const allRecords = [
    ...context.facts.map((fact) => ({
      id: `fact:${fact.id}`, title: fact.label,
      detail: [fact.versionStatus === 'earlier'
        ? `Earlier saved version; no longer current in Nura's profile. Value recorded on ${fact.date || 'an undated record'}: ${fact.value}. This version was kept from ${fact.validFrom || 'an unknown date'} until ${fact.validUntil || 'an unknown date'}.`
        : fact.value,
      fact.referenceRange && `Reference interval printed in report: ${fact.referenceRange}`,
      fact.method && `Method recorded in report: ${fact.method}`,
      fact.sourceQuote && `Source wording: “${fact.sourceQuote}”${fact.page ? ` (page ${fact.page})` : ''}`,
      ].filter(Boolean).join('. '),
      date: fact.date, source: fact.source, status: fact.versionStatus === 'earlier' ? 'earlier_saved_version' : fact.status, kind: 'user_record', category: fact.category,
    })),
    ...context.topics.map((topic) => ({ id: `topic:${topic.id}`, title: topic.label, detail: 'Health area selected by the user; not a diagnosis or confirmed medical fact.', date: '', source: 'Selected by you', status: 'user_selected', kind: 'chosen_topic' })),
    ...(context.treatments ?? []).map((treatment) => ({
      id: `treatment:${treatment.id}`, title: treatment.name,
      detail: [
        treatment.dose && `Dose as recorded: ${treatment.dose}`, treatment.schedule && `Schedule as recorded: ${treatment.schedule}`,
        treatment.purpose && `Recorded purpose: ${treatment.purpose}`, treatment.prescriber && `Prescriber: ${treatment.prescriber}`,
        treatment.careLocation && `Care location: ${treatment.careLocation}`, treatment.pharmacy && `Pharmacy: ${treatment.pharmacy}`,
        `Status: ${treatment.status}`, treatment.startedOn && `Started: ${treatment.startedOn}`, treatment.endedOn && `Ended: ${treatment.endedOn}`,
      ].filter(Boolean).join('. '),
      date: treatment.startedOn, source: treatment.source || 'Entered by you', status: treatment.status, kind: 'treatment_record', category: 'Treatment',
    })),
    ...(context.visits ?? []).map((visit) => ({
      id: `visit:${visit.id}`, title: visit.purpose || 'Care visit',
      detail: [
        visit.appointmentAt && `Visit date: ${visit.appointmentAt}`, `Status: ${visit.status}`,
        visit.clinician && `Clinician as recorded: ${visit.clinician}`, visit.location && `Location as recorded: ${visit.location}`,
        visit.questions.length && `Questions you wrote: ${visit.questions.join('; ')}`,
        visit.outcome && `Your visit note: ${visit.outcome}`, visit.followUp && `Your follow-up note: ${visit.followUp}`,
        ...visit.followUpActions.map((action) => `Follow-up action you recorded: ${action.title}${action.dueOn ? ` (due ${action.dueOn})` : ''} · ${action.status === 'done' ? 'completed by you' : 'open'}${action.source ? ` · ${action.source}` : ''}`),
      ].filter(Boolean).join('. '),
      date: visit.appointmentAt, source: visit.source || 'Added by you', status: visit.status, kind: 'care_visit', category: 'Care visit',
    })),
    ...(context.documentSources ?? []).flatMap((document) => {
      const entries = [
        ...(document.documentType ? [{ kind: 'document type', value: document.documentType, page: null, quote: '' }] : []),
        ...document.dates.map((entry) => ({ ...entry, kind: entry.kind.replaceAll('_', ' ') })),
        ...document.entities.map((entry) => ({ ...entry, kind: entry.kind.replaceAll('_', ' ') })),
        ...document.notes.map((entry) => ({ ...entry, kind: entry.kind.replaceAll('_', ' ') })),
      ];
      return entries.map((entry, index) => ({
        id: `document:${document.id}:${index}`, title: `${entry.kind}: ${document.title}`,
        detail: [entry.value, entry.quote && `Quoted from source: “${entry.quote}”`, entry.page && `Page ${entry.page}`].filter(Boolean).join('. '),
        date: '', source: document.title, status: 'source_detail_extracted', kind: 'document_context', category: 'Source details',
      }));
    }),
  ];
  const byId = new Map(allRecords.map((record) => [record.id, record]));
  function derivedMeasurements(includeForSynthesis) {
    if (!includeForSynthesis) return [];
    const bmi = deriveBmiFromFacts(context.facts);
    if (!bmi) return [];
    const weightRecord = known.get(`fact:${bmi.weightFactId}`);
    const heightRecord = known.get(`fact:${bmi.heightFactId}`);
    if (!weightRecord || !heightRecord) return [];
    const demographic = context.demographics?.measurementDate === bmi.measurementDate
      && Number.isInteger(context.demographics?.ageAtMeasurement)
      ? { ageAtMeasurement: context.demographics.ageAtMeasurement, measurementDate: bmi.measurementDate }
      : null;
    if (demographic && demographic.ageAtMeasurement < 2) return [];
    const ageSource = demographic?.ageAtMeasurement < 20
      ? addExternalSources({ sources: [{
        url: 'https://www.cdc.gov/bmi/child-teen-calculator/bmi-categories.html',
        title: 'Child and Teen BMI Categories',
        publisher: 'CDC',
        detail: 'For children and teens ages 2–19, BMI categories use sex- and age-specific percentiles because they are still growing.',
      }] }).sources[0]
      : addExternalSources({ sources: [{
          url: 'https://www.cdc.gov/bmi/adult-calculator/index.html',
          title: 'Adult BMI Categories',
          publisher: 'CDC',
          detail: 'For adults 20 and older, BMI categories use these screening ranges: below 18.5, 18.5–24.9, 25.0–29.9, and 30.0 or higher. BMI is a screening measure, not a diagnosis.',
        }] }).sources[0];
    const hasA1c = context.facts.some((fact) => usableAskFact(fact) && /\b(?:hba1c|a1c|glycated hemoglobin)\b/i.test(fact.label));
    const a1cSource = hasA1c ? addExternalSources({ sources: [{
      url: 'https://www.niddk.nih.gov/health-information/diagnostic-tests/A1C-test',
      title: 'The A1C Test & Diabetes',
      publisher: 'NIDDK',
      detail: 'The A1C test reflects average blood glucose levels over approximately the past three months.',
    }] }).sources[0] : null;
    return [{
      kind: 'calculated_bmi',
      value: `${bmi.bmi.toFixed(1)} kg/m²`,
      rawValue: bmi.bmiRaw,
      measurementDate: bmi.measurementDate,
      ageAtMeasurement: demographic?.ageAtMeasurement ?? null,
      weightReference: weightRecord.reference,
      heightReference: heightRecord.reference,
      educationalReference: ageSource?.reference ?? null,
      a1cEducationalReference: a1cSource?.reference ?? null,
      method: 'weight in kilograms divided by height in meters squared; calculated from one current saved weight and height recorded on the same date',
    }];
  }
  function searchProfile(query, { includeAllSelected = false, includeDerivedMeasurements = false } = {}) {
    const queryWords = [...new Set(tokens(query))];
    const records = includeAllSelected
      ? allRecords.slice(0, MAX_PROFILE_SYNTHESIS_ITEMS)
      : allRecords.map((record) => {
        const haystack = `${record.title} ${record.detail} ${record.category ?? ''} ${record.source ?? ''}`.toLowerCase();
        const score = queryWords.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
        return { record, score };
      }).filter((item) => queryWords.length ? item.score > 0 : false).sort((a, b) => b.score - a.score).slice(0, 8).map(({ record }) => record);
    const results = records.map((record) => issueReference(record));
    const ids = new Set(results.map((record) => record.id));
    const relatedLinks = context.links.filter((link) => {
      const from = link.from.startsWith('fact:') || link.from.startsWith('topic:') ? link.from : `fact:${link.from}`;
      const to = link.to.startsWith('fact:') || link.to.startsWith('topic:') ? link.to : `fact:${link.to}`;
      return ids.has(from) || ids.has(to);
    }).flatMap((link) => {
      const fromId = link.from.startsWith('fact:') || link.from.startsWith('topic:') ? link.from : `fact:${link.from}`;
      const toId = link.to.startsWith('fact:') || link.to.startsWith('topic:') ? link.to : `fact:${link.to}`;
      const fromRecord = byId.get(fromId);
      const toRecord = byId.get(toId);
      // A relationship is useful evidence only when both saved endpoints are
      // present in this consent-scoped context. Keep the user's link in their
      // profile, but never turn an unresolved endpoint into a citeable record.
      if (!fromRecord || !toRecord) return [];
      const from = fromRecord.title;
      const to = toRecord.title;
      const source = issueReference({ id: `link:${link.id}`, title: `You linked ${from} to ${to}`, detail: `Your recorded association (${link.relationType.replaceAll('_', ' ')}): ${link.label}`, date: link.createdAt, source: 'Linked by you', status: 'user_authored', kind: 'user_link', category: 'Relationship' });
      return [{ id: source.id, reference: source.reference, from, to, relationType: link.relationType, label: link.label, authoredBy: 'user', createdAt: link.createdAt }];
    });
    const healthEducationSources = includeAllSelected && includeDerivedMeasurements
      ? profileEducationSources(results).map(({ reference, title, url, detail, publisher }) => ({ reference, title, url, detail, publisher }))
      : [];
    return {
      results,
      userAuthoredLinks: relatedLinks,
      ...(includeAllSelected && includeDerivedMeasurements ? { derivedMeasurements: derivedMeasurements(true) } : {}),
      ...(includeAllSelected && includeDerivedMeasurements ? { healthEducationSources } : {}),
      ...(includeAllSelected ? { totalCount: allRecords.length, omittedCount: Math.max(0, allRecords.length - results.length) } : {}),
    };
  }
  function getRecord(recordId) {
    const record = known.get(recordId);
    return record ? { ...record } : null;
  }
  function addExternalSources(searchResult) {
    const mapped = [];
    for (const item of (Array.isArray(searchResult?.sources) ? searchResult.sources : []).slice(0, 8)) {
      if (typeof item?.url !== 'string' || !item.url.startsWith('https://')) continue;
      let existing = [...external.values()].find((source) => source.url === item.url);
      if (!existing) {
        const reference = `W${external.size + 1}`;
        existing = { reference, id: `web:${reference}`, title: cleanText(item.title, 240) || 'Health information source', detail: cleanText(item.detail, 400), date: '', source: 'Trusted health source', status: 'external_reference', kind: 'external_source', url: item.url, publisher: new URL(item.url).hostname };
        external.set(reference, existing);
      }
      mapped.push(existing);
    }
    return { summary: cleanText(searchResult?.summary, 3000), sources: mapped };
  }
  function profileEducationSources(records) {
    const visibleRecords = Array.isArray(records) ? records.filter((record) => record.kind === 'user_record') : [];
    const result = [];
    if (visibleRecords.some((record) => /\btotal cholesterol\b/i.test(record.title))) {
      result.push(...addExternalSources({ sources: [{
        url: 'https://medlineplus.gov/lab-tests/cholesterol-levels/',
        title: 'Cholesterol Levels: MedlinePlus Medical Test',
        publisher: 'MedlinePlus',
        detail: 'General guide: total cholesterol below 200 mg/dL (5.18 mmol/L) for adults age 20 or older, and below 170 mg/dL for age 19 or younger. Individual targets depend on age, family history, lifestyle, and other heart-disease risk factors.',
      }] }).sources);
    }
    if (visibleRecords.some((record) => /\b(?:hba1c|a1c|glycated hemoglobin)\b/i.test(record.title))) {
      result.push(...addExternalSources({ sources: [{
        url: 'https://www.niddk.nih.gov/health-information/diagnostic-tests/A1C-test',
        title: 'The A1C Test & Diabetes',
        publisher: 'NIDDK',
        detail: 'The A1C test reflects average blood glucose levels over the past three months. A1C below 5.7% is normal, 5.7%–6.4% is the prediabetes range, and 6.5% or higher is the diabetes threshold; a clinician may confirm results with repeat testing.',
      }] }).sources);
    }
    return result;
  }
  function execute(name, args, options) {
    if (name === 'search_profile') return searchProfile(cleanText(args?.query, 240), options);
    if (name === 'get_saved_record') return getRecord(cleanText(args?.recordId, 120)) ?? { unavailable: true, note: 'That record was not returned by this run’s profile search.' };
    return { unavailable: true, note: 'This tool is not available in Nura.' };
  }
  function sources() { return [...known.values(), ...external.values()]; }
  return { execute, sources, addExternalSources, derivedMeasurements: () => derivedMeasurements(true) };
}

export function coverageTraceDetail(answer, sources) {
  const policySources = (Array.isArray(sources) ? sources : []).filter(isPolicyTermSource);
  const policyReferences = new Set(policySources.map((source) => source.reference));
  const citedPolicyCount = new Set((Array.isArray(answer?.citations) ? answer.citations : []).filter((reference) => policyReferences.has(reference))).size;
  const assessmentCount = Array.isArray(answer?.coverageAssessments) ? answer.coverageAssessments.length : 0;
  if (assessmentCount) return assessmentCount + ' policy finding' + (assessmentCount === 1 ? '' : 's') + ' linked to reviewed terms';
  if (citedPolicyCount) return citedPolicyCount + ' cited policy term' + (citedPolicyCount === 1 ? '' : 's') + '; no structured policy-to-health finding was returned';
  if (policySources.length) return policySources.length + ' policy term' + (policySources.length === 1 ? '' : 's') + ' retrieved; no structured policy-to-health finding was returned';
  return 'No reviewed policy terms were retrieved; this comparison remains incomplete';
}

export function validateAnswer(answer, sources, intent) {
  const allowed = new Set(sources.map((source) => source.reference));
  const sourceByReference = new Map(sources.map((source) => [source.reference, source]));
  let rejectedCoverageFinding = false;
  const coverageAssessments = intent.key === 'coverage' && Array.isArray(answer?.coverageAssessments)
    ? answer.coverageAssessments.slice(0, 8).flatMap((item) => {
      const policyReference = cleanText(item?.policyReference, 8);
      const policySource = sourceByReference.get(policyReference);
      const policyKind = cleanText(item?.kind, 32);
      const detail = cleanText(item?.detail, 320);
      const isPolicyTerm = isPolicyTermSource(policySource);
      if (!isPolicyTerm || !detail || !['explicit_benefit', 'explicit_limit', 'explicit_exclusion', 'unclear'].includes(policyKind)) return [];
      const supportedKinds = policyAssessmentKinds({ detail });
      if (!supportedKinds.length || !policyDetailIsQuoted(policySource, detail)) {
        rejectedCoverageFinding = true;
        return [];
      }
      // Correct a pre-approval/authorization clause mislabeled as a limit or
      // benefit. Other category conflicts could reverse a coverage decision,
      // so leave those findings out rather than trying to repair the model.
      const isApprovalCondition = /\b(?:pre[- ]approval|prior approval|prior authorization|subject to insurer approval|depends on)\b/i.test(detail);
      const validatedKind = supportedKinds.includes(policyKind) ? policyKind
        : isApprovalCondition && supportedKinds.length === 1 && supportedKinds[0] === 'unclear' && ['explicit_benefit', 'explicit_limit'].includes(policyKind)
          ? 'unclear'
          : null;
      if (!validatedKind) {
        rejectedCoverageFinding = true;
        return [];
      }
      const relatedHealthReferences = Array.isArray(item?.relatedHealthReferences)
        ? [...new Set(item.relatedHealthReferences.filter((reference) => {
          if (typeof reference !== 'string' || !allowed.has(reference)) return false;
          const source = sourceByReference.get(reference);
          return ['user_record', 'treatment_record', 'care_visit'].includes(source?.kind) && !isPolicyTermSource(source);
        }))].slice(0, 5)
        : [];
      return [{ kind: validatedKind, policyReference, detail, relatedHealthReferences }];
    })
    : [];
  const modelCitations = Array.isArray(answer?.citations) ? answer.citations.filter((value) => typeof value === 'string' && allowed.has(value)) : [];
  const coverageCitations = coverageAssessments.flatMap((item) => [item.policyReference, ...item.relatedHealthReferences]);
  let citations = [...new Set([...(rejectedCoverageFinding ? [] : modelCitations), ...coverageCitations])].slice(0, 20);
  const meaningText = cleanText(answer?.meaning?.text, 500);
  const meaningReferences = Array.isArray(answer?.meaning?.citations)
    ? [...new Set(answer.meaning.citations.filter((reference) => typeof reference === 'string' && modelCitations.includes(reference) && sourceByReference.get(reference)?.kind === 'external_source'))].slice(0, 4)
    : [];
  // Meaning is limited to opted-in, trusted public sources and non-personal
  // educational wording. The pattern intentionally errs toward suppressing it.
  const meaningAllowed = !['coverage', 'symptom_support', 'profile_summary', 'record_quality'].includes(intent.key);
  const meaning = meaningAllowed && meaningText && meaningText.split(/\s+/).length <= 55 && meaningReferences.length && !UNSUPPORTED_MEANING_LANGUAGE.test(meaningText)
    ? { text: meaningText, citations: meaningReferences }
    : EMPTY_MEANING;
  if (meaning.citations.length) {
    const combinedCitations = [...new Set([...citations, ...meaning.citations])];
    citations = combinedCitations.length <= 20 ? combinedCitations : [...new Set([...meaning.citations, ...citations])].slice(0, 20);
  }
  const noExclusionsUnsubstantiated = intent.key === 'coverage' && noExclusionsClaim.test(cleanText(answer?.answer, 4000)) && !sourceConfirmsNoExclusions(sources);
  const rejectedPolicyClaim = rejectedCoverageFinding || noExclusionsUnsubstantiated;
  const memory = answer?.memoryProposal;
  if (intent.key === 'symptom_support' && !modelCitations.some((reference) => sourceByReference.get(reference)?.kind === 'external_source')) {
    return {
      answer: 'I can’t safely assess the cause or urgency of a symptom from this profile. No cited public medical source was available for this response, so I won’t offer symptom-specific guidance. If symptoms are severe, rapidly worsening, or feel dangerous, contact local emergency services. Otherwise, a qualified clinician can assess what is happening.',
      citations: [],
      meaning: EMPTY_MEANING,
      unknowns: ['No trusted public medical source was cited for this response.', 'Nura cannot diagnose or determine whether a symptom is safe.'],
      nextSteps: ['Contact a qualified clinician for an assessment.', 'Save a symptom note here if you want it in your health record.'],
      memoryProposal: null,
    };
  }
  const selfReportedSignal = ['coverage', 'profile_summary', 'record_quality'].includes(intent.key) ? null : detectUserHealthSignal(intent.question);
  const mayProposeMemory = explicitlyRequestsMemory(intent.question);
  const proposalValue = cleanText(memory?.value, 300);
  const normalizedProposalValue = normalizeEvidenceText(proposalValue);
  const proposalValueFromUserRequest = Boolean(normalizedProposalValue && normalizeEvidenceText(intent.question).includes(normalizedProposalValue));
  const proposalSourceReferences = Array.isArray(memory?.sourceReferences)
    ? [...new Set(memory.sourceReferences.filter((reference) => typeof reference === 'string' && allowed.has(reference) && MEMORY_EVIDENCE_KINDS.has(sourceByReference.get(reference)?.kind) && !isPolicyTermSource(sourceByReference.get(reference))))].slice(0, 8)
    : [];
  const memoryHasEvidence = proposalSourceReferences.length > 0 || proposalValueFromUserRequest;
  const memoryProposal = selfReportedSignal
    ? {
      label: selfReportedSignal.label,
      value: selfReportedSignal.value,
      reason: selfReportedSignal.reason,
      sourceKind: 'user_statement',
      sourceReferences: [],
    }
    : mayProposeMemory && memory?.proposed === true && cleanText(memory?.label, 140) && normalizedProposalValue && memoryHasEvidence
      ? {
        label: cleanText(memory.label, 140), value: proposalValue, reason: cleanText(memory.reason, 220),
        sourceKind: proposalSourceReferences.length ? 'selected_record' : 'user_request',
        sourceReferences: proposalSourceReferences,
      }
      : null;
  if (memoryProposal?.sourceReferences.length) citations = [...new Set([...citations, ...memoryProposal.sourceReferences])].slice(0, 20);
  const unknowns = Array.isArray(answer?.unknowns) ? answer.unknowns.map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 5) : [];
  const nextSteps = Array.isArray(answer?.nextSteps) ? answer.nextSteps.map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 3) : [];
  if (noExclusionsUnsubstantiated) {
    unknowns.unshift('The reviewed policy terms do not establish that the policy has no exclusions.');
    nextSteps.unshift('Review the full exclusions section or ask the insurer to confirm the applicable exclusions.');
  }
  if (rejectedPolicyClaim) {
    citations = coverageCitations;
    const supportedAnswer = noExclusionsUnsubstantiated && !rejectedCoverageFinding && coverageAssessments.length
      ? removeUnsupportedNoExclusionsSentences(answer?.answer)
      : '';
    if (supportedAnswer) return {
      answer: supportedAnswer,
      citations: [...new Set([...modelCitations, ...coverageCitations])].slice(0, 20),
      meaning: EMPTY_MEANING,
      coverageAssessments,
      unknowns: [...new Set(unknowns)].slice(0, 5),
      nextSteps: [...new Set(nextSteps)].slice(0, 3),
      memoryProposal: null,
    };
    return {
      answer: noExclusionsUnsubstantiated
        ? 'The reviewed policy wording does not establish that the policy has no exclusions. I have kept only findings that match the saved policy wording.'
        : 'I could not verify that policy interpretation against its cited wording, so I have left it out. The findings shown below match saved policy text.',
      citations,
      meaning: EMPTY_MEANING,
      ...(intent.key === 'coverage' ? { coverageAssessments } : {}),
      unknowns: [...new Set(unknowns)].slice(0, 5),
      nextSteps: [...new Set(nextSteps)].slice(0, 3),
      memoryProposal: null,
    };
  }
  if (intent.key === 'record_quality') {
    const qualityReview = recordQualityReview(sources);
    if (qualityReview.answer.includes('entries use different units') || recordQualityAnswerLooksOff(answer?.answer)) {
      return {
        answer: qualityReview.answer,
        citations: qualityReview.citations,
        meaning: EMPTY_MEANING,
        unknowns: qualityReview.unknowns,
        nextSteps: qualityReview.nextSteps,
        memoryProposal: null,
      };
    }
  }
  return {
    answer: cleanText(answer?.answer, 4000) || 'I could not form a clear answer from the selected information.',
    citations,
    meaning,
    ...(intent.key === 'coverage' ? { coverageAssessments } : {}),
    unknowns,
    nextSteps,
    memoryProposal,
  };
}
