import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableEmptySource, resolveDocumentPurpose, summarizeDocumentPurposeCheck } from './documentPurpose.mjs';

test('detects policy uploads from clear filenames and extracted document type', () => {
  assert.equal(resolveDocumentPurpose({ filename: 'Elmo Health policy doc.pdf' }), 'insurance');
  assert.equal(resolveDocumentPurpose({ documentType: 'Health insurance policy document' }), 'insurance');
  assert.equal(resolveDocumentPurpose({ filename: 'lipid-panel.pdf' }), 'medical');
});

test('preserves an explicit review purpose over filename inference', () => {
  assert.equal(resolveDocumentPurpose({ requestedPurpose: 'insurance', filename: 'blood-results.pdf' }), 'insurance');
});

test('keeps empty and failed sources retryable but not completed sources', () => {
  assert.equal(isRetryableEmptySource({ state: 'extracted_empty' }), true);
  assert.equal(isRetryableEmptySource({ state: 'failed' }), true);
  assert.equal(isRetryableEmptySource({ state: 'candidate_review' }), false);
  assert.equal(isRetryableEmptySource(null), false);
});

test('confirms an insurance purpose only when every reviewed segment agrees confidently', () => {
  assert.deepEqual(summarizeDocumentPurposeCheck({ segmentResults: [
    { kind: 'insurance_policy', confidence: 0.93 },
    { kind: 'insurance_policy', confidence: 0.88 },
  ] }), { expectedPurpose: 'insurance', kind: 'insurance_policy', status: 'match', confidence: 0.91, segmentsReviewed: 2 });
});

test('asks the user about a confidently identified wrong category before extraction', () => {
  assert.equal(summarizeDocumentPurposeCheck({ segmentResults: [
    { kind: 'travel_document', confidence: 0.91 },
    { kind: 'travel_document', confidence: 0.84 },
    { kind: 'travel_document', confidence: 0.86 },
  ] }).status, 'mismatch');
});

test('does not auto-approve mixed or low-confidence document classifications', () => {
  assert.equal(summarizeDocumentPurposeCheck({ segmentResults: [
    { kind: 'insurance_policy', confidence: 0.98 },
    { kind: 'other', confidence: 0.94 },
  ] }).status, 'unclear');
  assert.equal(summarizeDocumentPurposeCheck({ segmentResults: [
    { kind: 'insurance_policy', confidence: 0.69 },
  ] }).status, 'unclear');
});

test('rejects invalid purpose-check data rather than trusting malformed model output', () => {
  assert.throws(() => summarizeDocumentPurposeCheck({ segmentResults: [{ kind: 'insurance_policy', confidence: 1.1 }] }), /incomplete/);
  assert.throws(() => summarizeDocumentPurposeCheck({ segmentResults: [] }), /at least one/);
});
