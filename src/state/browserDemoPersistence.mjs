const arrayFields = [
  'topics', 'assets', 'facts', 'treatments', 'treatmentEvents', 'visits',
  'visitEvents', 'links', 'feedItems', 'savedQuestions', 'agentMessages', 'registryBriefs',
];
const stringFields = ['name', 'birthday', 'country', 'email', 'phone'];
const optionalArrayFields = ['policyReplacements', 'policyClarifications', 'intakeNotes'];
const legacySeededTopics = [
  { id: 'bp-topic', label: 'Blood pressure' },
  { id: 'cholesterol', label: 'Cholesterol' },
];
const redundantSeedFacts = [
  { id: 'demo-fact-care', label: 'Example clinic visit', value: 'Follow-up note from a sample visit', source: 'Synthetic demo clinic note' },
  { id: 'demo-fact-treatment', label: 'Example medicine entry', value: 'A sample medicine note, not a treatment instruction', source: 'Synthetic demo medicine list' },
];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function migrateUnchangedLegacySeed(snapshot, fallback) {
  const topicsMatch = snapshot.topics.length === legacySeededTopics.length
    && legacySeededTopics.every((topic, index) => snapshot.topics[index]?.id === topic.id && snapshot.topics[index]?.label === topic.label);
  if (!topicsMatch) return snapshot;
  const withoutSeededChoices = { ...snapshot, topics: fallback.topics };
  if (JSON.stringify(stableValue(withoutSeededChoices)) !== JSON.stringify(stableValue(fallback))) return snapshot;
  return { ...snapshot, topics: [] };
}

function migrateRedundantSeedExamples(snapshot) {
  const oldSampleNote = 'Synthetic demo example · not your health information.';
  const sampleNote = 'Sample information for demonstration only.';
  const sampleLabDate = '2026-09-12T09:00:00.000Z';
  const removedFactIds = new Set(snapshot.facts
    .filter((fact) => {
      const untouchedLabSummary = fact.id === 'demo-fact-lab'
        && fact.label === 'Example blood test'
        && fact.value === 'Five values listed in a sample report'
        && fact.date === sampleLabDate
        && fact.category === 'Lab results'
        && ['Synthetic demo report · page 2', 'Sample lab report'].includes(fact.source)
        && [oldSampleNote, sampleNote].includes(fact.note)
        && fact.status === 'reviewed'
        && fact.reviewState === 'user_confirmed'
        && fact.validFrom === sampleLabDate
        && fact.confidence === 1
        && fact.permissionScope === 'demo_only'
        && !fact.sourceId
        && !fact.sourceClaimId
        && !fact.validUntil;
      const untouchedExampleFact = redundantSeedFacts.some((seed) => fact.id === seed.id
        && fact.label === seed.label && fact.value === seed.value && fact.source === seed.source
        && fact.permissionScope === 'demo_only');
      const hasUserLink = snapshot.links.some((link) => link.id !== 'demo-link-lab-care'
        && (link.from === `fact:${fact.id}` || link.to === `fact:${fact.id}`));
      return (untouchedLabSummary || untouchedExampleFact) && !hasUserLink;
    })
    .map((fact) => fact.id));
  const removedAssetIds = new Set(snapshot.assets
    .filter((asset) => asset.id === 'demo-source-lab' && asset.name === 'Example blood test.pdf'
      && asset.uri === 'demo://example-blood-test.pdf' && !asset.serverSourceId)
    .map((asset) => asset.id));
  const updatedCopy = snapshot.visits.some((visit) => visit.id.startsWith('demo-visit-') && visit.source === oldSampleNote)
    || snapshot.treatments.some((item) => item.id === 'demo-treatment-01' && item.source === 'Synthetic demo medicine list')
    || snapshot.treatmentEvents.some((event) => event.id === 'demo-treatment-event-01' && event.snapshot?.source === 'Synthetic demo medicine list');
  if (!removedFactIds.size && !removedAssetIds.size && !updatedCopy) return snapshot;
  return {
    ...snapshot,
    assets: snapshot.assets.filter((asset) => !removedAssetIds.has(asset.id)),
    facts: snapshot.facts.filter((fact) => !removedFactIds.has(fact.id)),
    treatments: snapshot.treatments.map((item) => item.id === 'demo-treatment-01' && item.source === 'Synthetic demo medicine list' ? { ...item, source: 'Sample medicine list' } : item),
    treatmentEvents: snapshot.treatmentEvents.map((event) => event.id === 'demo-treatment-event-01' && event.snapshot?.source === 'Synthetic demo medicine list'
      ? { ...event, snapshot: { ...event.snapshot, source: 'Sample medicine list' } }
      : event),
    visits: snapshot.visits.map((visit) => ({
      ...visit,
      source: visit.id.startsWith('demo-visit-') && visit.source === oldSampleNote ? 'Sample information for demonstration only.' : visit.source,
      briefFactIds: (visit.briefFactIds ?? []).filter((id) => !removedFactIds.has(id)),
      briefAssetIds: (visit.briefAssetIds ?? []).filter((id) => !removedAssetIds.has(id)),
      outcomeSourceAssetIds: (visit.outcomeSourceAssetIds ?? []).filter((id) => !removedAssetIds.has(id)),
      followUpActions: visit.followUpActions?.map((action) => action.source === 'Synthetic demo follow-up · entered by you' ? { ...action, source: 'Sample follow-up note' } : action),
    })),
    links: snapshot.links.filter((link) => ![...removedFactIds].some((id) => link.from === `fact:${id}` || link.to === `fact:${id}`)),
  };
}

export function readBrowserDemoSnapshot(storage, key, fallback) {
  if (!storage) return { snapshot: fallback, warning: null };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { snapshot: fallback, warning: null };
    const parsed = JSON.parse(raw);
    const valid = parsed && typeof parsed === 'object'
      && parsed.version === 1 && parsed.demoOnly === true
      && stringFields.every((field) => typeof parsed[field] === 'string')
      && arrayFields.every((field) => Array.isArray(parsed[field]))
      && optionalArrayFields.every((field) => parsed[field] === undefined || Array.isArray(parsed[field]));
    if (!valid) return { snapshot: fallback, warning: 'Saved browser demo data could not be read. The sample workspace is open; your saved copy was left untouched.' };
    const snapshot = {
      ...fallback,
      ...parsed,
      policyReplacements: parsed.policyReplacements ?? fallback.policyReplacements ?? [],
      policyClarifications: parsed.policyClarifications ?? fallback.policyClarifications ?? [],
    };
    return { snapshot: migrateRedundantSeedExamples(migrateUnchangedLegacySeed(snapshot, fallback)), warning: null };
  } catch {
    return { snapshot: fallback, warning: 'Browser storage could not be read. Changes may not survive a refresh.' };
  }
}

export function writeBrowserDemoSnapshot(storage, key, snapshot) {
  if (!storage) throw new Error('Browser storage is unavailable.');
  storage.setItem(key, JSON.stringify({ ...snapshot, version: 1, demoOnly: true }));
}
