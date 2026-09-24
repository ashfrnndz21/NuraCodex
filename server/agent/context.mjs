import { randomUUID } from 'node:crypto';
const MAX_ITEMS = 100;
const LINK_RELATIONS = new Set(['same_source', 'happened_around', 'measured_during', 'treatment_for', 'related_by_me', 'user_note']);
const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'based', 'been', 'before', 'between', 'can', 'could', 'does', 'from', 'have', 'here', 'into', 'just', 'like', 'more', 'most', 'my', 'near', 'need', 'not', 'only', 'other', 'please', 'should', 'some', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'this', 'those', 'through', 'what', 'when', 'where', 'which', 'with', 'would', 'your']);
const cleanText = (value, limit = 500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export function sanitizeRunBody(input) {
  if (!input || input.consentConfirmed !== true) throw new Error('Please confirm before sharing your selected health details for this answer.');
  const question = cleanText(input.question, 2000);
  if (!question) throw new Error('Write a question first.');
  const mode = input.mode === 'symptom_support' ? 'symptom_support' : 'general';
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  const facts = Array.isArray(context.facts) ? context.facts.slice(0, MAX_ITEMS).map((fact) => ({
    id: cleanText(fact?.id, 96), label: cleanText(fact?.label, 140), value: cleanText(fact?.value, 500),
    date: cleanText(fact?.date, 64), category: cleanText(fact?.category, 80), source: cleanText(fact?.source, 120), status: cleanText(fact?.status, 32),
  })).filter((fact) => fact.id && fact.label && fact.value && !(mode === 'symptom_support' && /medication|medicine|drug|dose|treatment|prescri|pharma|care plan|tablet|capsule|\b\d+\s?(?:mg|mcg|μg|ml|units?)\b/i.test(`${fact.category} ${fact.label} ${fact.value}`))) : [];
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
  const history = mode === 'symptom_support' ? [] : Array.isArray(input.history) ? input.history.slice(-8).map((message) => ({ role: message?.role === 'assistant' ? 'assistant' : 'user', content: cleanText(message?.content, 2000) })).filter((message) => message.content) : [];
  const runId = typeof input.runId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(input.runId) ? input.runId : randomUUID();
  return { runId, mode, question, context: { facts, topics, links, treatments, visits }, history, externalSearchConsent: input.externalSearchConsent === true, treatmentContextConsent: input.treatmentContextConsent === true && mode !== 'symptom_support' && treatments.length > 0, visitContextConsent: input.visitContextConsent === true && mode !== 'symptom_support' && visits.length > 0 };
}

export function classifyIntent(question) {
  const q = question.toLowerCase();
  if (/re[- ]?contextualiz(?:e|ation)/.test(q)) return { key: 'profile_summary', label: 'profile recontextualization' };
  if (/first-pass synthesis|synthesi[sz]e.*profile/.test(q)) return { key: 'profile_summary', label: 'first profile synthesis' };
  if (/insurance|coverage|covered|claim|benefit|policy|deductible|copay/.test(q)) return { key: 'coverage', label: 'insurance or coverage' };
  if (/medicine|medication|drug|dose|tablet|prescription|treatment|side effect/.test(q)) return { key: 'treatment', label: 'treatment or medicines' };
  if (/lab|blood|result|test|cholesterol|sugar|pressure|measurement|trend/.test(q)) return { key: 'results', label: 'test results or measurements' };
  if (/timeline|history|when|changed|before|since/.test(q)) return { key: 'history', label: 'health history' };
  if (/\b(search|web|article|articles|latest|guideline|guidelines|research|evidence|source|sources)\b/.test(q)) return { key: 'education', label: 'general health information' };
  return { key: 'profile', label: 'your saved health information' };
}

const tokens = (value) => cleanText(value, 2000).toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 2 && !STOP_WORDS.has(word)) ?? [];
const toolSearch = { type: 'function', name: 'search_profile', description: 'Search only the health facts, selected health areas, user-authored links, treatment records, and visit history explicitly supplied for this run. Do not infer diagnoses or medical relationships.', strict: true, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } };
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
    ...context.facts.map((fact) => ({ id: `fact:${fact.id}`, title: fact.label, detail: fact.value, date: fact.date, source: fact.source, status: fact.status, kind: 'user_record', category: fact.category })),
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
  ];
  const byId = new Map(allRecords.map((record) => [record.id, record]));
  function searchProfile(query) {
    const queryWords = [...new Set(tokens(query))];
    const ranked = allRecords.map((record) => {
      const haystack = `${record.title} ${record.detail} ${record.category ?? ''} ${record.source ?? ''}`.toLowerCase();
      const score = queryWords.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { record, score };
    }).filter((item) => queryWords.length ? item.score > 0 : false).sort((a, b) => b.score - a.score).slice(0, 8);
    const results = ranked.map(({ record }) => issueReference(record));
    const ids = new Set(results.map((record) => record.id));
    const relatedLinks = context.links.filter((link) => {
      const from = link.from.startsWith('fact:') || link.from.startsWith('topic:') ? link.from : `fact:${link.from}`;
      const to = link.to.startsWith('fact:') || link.to.startsWith('topic:') ? link.to : `fact:${link.to}`;
      return ids.has(from) || ids.has(to);
    }).map((link) => {
      const fromId = link.from.startsWith('fact:') || link.from.startsWith('topic:') ? link.from : `fact:${link.from}`;
      const toId = link.to.startsWith('fact:') || link.to.startsWith('topic:') ? link.to : `fact:${link.to}`;
      const from = byId.get(fromId)?.title ?? 'Saved item';
      const to = byId.get(toId)?.title ?? 'Saved item';
      const source = issueReference({ id: `link:${link.id}`, title: `You linked ${from} to ${to}`, detail: `Your recorded association (${link.relationType.replaceAll('_', ' ')}): ${link.label}`, date: link.createdAt, source: 'Linked by you', status: 'user_authored', kind: 'user_link', category: 'Relationship' });
      return { id: source.id, reference: source.reference, from, to, relationType: link.relationType, label: link.label, authoredBy: 'user', createdAt: link.createdAt };
    });
    return { results, userAuthoredLinks: relatedLinks };
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
  function execute(name, args) {
    if (name === 'search_profile') return searchProfile(cleanText(args?.query, 240));
    if (name === 'get_saved_record') return getRecord(cleanText(args?.recordId, 120)) ?? { unavailable: true, note: 'That record was not returned by this run’s profile search.' };
    return { unavailable: true, note: 'This tool is not available in Nura.' };
  }
  function sources() { return [...known.values(), ...external.values()]; }
  return { execute, sources, addExternalSources };
}

export function validateAnswer(answer, sources, intent) {
  const allowed = new Set(sources.map((source) => source.reference));
  const sourceByReference = new Map(sources.map((source) => [source.reference, source]));
  const coverageAssessments = intent.key === 'coverage' && Array.isArray(answer?.coverageAssessments)
    ? answer.coverageAssessments.slice(0, 8).flatMap((item) => {
      const policyReference = cleanText(item?.policyReference, 8);
      const policySource = sourceByReference.get(policyReference);
      const policyKind = cleanText(item?.kind, 32);
      const detail = cleanText(item?.detail, 320);
      const isPolicyTerm = policySource?.kind === 'user_record' && /^(insurance coverage|coverage_term)$/i.test(cleanText(policySource.category, 80));
      if (!isPolicyTerm || !detail || !['explicit_benefit', 'explicit_limit', 'explicit_exclusion', 'unclear'].includes(policyKind)) return [];
      const relatedHealthReferences = Array.isArray(item?.relatedHealthReferences)
        ? [...new Set(item.relatedHealthReferences.filter((reference) => {
          if (typeof reference !== 'string' || !allowed.has(reference)) return false;
          const source = sourceByReference.get(reference);
          return ['user_record', 'treatment_record', 'care_visit'].includes(source?.kind) && !/^(insurance coverage|coverage_term)$/i.test(cleanText(source.category, 80));
        }))].slice(0, 5)
        : [];
      return [{ kind: policyKind, policyReference, detail, relatedHealthReferences }];
    })
    : [];
  const modelCitations = Array.isArray(answer?.citations) ? answer.citations.filter((value) => typeof value === 'string' && allowed.has(value)) : [];
  const coverageCitations = coverageAssessments.flatMap((item) => [item.policyReference, ...item.relatedHealthReferences]);
  const citations = [...new Set([...modelCitations, ...coverageCitations])].slice(0, 20);
  const memory = answer?.memoryProposal;
  if (intent.key === 'symptom_support' && !modelCitations.some((reference) => sourceByReference.get(reference)?.kind === 'external_source')) {
    return {
      answer: 'I can’t safely assess the cause or urgency of a symptom from this profile. No cited public medical source was available for this response, so I won’t offer symptom-specific guidance. If symptoms are severe, rapidly worsening, or feel dangerous, contact local emergency services. Otherwise, a qualified clinician can assess what is happening.',
      citations: [],
      unknowns: ['No trusted public medical source was cited for this response.', 'Nura cannot diagnose or determine whether a symptom is safe.'],
      nextSteps: ['Contact a qualified clinician for an assessment.', 'Save a symptom note here if you want it in your health record.'],
      memoryProposal: null,
    };
  }
  const mayProposeMemory = /\b(remember|save that|add this to my profile|put this in my profile)\b/i.test(intent.question);
  const memoryProposal = mayProposeMemory && memory?.proposed === true && cleanText(memory?.label, 140) && cleanText(memory?.value, 300)
    ? { label: cleanText(memory.label, 140), value: cleanText(memory.value, 300), reason: cleanText(memory.reason, 220) }
    : null;
  return {
    answer: cleanText(answer?.answer, 4000) || 'I could not form a clear answer from the selected information.',
    citations,
    ...(intent.key === 'coverage' ? { coverageAssessments } : {}),
    unknowns: Array.isArray(answer?.unknowns) ? answer.unknowns.map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 5) : [],
    nextSteps: Array.isArray(answer?.nextSteps) ? answer.nextSteps.map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 3) : [],
    memoryProposal,
  };
}
