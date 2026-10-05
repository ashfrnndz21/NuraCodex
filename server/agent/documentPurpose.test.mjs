import test from 'node:test';
import assert from 'node:assert/strict';
import { gateClaimsOnDocumentPurpose, isRetryableEmptySource, resolveDocumentPurpose, summarizeDocumentPurposeCheck } from './documentPurpose.mjs';

test('keeps the selected category authoritative instead of trusting filenames or document labels', () => {
  assert.equal(resolveDocumentPurpose({ requestedPurpose: 'insurance', filename: 'blood-results.pdf' }), 'insurance');
  assert.equal(resolveDocumentPurpose({ requestedPurpose: 'medical', filename: 'holiday-insurance.pdf', documentType: 'Travel itinerary' }), 'medical');
});

test('preserves an explicit review purpose over filename inference', () => {
  assert.equal(resolveDocumentPurpose({ requestedPurpose: 'insurance', filename: 'blood-results.pdf' }), 'insurance');
});

test('keeps empty and failed sources retryable but not completed sources', () => {
  assert.equal(isRetryableEmptySource({ state: 'extracted_empty' }), true);
  assert.equal(isRetryableEmptySource({ state: 'failed' }), true);
  assert.equal(isRetryableEmptySource({ state: 'purpose_confirmation_required' }), true);
  assert.equal(isRetryableEmptySource({ state: 'candidate_review' }), false);
  assert.equal(isRetryableEmptySource(null), false);
});

test('confirms an insurance purpose only when every reviewed segment agrees confidently', () => {
  assert.deepEqual(summarizeDocumentPurposeCheck({ segmentResults: [
    { category: 'insurance_policy', confidence: 0.93 },
    { category: 'insurance_policy', confidence: 0.88 },
  ] }), { expectedPurpose: 'insurance', kind: 'insurance_policy', status: 'match', confidence: 0.91, segmentsReviewed: 2 });
});

test('gates candidate details when every document segment confidently matches another category', () => {
  const segmentResults = [
    { category: 'travel_document', confidence: 0.91 },
    { category: 'travel_document', confidence: 0.84 },
    { category: 'travel_document', confidence: 0.86 },
  ];
  assert.equal(summarizeDocumentPurposeCheck({ segmentResults }).status, 'mismatch');
  const gated = gateClaimsOnDocumentPurpose({ expectedPurpose: 'insurance', segmentResults, claims: [{ label: 'Annual limit', value: '5000' }] });
  assert.equal(gated.confirmationRequired, true);
  assert.deepEqual(gated.claims, []);
  assert.equal(gated.documentPurposeCheck.kind, 'travel_document');
});

test('only reads claims after the user confirms an uncertain document category', () => {
  const segmentResults = [{ category: 'unclear', confidence: 0.42 }];
  const claims = [{ label: 'Annual limit', value: '5000' }];
  assert.deepEqual(gateClaimsOnDocumentPurpose({ expectedPurpose: 'insurance', segmentResults, claims }).claims, []);
  const confirmed = gateClaimsOnDocumentPurpose({ expectedPurpose: 'insurance', segmentResults, claims, purposeConfirmed: true });
  assert.equal(confirmed.confirmationRequired, false);
  assert.deepEqual(confirmed.claims, claims);
});

test('does not auto-approve mixed or low-confidence document classifications', () => {
  assert.equal(summarizeDocumentPurposeCheck({ segmentResults: [
    { category: 'insurance_policy', confidence: 0.98 },
    { category: 'other', confidence: 0.94 },
  ] }).status, 'unclear');
  assert.equal(summarizeDocumentPurposeCheck({ segmentResults: [
    { category: 'insurance_policy', confidence: 0.69 },
  ] }).status, 'unclear');
});

test('rejects invalid purpose-check data rather than trusting malformed model output', () => {
  assert.throws(() => summarizeDocumentPurposeCheck({ segmentResults: [{ category: 'insurance_policy', confidence: 1.1 }] }), /incomplete/);
  assert.throws(() => summarizeDocumentPurposeCheck({ segmentResults: [] }), /at least one/);
});
