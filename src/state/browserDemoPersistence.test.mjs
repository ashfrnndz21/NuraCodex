import assert from 'node:assert/strict';
import test from 'node:test';
import { readBrowserDemoSnapshot, writeBrowserDemoSnapshot } from './browserDemoPersistence.mjs';
import { removePolicyClarification, updatePolicyClarification } from '../services/policyClarification.mjs';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

const fallback = {
  version: 1, demoOnly: true, name: '', birthday: '', country: '', email: '', phone: '',
  topics: [], assets: [], intakeNotes: [], facts: [], treatments: [], treatmentEvents: [], visits: [], policyReplacements: [], policyClarifications: [],
  visitEvents: [], links: [], feedItems: [], savedQuestions: [], agentMessages: [], registryBriefs: [],
};

test('browser demo snapshot round-trips profile, facts, source links and agent history', () => {
  const storage = memoryStorage();
  const profileSummary = { answer: 'The sample profile includes a selected cholesterol focus.', citations: ['R1'], unknowns: ['No result values were provided.'], nextSteps: ['Add a recent report if useful.'], memoryProposal: null, revision: true };
  const snapshot = { ...fallback, name: 'Riley Sample', facts: [{ id: 'f1', sourceId: 's1' }], links: [{ id: 'l1' }], agentMessages: [{ id: 'm1', profileSummary }] };
  writeBrowserDemoSnapshot(storage, 'nura-demo', snapshot);
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.equal(loaded.warning, null);
  assert.deepEqual(loaded.snapshot, snapshot);
});

test('browser demo snapshot round-trips user-reported insurer clarifications separately from policy facts', () => {
  const storage = memoryStorage();
  const clarification = {
    id: 'reply-1', sourceId: 'policy-source', sourceClaimId: 'claim-7', sourceFactId: 'fact-7',
    termLabel: 'Outpatient care', question: 'Which rate schedule is used?',
    response: 'The insurer said it uses the 2026 published schedule.',
    reportedAt: '2026-09-26T08:00:00.000Z', status: 'user_reported',
  };
  writeBrowserDemoSnapshot(storage, 'nura-demo', { ...fallback, policyClarifications: [clarification] });
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.deepEqual(loaded.snapshot.policyClarifications, [clarification]);
  assert.deepEqual(loaded.snapshot.facts, []);
});

test('browser snapshot persists insurer-note edits and deletion without changing source linkage or policy facts', () => {
  const storage = memoryStorage();
  const clarification = {
    id: 'reply-1', sourceId: 'policy-source', sourceClaimId: 'claim-7', sourceFactId: 'fact-7',
    termLabel: 'Outpatient care', question: 'Which rate schedule is used?',
    response: 'The insurer said it uses the 2026 published schedule.',
    reportedAt: '2026-09-26T08:00:00.000Z', status: 'user_reported',
  };
  const facts = [{ id: 'fact-7', label: 'Outpatient care', category: 'Insurance coverage', status: 'confirmed', sourceId: 'policy-source', sourceClaimId: 'claim-7' }];
  const assets = [{ purpose: 'insurance', serverSourceId: 'policy-source' }];
  const edited = updatePolicyClarification({ clarification, response: 'The insurer confirmed the 2026 schedule.', facts, assets });
  writeBrowserDemoSnapshot(storage, 'nura-demo', { ...fallback, facts, policyClarifications: [edited] });
  const afterEdit = readBrowserDemoSnapshot(storage, 'nura-demo', fallback).snapshot;
  assert.deepEqual(afterEdit.policyClarifications, [edited]);
  assert.equal(afterEdit.policyClarifications[0].sourceId, clarification.sourceId);
  assert.equal(afterEdit.policyClarifications[0].sourceClaimId, clarification.sourceClaimId);
  assert.equal(afterEdit.policyClarifications[0].sourceFactId, clarification.sourceFactId);
  assert.deepEqual(afterEdit.facts, facts);

  const deleted = removePolicyClarification(afterEdit.policyClarifications, clarification.id);
  writeBrowserDemoSnapshot(storage, 'nura-demo', { ...afterEdit, policyClarifications: deleted });
  const afterDelete = readBrowserDemoSnapshot(storage, 'nura-demo', fallback).snapshot;
  assert.deepEqual(afterDelete.policyClarifications, []);
  assert.deepEqual(afterDelete.facts, facts);
});

test('browser demo snapshot restores an unsaved health description for review', () => {
  const storage = memoryStorage();
  const intakeNotes = [{ id: 'n1', text: 'I want to keep track of morning stiffness.', topicId: 'joints', topicLabel: 'Joints and movement', createdAt: '2026-09-25T08:00:00.000Z' }];
  writeBrowserDemoSnapshot(storage, 'nura-demo', { ...fallback, intakeNotes });
  assert.deepEqual(readBrowserDemoSnapshot(storage, 'nura-demo', fallback).snapshot.intakeNotes, intakeNotes);
});

test('browser demo snapshot preserves saved and hidden reading across re-entry', () => {
  const storage = memoryStorage();
  const feedItems = [
    { id: 'saved-reading', title: 'Saved source', saved: true, dismissed: false },
    { id: 'hidden-reading', title: 'Hidden source', saved: false, dismissed: true },
  ];
  writeBrowserDemoSnapshot(storage, 'nura-demo', { ...fallback, feedItems });
  assert.deepEqual(readBrowserDemoSnapshot(storage, 'nura-demo', fallback).snapshot.feedItems, feedItems);
});

test('an explicitly cleared empty workspace stays empty after refresh', () => {
  const storage = memoryStorage();
  writeBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.deepEqual(readBrowserDemoSnapshot(storage, 'nura-demo', { ...fallback, facts: [{ id: 'seed' }] }).snapshot, fallback);
});

test('older version-one workspaces migrate with an empty policy relationship list', () => {
  const storage = memoryStorage();
  const { policyReplacements: _policyReplacements, ...oldSnapshot } = fallback;
  storage.setItem('nura-demo', JSON.stringify(oldSnapshot));
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.equal(loaded.warning, null);
  assert.deepEqual(loaded.snapshot.policyReplacements, []);
  assert.deepEqual(loaded.snapshot.policyClarifications, []);
  assert.equal(loaded.snapshot.name, '');
  assert.deepEqual(loaded.snapshot.intakeNotes, []);
});

test('the untouched legacy sample seed clears its preselected focus bubbles but keeps sample records', () => {
  const storage = memoryStorage();
  const nextFallback = {
    ...fallback,
    assets: [{ id: 'demo-report', name: 'Example report.pdf' }],
    facts: [{ id: 'demo-lab', label: 'Example blood test' }],
  };
  storage.setItem('nura-demo', JSON.stringify({
    ...nextFallback,
    topics: [{ id: 'bp-topic', label: 'Blood pressure' }, { id: 'cholesterol', label: 'Cholesterol' }],
  }));
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', nextFallback);
  assert.deepEqual(loaded.snapshot.topics, []);
  assert.deepEqual(loaded.snapshot.assets, nextFallback.assets);
  assert.deepEqual(loaded.snapshot.facts, nextFallback.facts);
});

test('migrates duplicate example rows without removing user-edited records or processed files', () => {
  const storage = memoryStorage();
  const sampleAsset = { id: 'demo-source-lab', name: 'Example blood test.pdf', uri: 'demo://example-blood-test.pdf' };
  const linkedSampleAsset = { id: 'user-added-file', name: 'Follow-up report.pdf', uri: 'file:///follow-up-report.pdf', serverSourceId: 'saved-source' };
  const duplicateCareFact = { id: 'demo-fact-care', label: 'Example clinic visit', value: 'Follow-up note from a sample visit', source: 'Synthetic demo clinic note', permissionScope: 'demo_only' };
  const sampleLabFact = { id: 'demo-fact-lab', label: 'Example blood test', value: 'Five values listed in a sample report', date: '2026-09-12T09:00:00.000Z', category: 'Lab results', source: 'Synthetic demo report · page 2', status: 'reviewed', note: 'Synthetic demo example · not your health information.', reviewState: 'user_confirmed', validFrom: '2026-09-12T09:00:00.000Z', confidence: 1, permissionScope: 'demo_only' };
  const userEditedFact = { id: 'user-edited-treatment', label: 'Example medicine entry', value: 'My corrected detail', source: 'Synthetic demo medicine list', permissionScope: 'demo_only' };
  const untouchedDuplicate = { id: 'demo-fact-treatment', label: 'Example medicine entry', value: 'A sample medicine note, not a treatment instruction', source: 'Synthetic demo medicine list', permissionScope: 'demo_only' };
  const sampleVisit = { id: 'demo-visit-completed', source: 'Synthetic demo example · not your health information.', briefFactIds: ['demo-fact-care'], briefAssetIds: ['demo-source-lab'], outcomeSourceAssetIds: ['demo-source-lab'], followUpActions: [{ id: 'demo-follow-up-01', source: 'Synthetic demo follow-up · entered by you' }] };
  storage.setItem('nura-demo', JSON.stringify({
    ...fallback,
    assets: [sampleAsset, linkedSampleAsset],
    facts: [duplicateCareFact, sampleLabFact, untouchedDuplicate, userEditedFact],
    treatments: [{ id: 'demo-treatment-01', source: 'Synthetic demo medicine list' }],
    treatmentEvents: [{ id: 'demo-treatment-event-01', snapshot: { source: 'Synthetic demo medicine list' } }],
    visits: [sampleVisit],
    links: [{ id: 'demo-link-lab-care', from: 'fact:demo-fact-lab', to: 'fact:demo-fact-care' }],
  }));
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.deepEqual(loaded.snapshot.assets, [linkedSampleAsset]);
  assert.deepEqual(loaded.snapshot.facts, [userEditedFact]);
  assert.deepEqual(loaded.snapshot.visits[0].briefFactIds, []);
  assert.deepEqual(loaded.snapshot.visits[0].briefAssetIds, []);
  assert.deepEqual(loaded.snapshot.visits[0].outcomeSourceAssetIds, []);
  assert.equal(loaded.snapshot.visits[0].source, 'Sample information for demonstration only.');
  assert.equal(loaded.snapshot.visits[0].followUpActions[0].source, 'Sample follow-up note');
  assert.equal(loaded.snapshot.facts.some((fact) => fact.id === 'demo-fact-lab'), false);
  assert.equal(loaded.snapshot.treatments[0].source, 'Sample medicine list');
  assert.equal(loaded.snapshot.treatmentEvents[0].snapshot.source, 'Sample medicine list');
  assert.deepEqual(loaded.snapshot.links, []);
});

test('legacy sample lab summary is kept when the person edited or linked it', () => {
  const storage = memoryStorage();
  const editedLabFact = { id: 'demo-fact-lab', label: 'Example blood test', value: 'My corrected result', date: '2026-09-12T09:00:00.000Z', category: 'Lab results', source: 'Sample lab report', status: 'reviewed', note: 'I edited this example.', reviewState: 'user_confirmed', validFrom: '2026-09-12T09:00:00.000Z', confidence: 1, permissionScope: 'demo_only' };
  storage.setItem('nura-demo', JSON.stringify({
    ...fallback,
    facts: [editedLabFact],
    links: [{ id: 'mine', from: 'fact:demo-fact-lab', to: 'topic:cholesterol', relationType: 'related_by_me', label: 'Compare these' }],
  }));
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.deepEqual(loaded.snapshot.facts, [editedLabFact]);
  assert.equal(loaded.snapshot.links[0].id, 'mine');
});

test('legacy focus selections are preserved when the profile contains user edits', () => {
  const storage = memoryStorage();
  const selected = [{ id: 'bp-topic', label: 'Blood pressure' }, { id: 'cholesterol', label: 'Cholesterol' }];
  storage.setItem('nura-demo', JSON.stringify({ ...fallback, name: 'Jordan Sample', topics: selected }));
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.deepEqual(loaded.snapshot.topics, selected);
  assert.equal(loaded.snapshot.name, 'Jordan Sample');
});

test('a malformed policy relationship field is rejected without rewriting the saved workspace', () => {
  const raw = JSON.stringify({ ...fallback, policyReplacements: 'not-a-list' });
  const storage = memoryStorage({ 'nura-demo': raw });
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.match(loaded.warning ?? '', /could not be read/);
  assert.equal(storage.getItem('nura-demo'), raw);
});

test('invalid or non-demo storage is ignored without overwriting its saved value', () => {
  const raw = JSON.stringify({ version: 1, demoOnly: false, name: 'private' });
  const storage = memoryStorage({ 'nura-demo': raw });
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.equal(loaded.snapshot, fallback);
  assert.match(loaded.warning ?? '', /could not be read/);
  assert.equal(storage.getItem('nura-demo'), raw);
});

test('storage failures return the seed and explain that refresh persistence is unavailable', () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.equal(loaded.snapshot, fallback);
  assert.match(loaded.warning ?? '', /could not be read/);
  assert.throws(() => writeBrowserDemoSnapshot(storage, 'nura-demo', fallback), /blocked/);
});
