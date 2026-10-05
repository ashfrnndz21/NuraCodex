import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetryableAsyncResource } from './retryableAsyncResource.mjs';

test('concurrent callers share one initialization attempt', async () => {
  let initializeCount = 0;
  let release;
  const resource = createRetryableAsyncResource(() => {
    initializeCount += 1;
    return new Promise((resolve) => { release = resolve; });
  });

  const first = resource.get();
  const second = resource.get();
  await Promise.resolve();
  assert.equal(initializeCount, 1);
  release('ready');
  assert.deepEqual(await Promise.all([first, second]), ['ready', 'ready']);
});

test('a rejected initialization is cleared so the next caller can retry', async () => {
  let initializeCount = 0;
  const resource = createRetryableAsyncResource(() => {
    initializeCount += 1;
    if (initializeCount === 1) throw new Error('temporary storage failure');
    return 'opened';
  });

  await assert.rejects(resource.get(), /temporary storage failure/);
  assert.equal(await resource.get(), 'opened');
  assert.equal(initializeCount, 2);
});

test('an older failed attempt cannot clear a newer attempt after reset', async () => {
  let rejectFirst;
  let initializeCount = 0;
  const resource = createRetryableAsyncResource(() => {
    initializeCount += 1;
    if (initializeCount === 1) return new Promise((_resolve, reject) => { rejectFirst = reject; });
    return Promise.resolve('new database');
  });

  const first = resource.get();
  await Promise.resolve();
  resource.reset();
  assert.equal(await resource.get(), 'new database');
  rejectFirst(new Error('old open failed'));
  await assert.rejects(first, /old open failed/);
  assert.equal(await resource.get(), 'new database');
  assert.equal(initializeCount, 2);
});
