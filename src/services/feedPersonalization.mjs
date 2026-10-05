const healthTopicSignals = [
  { pattern: /cholesterol|lipid|\bhdl\b|\bldl\b|triglyceride|apolipoprotein|\bapo\s*b\b/i, terms: /cholesterol|lipid|\bhdl\b|\bldl\b|triglyceride|apolipoprotein|\bapo\s*b\b/i },
  { pattern: /blood pressure|hypertension|systolic|diastolic/i, terms: /blood pressure|hypertension|systolic|diastolic/i },
  { pattern: /blood sugar|glucose|diabetes|\ba1c\b/i, terms: /blood sugar|glucose|diabetes|\ba1c\b/i },
  { pattern: /heart health|cardiovascular|heart disease/i, terms: /heart|cardiovascular|cardiac|coronary/i },
  { pattern: /sleep/i, terms: /sleep|insomnia|sleeping/i },
  { pattern: /weight/i, terms: /weight|bmi/i },
];

function topicSignal(topic) {
  return healthTopicSignals.find((signal) => signal.pattern.test(String(topic ?? '')));
}

function eligibleFact(fact) {
  return fact && ['confirmed', 'reviewed'].includes(fact.status)
    && fact.reviewState === 'user_confirmed' && !fact.validUntil;
}

function isUserNote(fact) {
  return /\bnote\b/i.test(String(fact?.label ?? ''))
    || /\bnote\b/i.test(String(fact?.category ?? ''))
    || /written by you/i.test(String(fact?.source ?? ''));
}

function isSpecificResult(fact) {
  return /lab|marker|result|measurement|biometric/i.test(`${fact?.category ?? ''} ${fact?.label ?? ''}`)
    && !isUserNote(fact);
}

function displayFactLabel(fact) {
  return String(fact?.label ?? '')
    .replace(/\s*[·:-]\s*your note$/i, '')
    .replace(/^your health note$/i, 'Health')
    .trim();
}

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function sourceText(item) {
  return normalize(`${item?.title ?? ''} ${item?.detail ?? ''}`);
}

function factDateValue(fact) {
  const value = Date.parse(String(fact?.date ?? fact?.validFrom ?? ''));
  return Number.isFinite(value) ? value : 0;
}

function relatedFactsFor(item, topic, facts) {
  const signal = topicSignal(topic);
  const source = sourceText(item);
  const matches = facts.filter((fact) => {
    if (!eligibleFact(fact)) return false;
    const subject = `${fact.label ?? ''} ${fact.category ?? ''}`;
    if (signal?.terms.test(subject)) return true;
    const label = normalize(fact.label);
    return label.length >= 4 && source.includes(label);
  });
  const hasSpecificResult = matches.some(isSpecificResult);
  return matches.filter((fact) => !hasSpecificResult || !isUserNote(fact)).sort((a, b) => {
    const aLabel = normalize(a.label);
    const bLabel = normalize(b.label);
    return (Number(source.includes(bLabel)) - Number(source.includes(aLabel)))
      || (factDateValue(b) - factDateValue(a));
  }).filter((fact, index, all) => all.findIndex((candidate) => normalize(displayFactLabel(candidate)) === normalize(displayFactLabel(fact))) === index).slice(0, 2);
}

function relevantTreatmentsFor(item, topic, treatments) {
  const source = sourceText(item);
  const topicMedicine = String(topic).match(/^medicine\s*[·:-]\s*(.+)$/i)?.[1]?.trim().toLowerCase();
  return treatments.filter((treatment) => {
    if (!treatment || treatment.status !== 'current' || !treatment.name?.trim()) return false;
    const name = normalize(treatment.name);
    const purpose = normalize(treatment.purpose);
    return source.includes(name)
      || (topicMedicine && (topicMedicine === name || topicMedicine.includes(name) || name.includes(topicMedicine)))
      || (purpose.length >= 4 && (source.includes(purpose) || normalize(topic).includes(purpose)));
  }).filter((treatment, index, all) => all.findIndex((candidate) => normalize(candidate.name) === normalize(treatment.name)) === index).slice(0, 1);
}

function contextualHeadline(topic, markerLabel, item) {
  const sourceClues = `${item?.title ?? ''} ${item?.detail ?? ''}`.toLowerCase();
  if (markerLabel) {
    const shortMarker = markerLabel.replace(/\bcholesterol\b/i, '').trim() || markerLabel;
    if (/\b(diet|food|eating|nutrition)\b/.test(sourceClues)) return `Food and ${shortMarker}, explained`;
    if (/\b(plaque|arter(?:y|ies)|atherosclero|stroke|coronary)\b/.test(sourceClues)) return `How ${shortMarker} relates to artery health`;
    if (/\b(test|measure|measured|panel|result)\b/.test(sourceClues)) {
      const article = /^(LDL|HDL|ApoB)\b/i.test(shortMarker) ? 'an' : 'a';
      return `What ${article} ${shortMarker} test measures`;
    }
    return `Your ${shortMarker} result, in context`;
  }
  if (/\bldl\b.*\bhdl\b|\bhdl\b.*\bldl\b/i.test(topic)) {
    if (/triglyceride/i.test(sourceClues)) return 'LDL, HDL and triglycerides: how they differ';
    if (/\b(test|measure|panel)\b/.test(sourceClues)) return 'What an LDL and HDL panel measures';
    if (/\b(plaque|arter(?:y|ies)|heart disease|stroke)\b/.test(sourceClues)) return 'How LDL and HDL relate to heart health';
    return 'LDL and HDL, side by side';
  }
  if (/cholesterol|lipid/i.test(topic)) {
    if (/\b(diet|food|eating|nutrition)\b/.test(sourceClues)) return 'What food has to do with cholesterol';
    if (/\b(test|measure|panel)\b/.test(sourceClues)) return 'What a cholesterol test can tell you';
    if (/\b(plaque|arter(?:y|ies)|heart disease|stroke)\b/.test(sourceClues)) return 'How cholesterol connects to heart health';
    if (/\bquestions?\b/i.test(item?.title ?? '')) return 'Cholesterol questions, answered';
    if (/\btools?\b|\bresources?\b/i.test(item?.title ?? '')) return 'A practical place to start with cholesterol';
    if (/\bwhat is cholesterol\b/i.test(item?.title ?? '')) return 'What cholesterol does in your body';
    return 'Cholesterol, explained in plain language';
  }
  if (/\bquestions?\b/i.test(item?.title ?? '')) return `${topic} questions, answered`;
  if (/\btools?\b|\bresources?\b/i.test(item?.title ?? '')) return `A practical place to start with ${topic.toLowerCase()}`;
  if (/\b(test|measure|panel)\b/.test(sourceClues)) return `What a ${topic.toLowerCase()} test can tell you`;
  if (/\b(health information|overview|guide|what is)\b/i.test(item?.title ?? '')) return `${topic}, explained in plain language`;
  if (/blood pressure|hypertension/i.test(topic)) return 'Blood pressure, in plain language';
  if (/blood sugar|glucose|a1c/i.test(topic)) return 'What blood sugar tests measure';
  if (/medicine\s*[·:-]\s*/i.test(topic)) return `${topic.split(/[·:-]/).at(-1).trim()}: what to know`;
  if (/sleep/i.test(topic)) return 'Sleep health, in plain language';
  return `A useful starting point for ${topic}`;
}

function learningAim(topic, item, relatedFacts) {
  const source = sourceText(item);
  const marker = relatedFacts.find((fact) => /lab|marker|result|measurement|biometric/i.test(`${fact.category ?? ''} ${fact.label ?? ''}`))?.label;
  const focus = String(marker ?? topic).replace(/\s+/g, ' ').trim();
  const lipidContext = /\b(ldl|hdl|cholesterol|lipid)\b/i.test(`${topic} ${source}`);
  if (lipidContext && (/\bldl\b.*\bhdl\b|\bhdl\b.*\bldl\b|two types|difference between|\bdiffer\b|\bversus\b|\bvs\.?\b/i.test(source))) {
    return `how LDL and HDL differ and what their roles are`;
  }
  if (/\b(diet|food|eating|nutrition)\b/.test(source)) return `how food and eating patterns are discussed in relation to ${String(topic).toLowerCase()}`;
  if (/\b(test|measure|measured|panel|result)\b/.test(source)) return `what ${focus} tests measure and which terms appear in reports`;
  if (/\b(side effect|medication|medicine|drug|treatment|therapy)\b/.test(source)) return `the treatment terms and questions this source covers for ${String(topic).toLowerCase()}`;
  if (/\b(symptom|signs|when to seek|warning signs)\b/.test(source)) return `the symptoms and signs this source discusses for ${String(topic).toLowerCase()}`;
  if (/\b(plaque|arter(?:y|ies)|heart disease|stroke|risk)\b/.test(source)) return `how ${String(topic).toLowerCase()} is discussed in relation to heart health`;
  if (/\bldl\b.*\bhdl\b|\bhdl\b.*\bldl\b/i.test(topic)) return `how LDL and HDL differ and what their roles are`;
  return `the basics of ${String(topic).toLowerCase()} and the questions this source can help you explore`;
}

function takeAway(topic, item, relatedFacts, treatments) {
  const aim = learningAim(topic, item, relatedFacts);
  const labels = relatedFacts.map(displayFactLabel).filter(Boolean);
  const medicines = treatments.map((treatment) => String(treatment.name).trim()).filter(Boolean);
  const hasResult = relatedFacts.some((fact) => /lab|marker|result|measurement|biometric/i.test(`${fact.category ?? ''} ${fact.label ?? ''}`));
  const hasSymptom = relatedFacts.some((fact) => /symptom/i.test(`${fact.category ?? ''} ${fact.label ?? ''}`));
  const hasUserNote = relatedFacts.some(isUserNote);
  const savedContext = labels.length > 1
    ? `your saved health details about ${labels.join(' and ')}`
    : labels.length
      ? `your saved ${labels[0]} ${hasSymptom || hasUserNote ? 'note' : hasResult ? 'result' : 'record'}`
      : '';
  const medicineContext = medicines.length ? `, plus your current ${medicines[0]} record` : '';

  if (labels.length || medicines.length) {
    const context = labels.length ? `${savedContext}${medicineContext}` : `your current ${medicines[0]} record`;
    const boundary = [
      hasResult ? 'It does not interpret your result.' : '',
      hasSymptom ? 'It does not explain the cause of your symptom.' : '',
      medicines.length ? 'It does not assess your medicine or suggest changes.' : '',
    ].filter(Boolean).join(' ');
    return `This source may be useful in light of ${context}. It can help you understand ${aim} and prepare focused questions for your care team. ${boundary}`.trim();
  }

  return `For your ${String(topic).trim()} focus, this source explains ${aim}. Use it to explore a question that matters to you.`;
}

function cleanHealthText(value, maxLength, excludedIdentifiers = []) {
  let text = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const identifier of excludedIdentifiers) {
    const cleanIdentifier = String(identifier ?? '').trim();
    if (!cleanIdentifier) continue;
    const escaped = cleanIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'gi'), '$1').replace(/\s+/g, ' ').trim();
  }
  if (!text || /\b(?:patient|member|policy|account|claim)\s*(?:id|number|name)\b|\b(?:name|email|phone|telephone|address|date of birth|dob)\s*[:#-]/i.test(text)) return '';
  if (/\bmy\s+(?:name|email|phone|address|date of birth)\s+is\b/i.test(text) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) return '';
  return text.slice(0, maxLength);
}

/** Select the smallest already-confirmed health context relevant to a source. */
export function selectFeedPersonalContext(item, facts = [], treatments = [], excludedIdentifiers = []) {
  const fullTopic = String(item?.topic ?? '').trim() || 'your selected health area';
  const relatedFacts = relatedFactsFor(item, fullTopic, facts).map((fact) => ({
    label: cleanHealthText(displayFactLabel(fact), 80, excludedIdentifiers),
    value: cleanHealthText(fact.value, 120, excludedIdentifiers),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(fact.date ?? '').slice(0, 10)) ? String(fact.date).slice(0, 10) : '',
  })).filter((fact) => fact.label && fact.value);
  const relatedTreatments = relevantTreatmentsFor(item, fullTopic, treatments).map((treatment) => ({
    name: cleanHealthText(treatment.name, 80, excludedIdentifiers),
    purpose: cleanHealthText(treatment.purpose, 100, excludedIdentifiers),
  })).filter((treatment) => treatment.name);
  return { facts: relatedFacts.slice(0, 2), treatments: relatedTreatments.slice(0, 1) };
}

/** Create a source-specific reading note from accepted local context; nothing is sent to search providers. */
export function personalizeFeedItem(item, facts = [], treatments = []) {
  const fullTopic = String(item?.topic ?? '').trim() || 'your selected health area';
  const topic = fullTopic.match(/^medicine\s*[·:-]\s*(.+)$/i)?.[1]?.trim() || fullTopic.split(/\s+·\s+/)[0]?.trim() || fullTopic;
  const relatedFacts = relatedFactsFor(item, fullTopic, facts);
  const relatedTreatments = relevantTreatmentsFor(item, fullTopic, treatments);
  const headlineFact = relatedFacts.find(isSpecificResult);
  return {
    headline: contextualHeadline(fullTopic, headlineFact?.label ?? null, item),
    benefit: takeAway(topic, item, relatedFacts, relatedTreatments),
    relatedFactLabel: relatedFacts[0] ? displayFactLabel(relatedFacts[0]) : null,
    relatedFactLabels: relatedFacts.map(displayFactLabel),
    relatedTreatmentName: relatedTreatments[0]?.name ?? null,
  };
}
