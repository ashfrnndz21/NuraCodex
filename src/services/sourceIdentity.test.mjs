import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceSha256Matches } from './sourceIdentity.mjs';

const hash = '304c3f32aa7958ef6278d6f214f6e5762b3924f4786818731a3b32f320b500fb';

test('source identity accepts the exact file hash regardless of hex case', () => {
  assert.equal(sourceSha256Matches(hash, hash.toUpperCase()), true);
});

test('source identity rejects a different file hash', () => {
  assert.equal(sourceSha256Matches(hash, '0'.repeat(64)), false);
});

test('source identity rejects missing or malformed hashes', () => {
  assert.equal(sourceSha256Matches(null, hash), false);
  assert.equal(sourceSha256Matches(hash, 'not-a-hash'), false);
});
