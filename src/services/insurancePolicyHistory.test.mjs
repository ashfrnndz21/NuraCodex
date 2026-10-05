import test from 'node:test';
import assert from 'node:assert/strict';
import { groupInsurancePolicyTerms } from './insurancePolicyHistory.mjs';
import { buildInsuranceSnapshot } from './insuranceSnapshot.mjs';
import { comparePolicyDocuments, resolvePolicyReplacementLinks, summarizePolicyDifferences } from './policyReplacement.mjs';

const fact = (id, sourceId, overrides = {}) => ({
  id,
  sourceId,
  source: 'Sample policy.pdf',
  category: 'Insurance coverage',
  label: 'Annual limit',
  value: '$10,000',
  date: '2026-01-01',
  status: 'reviewed',
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

test('two-policy comparison recovers after review and keeps conflicts, missing details, and quotes distinct', () => {
  const saved = (id, sourceId, label, value, sourceClaimId, overrides = {}) => ({
    ...fact(id, sourceId, { label, value, sourceClaimId }),
    ...overrides,
  });
  const replacement = [{ id: 'user-link-1', newerSourceId: 'policy-new', olderSourceId: 'policy-old' }];
  const sourceIds = ['policy-new', 'policy-old'];
  const newPolicyFacts = [
    saved('new-limit', 'policy-new', 'Annual medical limit', 'MYR 120,000', 'claim-new-limit'),
    saved('new-cancer', 'policy-new', 'Cancer cover', 'Subject to insurer approval', 'claim-new-cancer'),
    saved('new-duplicate-a', 'policy-new', 'Outpatient visits per year', '8 visits', 'claim-new-visit-a'),
    saved('new-duplicate-b', 'policy-new', 'Outpatient visits per year', '10 visits', 'claim-new-visit-b'),
    saved('new-pending', 'policy-new', 'Lifetime medical limit', 'MYR 2,000,000', 'claim-pending', { reviewState: 'candidate' }),
  ];
  const pendingOldPolicyTerm = saved('old-pending-limit', 'policy-old', 'Annual medical limit', 'MYR 100,000', 'claim-old-limit', { status: 'candidate', reviewState: 'candidate' });
  const policiesBeforeReview = groupInsurancePolicyTerms([...newPolicyFacts, pendingOldPolicyTerm]);

  assert.deepEqual(policiesBeforeReview.map((policy) => [policy.sourceId, policy.currentTerms.map((term) => term.id)]), [
    ['policy-new', ['new-limit', 'new-cancer', 'new-duplicate-a', 'new-duplicate-b']],
  ]);
  assert.equal(resolvePolicyReplacementLinks(replacement, policiesBeforeReview, sourceIds)[0].status, 'needs_review');

  const oldPolicyFacts = [
    saved('old-limit', 'policy-old', 'Annual medical limit', 'MYR 100,000', 'claim-old-limit'),
    saved('old-cancer', 'policy-old', 'Cancer cover', 'Cancer treatment is excluded', 'claim-old-cancer'),
  ];
  const policiesAfterReview = groupInsurancePolicyTerms([...newPolicyFacts, ...oldPolicyFacts]);
  const newPolicy = policiesAfterReview.find((policy) => policy.sourceId === 'policy-new');
  const oldPolicy = policiesAfterReview.find((policy) => policy.sourceId === 'policy-old');
  assert.equal(resolvePolicyReplacementLinks(replacement, policiesAfterReview, sourceIds)[0].status, 'ready');

  const rows = comparePolicyDocuments(newPolicy, oldPolicy);
  const summary = summarizePolicyDifferences(rows);
  assert.equal(rows.find((row) => row.label === 'Annual medical limit').status, 'different');
  assert.equal(rows.find((row) => row.label === 'Cancer cover').status, 'different');
  assert.equal(rows.find((row) => row.label === 'Outpatient visits per year').status, 'ambiguous');
  assert.equal(rows.some((row) => row.label === 'Lifetime medical limit'), false);
  assert.deepEqual(summary.observations.map(({ label, kind, newerEvidence, olderEvidence }) => ({ label, kind, newerEvidence, olderEvidence })), [{
    label: 'Annual medical limit',
    kind: 'higher_stated_amount',
    newerEvidence: { sourceId: 'policy-new', claimId: 'claim-new-limit' },
    olderEvidence: { sourceId: 'policy-old', claimId: 'claim-old-limit' },
  }]);
  assert.equal(summary.ambiguousCount, 1);
  assert.equal(summary.wordingCount, 1);

  const newSnapshot = buildInsuranceSnapshot(newPolicy.currentTerms);
  const oldSnapshot = buildInsuranceSnapshot(oldPolicy.currentTerms);
  assert.equal(newSnapshot.clarifications.some((term) => term.label === 'Cancer cover'), true);
  assert.equal(oldSnapshot.exclusions.some((term) => term.label === 'Cancer cover'), true);
  assert.equal(oldSnapshot.notFoundMedicalDetails.some((field) => field.label === 'Lifetime medical limit'), true);
});
