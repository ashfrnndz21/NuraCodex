/** Return a concise first view for long answers without changing the stored answer. */
export function answerFirstView(answer, maxCharacters = 200) {
  const text = String(answer ?? '');
  const limit = Math.max(120, Math.floor(Number(maxCharacters) || 200));
  if (text.length <= limit) return { text, expandable: false };

  const sample = text.slice(0, limit + 1);
  const sentenceEnds = [...sample.matchAll(/[.!?](?:[”’"')\]]*)?(?=\s|$)/g)];
  const sentenceEnd = sentenceEnds
    .map((match) => (match.index ?? 0) + match[0].length)
    .find((end) => end <= limit);
  const wordEnd = sample.lastIndexOf(' ', limit);
  const end = sentenceEnd ?? (wordEnd > 0 ? wordEnd : limit);

  return { text: text.slice(0, end).trimEnd(), expandable: true };
}

/** Show meaning only when it names a returned public source and stays compact. */
export function askMeaningView(meaning, sources = []) {
  const text = typeof meaning?.text === 'string' ? meaning.text.trim() : '';
  if (!text || text.length > 500 || text.split(/\s+/).length > 55) return null;
  const sourceByReference = new Map((Array.isArray(sources) ? sources : [])
    .filter((source) => source && source.kind === 'external_source' && typeof source.reference === 'string')
    .map((source) => [source.reference.trim(), source]));
  const citations = [...new Set((Array.isArray(meaning?.citations) ? meaning.citations : [])
    .filter((reference) => typeof reference === 'string')
    .map((reference) => reference.trim())
    .filter((reference) => reference && sourceByReference.has(reference)))];
  return citations.length ? { text, citations, sources: citations.map((reference) => sourceByReference.get(reference)) } : null;
}

/**
 * Build a source-bounded first view for Ask Nura. Evidence is included only
 * when the answer explicitly cited the matching returned source reference.
 * @param {{ answer?: string, citations?: string[], unknowns?: string[], sources?: Array<{ reference: string, id: string, title: string, detail: string, date: string, source: string, status: string, kind: string }>, excludedReferences?: string[], maxCharacters?: number, evidenceCharacters?: number }} options
 */
export function askAnswerFirstView({ answer, citations = [], unknowns = [], sources = [], excludedReferences = [], maxCharacters = 220, evidenceCharacters = 150 } = {}) {
  const response = answerFirstView(answer, maxCharacters);
  const references = [...new Set((Array.isArray(citations) ? citations : [])
    .filter((reference) => typeof reference === 'string')
    .map((reference) => reference.trim())
    .filter(Boolean))];
  const sourceByReference = new Map((Array.isArray(sources) ? sources : [])
    .filter((source) => source && typeof source.reference === 'string' && source.reference.trim())
    .map((source) => [source.reference.trim(), source]));
  const excluded = new Set((Array.isArray(excludedReferences) ? excludedReferences : [])
    .filter((reference) => typeof reference === 'string')
    .map((reference) => reference.trim())
    .filter(Boolean));
  const suppressedReferences = references.filter((reference) => excluded.has(reference));
  const evidence = references.filter((reference) => !excluded.has(reference)).map((reference) => {
    const source = sourceByReference.get(reference);
    const detail = source && typeof source.detail === 'string' ? answerFirstView(source.detail, evidenceCharacters) : null;
    return { reference, source: source ?? null, detail };
  });
  const unclear = (Array.isArray(unknowns) ? unknowns : [])
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  const evidenceGroups = groupAskEvidence(evidence);

  return {
    answer: String(answer ?? ''),
    shortAnswer: response.text,
    answerExpandable: response.expandable,
    evidence,
    evidenceGroups,
    suppressedReferences,
    unclear,
    expandable: response.expandable || evidence.some((item) => item.detail?.expandable),
  };
}

/** Keep different evidence origins visibly separate in the first view. */
export function groupAskEvidence(evidence = []) {
  const groups = { records: [], documentDetails: [], selectedAreas: [], savedLinks: [], publicSources: [], other: [], unavailable: [] };
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (!item?.source) { groups.unavailable.push(item); continue; }
    if (['user_record', 'treatment_record', 'care_visit'].includes(item.source.kind)) groups.records.push(item);
    else if (item.source.kind === 'document_context') groups.documentDetails.push(item);
    else if (item.source.kind === 'chosen_topic') groups.selectedAreas.push(item);
    else if (item.source.kind === 'user_link') groups.savedLinks.push(item);
    else if (item.source.kind === 'external_source') groups.publicSources.push(item);
    else groups.other.push(item);
  }
  return groups;
}

/** References already represented by the dedicated policy coverage panel. */
export function coveragePanelReferences(assessments = [], sources = []) {
  const availableSources = new Set((Array.isArray(sources) ? sources : [])
    .filter((source) => typeof source?.reference === 'string')
    .map((source) => source.reference.trim())
    .filter(Boolean));
  const references = new Set();
  for (const assessment of Array.isArray(assessments) ? assessments : []) {
    if (typeof assessment?.policyReference === 'string' && assessment.policyReference.trim()) references.add(assessment.policyReference.trim());
    for (const reference of Array.isArray(assessment?.relatedHealthReferences) ? assessment.relatedHealthReferences : []) {
      if (typeof reference === 'string' && availableSources.has(reference.trim())) references.add(reference.trim());
    }
  }
  return [...references];
}
