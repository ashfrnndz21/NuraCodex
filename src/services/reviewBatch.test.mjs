import test from 'node:test';
import assert from 'node:assert/strict';
import { commitReviewBatch } from './reviewBatch.mjs';

test('saves staged review items sequentially and continues after item-level failure', async () => {
  const order = [];
  const results = await commitReviewBatch([{ id: 'a' }, { id: 'b' }, { id: 'c' }], async (item) => {
    order.push(`start:${item.id}`);
    await Promise.resolve();
    if (item.id === 'b') throw new Error('retry b');
    order.push(`end:${item.id}`);
  });
  assert.deepEqual(order, ['start:a', 'end:a', 'start:b', 'start:c', 'end:c']);
  assert.deepEqual(results, [
    { id: 'a', status: 'saved' },
    { id: 'b', status: 'failed', message: 'retry b' },
    { id: 'c', status: 'saved' },
  ]);
});

test('rejects duplicate IDs before writing any review item', async () => {
  let writes = 0;
  await assert.rejects(commitReviewBatch([{ id: 'same' }, { id: 'same' }], () => { writes += 1; }), /only be saved once/);
  assert.equal(writes, 0);
});
