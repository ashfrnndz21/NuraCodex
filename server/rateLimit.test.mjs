import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter } from './rateLimit.mjs';

test('rate limits only after the configured number of requests in the sliding window', () => {
  let now = 1_000;
  const limited = createRateLimiter({ windowMs: 60_000, defaultLimit: 2, now: () => now });
  assert.equal(limited('127.0.0.1'), false);
  assert.equal(limited('127.0.0.1'), false);
  assert.equal(limited('127.0.0.1'), true);
  now += 60_000;
  assert.equal(limited('127.0.0.1'), false);
});

test('keeps request budgets independent by client and can allow a consented file batch', () => {
  const limited = createRateLimiter({ defaultLimit: 8, now: () => 2_000 });
  for (let count = 0; count < 8; count += 1) assert.equal(limited('client-a'), false);
  assert.equal(limited('client-a'), true);
  assert.equal(limited('client-b'), false);
  for (let count = 8; count < 20; count += 1) assert.equal(limited('client-a', 20), false);
  assert.equal(limited('client-a', 20), true);
});
