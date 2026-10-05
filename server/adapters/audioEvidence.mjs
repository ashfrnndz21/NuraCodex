const AUDIO_CLAIM_KINDS = new Set(['measurement', 'condition', 'medication', 'allergy', 'treatment', 'care_event', 'other']);

/** Keep only claims tied to an exact quote from a timestamped transcription segment. */
export function mapAudioTranscriptClaims(claims, segments) {
  if (!Array.isArray(claims) || !Array.isArray(segments)) return [];
  return claims.flatMap((claim) => {
    const index = claim?.segmentIndex;
    if (!Number.isInteger(index) || index < 0 || index >= segments.length) return [];
    const segment = segments[index];
    const quote = typeof claim?.quote === 'string' ? claim.quote.trim() : '';
    const segmentText = typeof segment?.text === 'string' ? segment.text : '';
    const start = Number(segment?.start);
    if (claim?.subject !== 'self' || !AUDIO_CLAIM_KINDS.has(claim?.kind) || !Number.isFinite(start) || start < 0 || !quote || !segmentText.includes(quote)) return [];
    if (typeof claim?.label !== 'string' || !claim.label.trim() || typeof claim?.value !== 'string' || !claim.value.trim()) return [];
    const { segmentIndex: _segmentIndex, subject: _subject, ...fields } = claim;
    return [{ ...fields, segmentIndex: index, label: claim.label.trim(), value: claim.value.trim(), quote, page: null, timestampSeconds: start }];
  }).slice(0, 40);
}

export function boundedTranscriptSegments(transcription) {
  if (!Array.isArray(transcription?.segments)) return [];
  let remainingCharacters = 60_000;
  return transcription.segments.flatMap((segment) => {
    if (remainingCharacters <= 0) return [];
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    const rawText = typeof segment?.text === 'string' ? segment.text.trim() : '';
    const text = rawText.slice(0, Math.min(1200, remainingCharacters));
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start || !text) return [];
    remainingCharacters -= text.length;
    return [{ start, end, text }];
  }).slice(0, 600);
}
