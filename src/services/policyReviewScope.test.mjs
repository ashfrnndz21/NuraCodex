import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePolicyReviewSourceIds, selectPolicyReviewFacts } from './policyReviewScope.mjs';

const facts = [
  { id: 'p1', category: 'Insurance coverage', sourceId: 'policy-a' },
  { id: 'p2', category: 'Coverage term', sourceId: 'policy-b' },
  { id: 'old', category: 'Insurance coverage', sourceId: 'policy-c', validUntil: '2026-01-01' },
  { id: 'health-a', category: 'Lab results', sourceId: 'report-a' },
  { id: 'health-b', category: 'Care', sourceId: 'report-b' },
];

test('policy review admits only one or two requested active policy sources', () => {
  assert.deepEqual(resolvePolicyReviewSourceIds(['policy-a', 'unknown', 'policy-a'], facts), ['policy-a']);
  assert.deepEqual(resolvePolicyReviewSourceIds(['policy-a', 'policy-b', 'policy-c'], facts), ['policy-a', 'policy-b']);
});

test('policy review sends approved terms plus only individually selected active health facts', () => {
  const selected = selectPolicyReviewFacts(facts, ['policy-a'], true, ['health-b', 'old']);
  assert.deepEqual(selected.map((fact) => fact.id), ['p1', 'health-b']);
  assert.deepEqual(selectPolicyReviewFacts(facts, ['policy-a'], false, []), []);
});
