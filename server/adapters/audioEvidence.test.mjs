import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedTranscriptSegments, mapAudioTranscriptClaims } from './audioEvidence.mjs';

const segments = [{ start: 12.4, end: 15.1, text: 'My blood pressure was 118 over 76 yesterday.' }];
const candidate = { kind: 'measurement', label: 'Blood pressure', value: '118/76', unit: 'mmHg', referenceRange: null, method: null, effectiveAt: null, confidence: 0.8, segmentIndex: 0, quote: '118 over 76', subject: 'self' };

test('maps audio claims to the exact timestamped segment quote', () => {
  const { subject: _subject, ...savedCandidate } = candidate;
  assert.deepEqual(mapAudioTranscriptClaims([candidate], segments), [{ ...savedCandidate, page: null, timestampSeconds: 12.4 }]);
});

test('filters suggestions that are about another person or have unclear subject attribution', () => {
  assert.deepEqual(mapAudioTranscriptClaims([
    { ...candidate, subject: 'other' },
    { ...candidate, subject: 'unclear' },
    { ...candidate, subject: 'self', quote: 'blood pressure was in a healthy range' },
  ], segments), []);
});

test('rejects claims without an exact source quote or a valid segment index', () => {
  assert.deepEqual(mapAudioTranscriptClaims([
    { ...candidate, quote: 'blood pressure was normal' },
    { ...candidate, segmentIndex: 2 },
    { ...candidate, kind: 'coverage_term' },
  ], segments), []);
});

test('bounds transcription segments and drops missing or malformed timestamps', () => {
  assert.deepEqual(boundedTranscriptSegments({ segments: [
    { start: 0, end: 2, text: 'hello' },
    { start: -1, end: 2, text: 'bad' },
    { start: 3, end: 3, text: 'empty' },
    { start: 4, end: 8, text: 'x'.repeat(1300) },
  ] }), [{ start: 0, end: 2, text: 'hello' }, { start: 4, end: 8, text: 'x'.repeat(1200) }]);
});

test('bounds aggregate transcript text before passing it to suggestion extraction', () => {
  const bounded = boundedTranscriptSegments({ segments: [
    { start: 0, end: 1, text: 'x'.repeat(1200) },
    { start: 1, end: 2, text: 'y'.repeat(1200) },
  ] });
  assert.equal(bounded.reduce((total, segment) => total + segment.text.length, 0), 2400);
  const many = boundedTranscriptSegments({ segments: Array.from({ length: 60 }, (_, index) => ({ start: index, end: index + 0.5, text: 'z'.repeat(1200) })) });
  assert.ok(many.reduce((total, segment) => total + segment.text.length, 0) <= 60_000);
});
