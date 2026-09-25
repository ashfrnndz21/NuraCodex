import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePolicyDocuments, resolvePolicyReplacementLinks, summarizePolicyDifferences, validatePolicyReplacement } from './policyReplacement.mjs';

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

test('keeps saved policy relationships visible when one side has no current accepted terms', () => {
  const links = [{ id: 'link-1', newerSourceId: 'new', olderSourceId: 'old' }];
  const policies = [
    { sourceId: 'new', currentTerms: [{ id: 'n1' }], previousTerms: [], removedTerms: [] },
    { sourceId: 'old', currentTerms: [], previousTerms: [{ id: 'o1' }], removedTerms: [] },
  ];
  const [resolution] = resolvePolicyReplacementLinks(links, policies, ['new', 'old']);
  assert.deepEqual(resolution, {
    id: 'link-1', newerSourceId: 'new', olderSourceId: 'old',
    newerStatus: 'current_terms', olderStatus: 'history_only', status: 'needs_review',
  });
});

test('distinguishes a saved but unreviewed source from a source that is unavailable', () => {
  const links = [{ id: 'link-2', newerSourceId: 'new', olderSourceId: 'missing' }];
  const [resolution] = resolvePolicyReplacementLinks(links, [], ['new']);
  assert.equal(resolution.newerStatus, 'source_saved');
  assert.equal(resolution.olderStatus, 'source_unavailable');
  assert.equal(resolution.status, 'needs_review');
});

test('marks a relationship ready only when both documents have current accepted terms', () => {
  const links = [{ id: 'link-3', newerSourceId: 'new', olderSourceId: 'old' }];
  const policies = ['new', 'old'].map((sourceId) => ({ sourceId, currentTerms: [{ id: `${sourceId}-term` }], previousTerms: [], removedTerms: [] }));
  assert.equal(resolvePolicyReplacementLinks(links, policies, ['new', 'old'])[0].status, 'ready');
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

test('summarizes numeric changes by cautious direction and leaves wording-only changes unclassified', () => {
  const sourced = (id, sourceId, sourceClaimId, value) => ({ id, sourceId, sourceClaimId, value });
  const summary = summarizePolicyDifferences([
    { label: 'Annual outpatient visit limit', status: 'different', newerTerms: [sourced('n1', 'new-source', 'new-claim-1', '8 visits per year')], olderTerms: [sourced('o1', 'old-source', 'old-claim-1', '10 visits per year')] },
    { label: 'Outpatient copay', status: 'different', newerTerms: [sourced('n2', 'new-source', 'new-claim-2', 'MYR 60 per visit')], olderTerms: [sourced('o2', 'old-source', 'old-claim-2', 'MYR 40 per visit')] },
    { label: 'Treatment exclusion', status: 'different', newerTerms: [sourced('n3', 'new-source', 'new-claim-3', 'Treatment is excluded')], olderTerms: [sourced('o3', 'old-source', 'old-claim-3', 'Excluded')] },
    { label: 'Annual premium', status: 'only_newer', newerTerms: [sourced('n4', 'new-source', 'new-claim-4', 'MYR 500')], olderTerms: [] },
  ]);
  assert.deepEqual(summary.observations.map(({ kind }) => kind), ['lower_stated_amount', 'higher_stated_cost']);
  assert.equal(summary.wordingCount, 1);
  assert.equal(summary.oneSidedCount, 1);
  assert.equal(summary.unlinkedCount, 0);
  assert.deepEqual(summary.observations[0].newerEvidence, { sourceId: 'new-source', claimId: 'new-claim-1' });
  assert.deepEqual(summary.observations[0].olderEvidence, { sourceId: 'old-source', claimId: 'old-claim-1' });
});

test('does not label a numeric difference as a cost or benefit when either term lacks source-claim evidence', () => {
  const summary = summarizePolicyDifferences([{
    label: 'Annual medical limit', status: 'different',
    newerTerms: [{ id: 'new-fact', sourceId: 'new-source', sourceClaimId: 'new-claim', value: 'MYR 120,000' }],
    olderTerms: [{ id: 'old-fact', sourceId: 'old-source', value: 'MYR 100,000' }],
  }]);
  assert.deepEqual(summary.observations, []);
  assert.equal(summary.unlinkedCount, 1);
  assert.deepEqual(summary.unlinkedLabels, ['Annual medical limit']);
});

test('does not treat a missing accepted term as an exclusion and flags duplicate labels as ambiguous', () => {
  const rows = comparePolicyDocuments(
    policy('new', [term('n1', 'Annual limit', '$12,000'), term('n2', 'Copay', '$20'), term('n3', 'Copay', '$30')]),
    policy('old', [term('o1', 'Deductible', '$500')]),
  );
  assert.deepEqual(rows.map((row) => [row.label, row.status]), [['Annual limit', 'only_newer'], ['Copay', 'ambiguous'], ['Deductible', 'only_older']]);
});
