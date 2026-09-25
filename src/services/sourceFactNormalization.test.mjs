import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalSourceFactValue } from './sourceFactNormalization.mjs';

const fact = {
  id: 'fact-1', label: 'LDL', value: '2.2 mmol/L mmol/L', sourceId: 'source-1',
  sourceClaimId: 'claim-1', date: '2026-09-24', reviewState: 'user_confirmed',
  validFrom: '2026-09-24', validUntil: null, confidence: 0.9,
};

test('repairs only an exact duplicate-unit join proven by the matching source claim', () => {
  const repaired = canonicalSourceFactValue(fact, {
    factId: 'fact-1', sourceId: 'source-1', sourceClaimId: 'claim-1',
    expectedValue: '2.2 mmol/L mmol/L', normalizedValue: '2.2 mmol/L',
  });
  assert.equal(repaired.value, '2.2 mmol/L');
  assert.equal(repaired.date, fact.date);
  assert.equal(repaired.reviewState, fact.reviewState);
  assert.equal(repaired.confidence, fact.confidence);
});

test('does not change edited, inactive, or mismatched source facts', () => {
  const input = { factId: 'fact-1', sourceId: 'source-1', sourceClaimId: 'claim-1', expectedValue: fact.value, normalizedValue: '2.2 mmol/L' };
  assert.equal(canonicalSourceFactValue({ ...fact, value: '2.1 mmol/L mmol/L' }, input), null);
  assert.equal(canonicalSourceFactValue({ ...fact, validUntil: '2026-09-25' }, input), null);
  assert.equal(canonicalSourceFactValue(fact, { ...input, sourceClaimId: 'other-claim' }), null);
});
