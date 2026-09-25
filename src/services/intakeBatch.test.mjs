import test from 'node:test';
import assert from 'node:assert/strict';
import { processIntakeBatch } from './intakeBatch.mjs';

test('processes staged files sequentially and keeps completed files around an individual failure', async () => {
  const order = [];
  const statuses = [];
  const results = await processIntakeBatch([{ id: 'a' }, { id: 'b' }, { id: 'c' }], async (asset) => {
    order.push(`start:${asset.id}`);
    if (asset.id === 'b') throw new Error('unreadable');
    order.push(`end:${asset.id}`);
    return `source-${asset.id}`;
  }, { onStatus: (event) => statuses.push([event.assetId, event.status]) });
  assert.deepEqual(order, ['start:a', 'end:a', 'start:b', 'start:c', 'end:c']);
  assert.deepEqual(results.map(({ assetId, status }) => [assetId, status]), [['a', 'complete'], ['b', 'failed'], ['c', 'complete']]);
  assert.deepEqual(statuses, [['a', 'reading'], ['a', 'complete'], ['b', 'reading'], ['b', 'failed'], ['c', 'reading'], ['c', 'complete']]);
});

test('stops after cancellation and leaves unstarted files untouched', async () => {
  const statuses = [];
  const results = await processIntakeBatch([{ id: 'a' }, { id: 'b' }, { id: 'c' }], async (asset) => {
    if (asset.id === 'b') { const error = new Error('stopped'); error.name = 'IntakeCancelledError'; throw error; }
    return asset.id;
  }, { onStatus: (event) => statuses.push([event.assetId, event.status]) });
  assert.deepEqual(results.map(({ assetId, status }) => [assetId, status]), [['a', 'complete'], ['b', 'cancelled']]);
  assert.deepEqual(statuses, [['a', 'reading'], ['a', 'complete'], ['b', 'reading'], ['b', 'cancelled']]);
});

test('does not start a file when the run was cancelled before processing', async () => {
  const controller = new AbortController();
  controller.abort();
  let processed = false;
  const results = await processIntakeBatch([{ id: 'a' }], async () => { processed = true; }, { signal: controller.signal });
  assert.equal(processed, false);
  assert.deepEqual(results, []);
});
