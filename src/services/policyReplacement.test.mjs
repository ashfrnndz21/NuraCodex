import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePolicyDocuments, validatePolicyReplacement } from './policyReplacement.mjs';

const sources = ['new', 'old', 'mid'].map((sourceId) => ({ sourceId }));

test('requires two distinct saved policy sources', () => {
  assert.equal(validatePolicyReplacement('new', 'old', sources, []).ok, true);
  assert.equal(validatePolicyReplacement('new', 'new', sources, []).reason, 'A policy cannot replace itself.');
  assert.equal(validatePolicyReplacement('new', 'missing', sources, []).ok, false);
});

test('rejects duplicate links and circular document histories', () => {
  assert.equal(validatePolicyReplacement('new', 'old', sources, [{ newerSourceId: 'new', olderSourceId: 'old' }]).reason, 'These policy documents are already linked.');
  const chain = [{ newerSourceId: 'new', olderSourceId: 'mid' }, { newerSourceId: 'mid', olderSourceId: 'old' }];
  assert.equal(validatePolicyReplacement('old', 'new', sources, chain).reason, 'This link would create a circular policy history.');
  assert.equal(validatePolicyReplacement('new', 'old', sources, chain).ok, true);
});

const term = (id, label, value) => ({ id, label, value });
const policy = (sourceId, currentTerms) => ({ sourceId, currentTerms });

test('compares exact matching labels and preserves both values without deciding which policy applies', () => {
  const rows = comparePolicyDocuments(
    policy('new', [term('n1', 'Annual limit', '$12,000'), term('n2', 'Hospital stay', '90 days')]),
    policy('old', [term('o1', 'Annual limit', '$10,000'), term('o2', 'Hospital stay', '90 days')]),
  );
  assert.deepEqual(rows.map(({ label, status }) => [label, status]), [['Annual limit', 'different'], ['Hospital stay', 'same']]);
  assert.equal(rows[0].newerTerms[0].value, '$12,000');
  assert.equal(rows[0].olderTerms[0].value, '$10,000');
});

test('does not treat a missing accepted term as an exclusion and flags duplicate labels as ambiguous', () => {
  const rows = comparePolicyDocuments(
    policy('new', [term('n1', 'Annual limit', '$12,000'), term('n2', 'Copay', '$20'), term('n3', 'Copay', '$30')]),
    policy('old', [term('o1', 'Deductible', '$500')]),
  );
  assert.deepEqual(rows.map((row) => [row.label, row.status]), [['Annual limit', 'only_newer'], ['Copay', 'ambiguous'], ['Deductible', 'only_older']]);
});
