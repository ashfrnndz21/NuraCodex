import assert from 'node:assert/strict';
import test from 'node:test';
import { readBrowserDemoSnapshot, writeBrowserDemoSnapshot } from './browserDemoPersistence.mjs';

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
  topics: [], assets: [], facts: [], treatments: [], treatmentEvents: [], visits: [], policyReplacements: [],
  visitEvents: [], links: [], feedItems: [], savedQuestions: [], agentMessages: [], registryBriefs: [],
};

test('browser demo snapshot round-trips profile, facts, source links and agent history', () => {
  const storage = memoryStorage();
  const snapshot = { ...fallback, name: 'Riley Sample', facts: [{ id: 'f1', sourceId: 's1' }], links: [{ id: 'l1' }], agentMessages: [{ id: 'm1' }] };
  writeBrowserDemoSnapshot(storage, 'nura-demo', snapshot);
  const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback);
  assert.equal(loaded.warning, null);
  assert.deepEqual(loaded.snapshot, snapshot);
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
  assert.equal(loaded.snapshot.name, '');
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
