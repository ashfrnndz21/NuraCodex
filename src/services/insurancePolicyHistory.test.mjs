import test from 'node:test';
import assert from 'node:assert/strict';
import { groupInsurancePolicyTerms } from './insurancePolicyHistory.mjs';

const fact = (id, sourceId, overrides = {}) => ({
  id,
  sourceId,
  source: 'Sample policy.pdf',
  category: 'Insurance coverage',
  label: 'Annual limit',
  value: '$10,000',
  date: '2026-01-01',
  validFrom: '2026-01-01',
  validUntil: null,
  reviewState: 'user_confirmed',
  ...overrides,
});

test('a corrected policy term stays visible beside the current record entry', () => {
  const result = groupInsurancePolicyTerms([
    fact('v2', 'source-1', { value: '$12,000', date: '2026-06-01', validFrom: '2026-06-01', supersedesId: 'v1' }),
    fact('v1', 'source-1', { value: '$10,000', validUntil: '2026-06-01' }),
  ]);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].currentTerms.map((item) => item.id), ['v2']);
  assert.deepEqual(result[0].previousTerms.map((item) => item.id), ['v1']);
  assert.deepEqual(result[0].removedTerms, []);
});

test('a user-removed term is not presented as a previous policy version', () => {
  const result = groupInsurancePolicyTerms([
    fact('current', 'source-1'),
    fact('removed', 'source-1', { validUntil: '2026-02-01', reviewState: 'user_retracted' }),
  ]);

  assert.deepEqual(result[0].previousTerms, []);
  assert.deepEqual(result[0].removedTerms.map((item) => item.id), ['removed']);
});

test('historical-only source groups remain visible and unrelated or source-less facts are excluded', () => {
  const result = groupInsurancePolicyTerms([
    fact('old', 'older-source', { source: 'Earlier policy.pdf', validUntil: '2025-12-31' }),
    fact('medical', 'medical-source', { category: 'Laboratory result' }),
    fact('unlinked', undefined),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].sourceName, 'Earlier policy.pdf');
  assert.deepEqual(result[0].currentTerms, []);
  assert.deepEqual(result[0].previousTerms.map((item) => item.id), ['old']);
});

test('policy sources and each version list sort newest first', () => {
  const result = groupInsurancePolicyTerms([
    fact('older-current', 'source-old', { source: 'Old.pdf', date: '2024-02-01', validFrom: '2024-02-01' }),
    fact('new-current', 'source-new', { source: 'New.pdf', date: '2025-02-01', validFrom: '2025-02-01' }),
    fact('newer-history', 'source-old', { date: '2024-08-01', validFrom: '2024-08-01', validUntil: '2024-09-01' }),
    fact('older-history', 'source-old', { date: '2024-01-01', validFrom: '2024-01-01', validUntil: '2024-02-01' }),
  ]);

  assert.deepEqual(result.map((item) => item.sourceId), ['source-new', 'source-old']);
  assert.deepEqual(result[1].previousTerms.map((item) => item.id), ['newer-history', 'older-history']);
});
