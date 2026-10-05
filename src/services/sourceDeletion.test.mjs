import assert from 'node:assert/strict';
import test from 'node:test';
import { readBrowserDemoSnapshot, writeBrowserDemoSnapshot } from '../state/browserDemoPersistence.mjs';
import { removeSourceAcrossLocalStores, removeSourceLinkedData, SourceDeletionIncompleteError } from './sourceDeletion.mjs';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

const empty = {
  version: 1, demoOnly: true, name: 'Synthetic profile', birthday: '', country: '', email: '', phone: '',
  topics: [], assets: [], facts: [], treatments: [], treatmentEvents: [], intakeNotes: [], visits: [], visitEvents: [],
  links: [], policyReplacements: [], policyClarifications: [], feedItems: [], savedQuestions: [], agentMessages: [], registryBriefs: [], consentReceipts: [],
};

test('source deletion removes every linked browser record and cited answer while preserving a second source after reload', () => {
  const storage = memoryStorage();
  const snapshot = {
    ...empty,
    assets: [
      { id: 'file-a', name: 'report-a.pdf', serverSourceId: 'source-a', uri: 'nura-local-asset://file-a' },
      { id: 'file-b', name: 'report-b.pdf', serverSourceId: 'source-b', uri: 'nura-local-asset://file-b' },
    ],
    facts: [
      { id: 'fact-a', label: 'Glucose', sourceId: 'source-a', sourceClaimId: 'claim-a' },
      { id: 'fact-b', label: 'Cholesterol', sourceId: 'source-b', sourceClaimId: 'claim-b' },
    ],
    treatments: [{ id: 'treatment-a', name: 'Medicine from A', sourceId: 'source-a' }, { id: 'treatment-b', name: 'Medicine from B', sourceId: 'source-b' }],
    treatmentEvents: [{ id: 'event-a', treatmentId: 'treatment-a' }, { id: 'event-b', treatmentId: 'treatment-b' }],
    intakeNotes: [{ id: 'note-a', serverSourceId: 'source-a' }, { id: 'note-b', serverSourceId: 'source-b' }],
    visits: [{ id: 'visit', briefFactIds: ['fact-a', 'fact-b'], briefAssetIds: ['file-a', 'file-b'], briefTreatmentIds: ['treatment-a', 'treatment-b'], outcomeSourceAssetIds: ['file-a', 'file-b'], followUpActions: [{ id: 'follow-up', sourceAssetIds: ['file-a', 'file-b'] }] }],
    visitEvents: [{ id: 'visit-event', snapshot: { id: 'visit', briefFactIds: ['fact-a', 'fact-b'], briefAssetIds: ['file-a', 'file-b'], briefTreatmentIds: ['treatment-a', 'treatment-b'], outcomeSourceAssetIds: [], followUpActions: [] } }],
    links: [{ id: 'link-a', from: 'fact:fact-a', to: 'asset:file-a' }, { id: 'link-b', from: 'fact:fact-b', to: 'asset:file-b' }],
    policyReplacements: [{ id: 'replace-a', newerSourceId: 'source-a', olderSourceId: 'source-b' }],
    policyClarifications: [{ id: 'clarification-a', sourceId: 'source-a', sourceClaimId: 'claim-a' }, { id: 'clarification-b', sourceId: 'source-b', sourceClaimId: 'claim-b' }],
    agentMessages: [
      { id: 'question-a', runId: 'run-a', role: 'user', citations: [] },
      { id: 'answer-a', runId: 'run-a', role: 'assistant', citations: [{ id: 'fact:fact-a' }] },
      { id: 'answer-b', runId: 'run-b', role: 'assistant', citations: [{ id: 'claim-b' }] },
    ],
    registryBriefs: [{ id: 'brief-a', citations: [{ id: 'fact:fact-a' }] }, { id: 'brief-b', citations: [{ id: 'source-b' }] }],
  };

  const result = removeSourceLinkedData(snapshot, { sourceId: 'source-a', claimIds: ['claim-a'], assertionIds: ['assertion-a'] });
  writeBrowserDemoSnapshot(storage, 'nura-profile', result.snapshot);
  const reloaded = readBrowserDemoSnapshot(storage, 'nura-profile', empty).snapshot;

  assert.deepEqual(reloaded.assets.map((item) => item.serverSourceId), ['source-b']);
  assert.deepEqual(reloaded.facts.map((item) => item.sourceId), ['source-b']);
  assert.deepEqual(reloaded.treatments.map((item) => item.sourceId), ['source-b']);
  assert.deepEqual(reloaded.treatmentEvents.map((item) => item.treatmentId), ['treatment-b']);
  assert.deepEqual(reloaded.intakeNotes.map((item) => item.serverSourceId), ['source-b']);
  assert.deepEqual(reloaded.visits[0].briefFactIds, ['fact-b']);
  assert.deepEqual(reloaded.visits[0].briefAssetIds, ['file-b']);
  assert.deepEqual(reloaded.visits[0].briefTreatmentIds, ['treatment-b']);
  assert.deepEqual(reloaded.visits[0].outcomeSourceAssetIds, ['file-b']);
  assert.deepEqual(reloaded.visits[0].followUpActions[0].sourceAssetIds, ['file-b']);
  assert.deepEqual(reloaded.visitEvents[0].snapshot.briefFactIds, ['fact-b']);
  assert.deepEqual(reloaded.links.map((item) => item.id), ['link-b']);
  assert.deepEqual(reloaded.policyReplacements, []);
  assert.deepEqual(reloaded.policyClarifications.map((item) => item.sourceId), ['source-b']);
  assert.deepEqual(reloaded.agentMessages.map((item) => item.id), ['answer-b']);
  assert.deepEqual(reloaded.registryBriefs.map((item) => item.id), ['brief-b']);
  assert.deepEqual(result.removed, { assets: 1, facts: 1, treatments: 1, intakeNotes: 1, treatmentEvents: 1, messages: 2, registryBriefs: 1, policyClarifications: 1, policyReplacements: 1, links: 1 });
});

test('source deletion can remove an unreviewed local file without touching unrelated profile facts', () => {
  const result = removeSourceLinkedData({ ...empty, assets: [{ id: 'file-a', uri: 'nura-local-asset://file-a' }, { id: 'file-b' }], facts: [{ id: 'fact-b', sourceId: 'source-b' }] }, { assetId: 'file-a' });
  assert.deepEqual(result.snapshot.assets.map((item) => item.id), ['file-b']);
  assert.deepEqual(result.snapshot.facts.map((item) => item.id), ['fact-b']);
});

test('service failure leaves every app-owned copy untouched and reports an uncertain service result', async () => {
  const snapshot = { ...empty, assets: [{ id: 'file-a', serverSourceId: 'source-a' }] };
  let fileRemovalCalls = 0;
  let persistenceCalls = 0;

  await assert.rejects(removeSourceAcrossLocalStores({
    snapshot,
    selection: { sourceId: 'source-a' },
    removeServiceSource: async () => { throw new Error('connection lost before result'); },
    removeOriginalFiles: async () => { fileRemovalCalls += 1; },
    persistLocalSnapshot: async () => { persistenceCalls += 1; },
  }), /connection lost before result/);

  assert.deepEqual(snapshot.assets.map((asset) => asset.id), ['file-a']);
  assert.equal(fileRemovalCalls, 0);
  assert.equal(persistenceCalls, 0);
});

test('local commit failure after service deletion retries from its stable receipt and finishes idempotently', async () => {
  const original = {
    ...empty,
    assets: [{ id: 'file-a', serverSourceId: 'source-a', uri: 'nura-local-asset://file-a' }],
    facts: [{ id: 'fact-a', sourceId: 'source-a', sourceClaimId: 'claim-a' }],
    agentMessages: [{ id: 'answer-a', runId: 'run-a', role: 'assistant', citations: [{ id: 'claim-a' }] }],
  };
  const receipt = { source: 1, claims: 1, assertions: 1, activityEvents: 2, claimIds: ['claim-a'], assertionIds: ['assertion-a'], alreadyRemoved: false };
  let serviceDeleted = false;
  let failCommit = true;
  let savedSnapshot = original;
  const localFiles = new Set(['file-a']);
  let serviceCalls = 0;
  const dependencies = {
    snapshot: () => savedSnapshot,
    selection: { sourceId: 'source-a' },
    removeServiceSource: async () => {
      serviceCalls += 1;
      if (!serviceDeleted) { serviceDeleted = true; return receipt; }
      return { ...receipt, source: 0, claims: 0, assertions: 0, activityEvents: 0, alreadyRemoved: true };
    },
    removeOriginalFiles: async (assetIds) => { for (const id of assetIds) localFiles.delete(id); },
    persistLocalSnapshot: async (next) => {
      if (failCommit) { failCommit = false; throw new Error('synthetic local database failure'); }
      savedSnapshot = next;
    },
  };

  await assert.rejects(removeSourceAcrossLocalStores({ ...dependencies, snapshot: dependencies.snapshot() }), (error) => {
    assert.ok(error instanceof SourceDeletionIncompleteError);
    assert.equal(error.serviceDeletionCompleted, true);
    assert.match(error.message, /local preview service/);
    return true;
  });
  assert.equal(serviceDeleted, true);
  assert.deepEqual(savedSnapshot.assets.map((asset) => asset.id), ['file-a'], 'failed local persistence leaves the saved inventory retryable');
  assert.deepEqual(localFiles, new Set(), 'file deletion may complete before the local database transaction fails');

  const retried = await removeSourceAcrossLocalStores({ ...dependencies, snapshot: dependencies.snapshot() });
  assert.equal(retried.alreadyRemoved, true);
  assert.equal(retried.service.status, 'already_removed');
  assert.deepEqual(retried.local.snapshot.assets, []);
  assert.deepEqual(retried.local.snapshot.facts, []);
  assert.deepEqual(retried.local.snapshot.agentMessages, []);
  assert.deepEqual(savedSnapshot.assets, []);
  assert.deepEqual(localFiles, new Set(), 'deleting an already-missing file is safe');
  assert.equal(serviceCalls, 2);

  const replayed = await removeSourceAcrossLocalStores({ ...dependencies, snapshot: dependencies.snapshot() });
  assert.equal(replayed.alreadyRemoved, true);
  assert.deepEqual(replayed.local.removed, { assets: 0, facts: 0, treatments: 0, intakeNotes: 0, treatmentEvents: 0, messages: 0, registryBriefs: 0, policyClarifications: 0, policyReplacements: 0, links: 0 });
  assert.equal(serviceCalls, 3);
});
