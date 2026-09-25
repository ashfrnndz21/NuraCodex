const arrayFields = [
  'topics', 'assets', 'facts', 'treatments', 'treatmentEvents', 'visits',
  'visitEvents', 'links', 'feedItems', 'savedQuestions', 'agentMessages', 'registryBriefs',
];
const stringFields = ['name', 'birthday', 'country', 'email', 'phone'];
const optionalArrayFields = ['policyReplacements', 'intakeNotes'];
const legacySeededTopics = [
  { id: 'bp-topic', label: 'Blood pressure' },
  { id: 'cholesterol', label: 'Cholesterol' },
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
    const snapshot = { ...fallback, ...parsed, policyReplacements: parsed.policyReplacements ?? fallback.policyReplacements ?? [] };
    return { snapshot: migrateUnchangedLegacySeed(snapshot, fallback), warning: null };
  } catch {
    return { snapshot: fallback, warning: 'Browser storage could not be read. Changes may not survive a refresh.' };
  }
}

export function writeBrowserDemoSnapshot(storage, key, snapshot) {
  if (!storage) throw new Error('Browser storage is unavailable.');
  storage.setItem(key, JSON.stringify({ ...snapshot, version: 1, demoOnly: true }));
}
