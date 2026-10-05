const INSURANCE_SIGNAL = /\b(?:insurance|policy|coverage|benefits? schedule|certificate of cover|explanation of benefits|member handbook|plan booklet)\b/i;

/** Use an explicit route choice first, then clear document wording; otherwise keep health-record handling. */
export function resolveDocumentPurpose({ requestedPurpose = 'medical', filename = '', documentType = '' } = {}) {
  if (requestedPurpose === 'insurance') return 'insurance';
  if (INSURANCE_SIGNAL.test(String(filename)) || INSURANCE_SIGNAL.test(String(documentType))) return 'insurance';
  return 'medical';
}

export function isRetryableEmptySource(source) {
  return source?.state === 'extracted_empty' || source?.state === 'failed';
}

const PURPOSE_CHECK_KINDS = new Set(['insurance_policy', 'medical_record', 'travel_document', 'identity_document', 'financial_document', 'other', 'unclear']);

/** Reduce model classifications across all document segments without treating a weak guess as a match. */
export function summarizeDocumentPurposeCheck({ expectedPurpose = 'insurance', segmentResults = [] } = {}) {
  if (expectedPurpose !== 'insurance' && expectedPurpose !== 'medical') throw new TypeError('Choose a supported document purpose.');
  if (!Array.isArray(segmentResults) || segmentResults.length === 0) throw new TypeError('A purpose check needs at least one document segment.');
  const results = segmentResults.map((item) => {
    const kind = typeof item?.kind === 'string' ? item.kind : 'unclear';
    const confidence = Number(item?.confidence);
    if (!PURPOSE_CHECK_KINDS.has(kind) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new TypeError('The document purpose check was incomplete.');
    }
    return { kind, confidence };
  });
  const counts = new Map();
  for (const item of results) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  const kind = [...counts].sort((left, right) => right[1] - left[1])[0][0];
  const consensus = (counts.get(kind) ?? 0) / results.length;
  const confidence = results.filter((item) => item.kind === kind).reduce((total, item) => total + item.confidence, 0) / (counts.get(kind) ?? 1);
  const expectedKind = expectedPurpose === 'insurance' ? 'insurance_policy' : 'medical_record';
  const status = kind === expectedKind && consensus === 1 && confidence >= 0.72
    ? 'match'
    : kind !== expectedKind && kind !== 'unclear' && consensus >= 0.75 && confidence >= 0.78
      ? 'mismatch'
      : 'unclear';
  return { expectedPurpose, kind, status, confidence: Number(confidence.toFixed(2)), segmentsReviewed: results.length };
}
