import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedTranscriptSegments, mapAudioTranscriptClaims } from './audioEvidence.mjs';

const segments = [{ start: 12.4, end: 15.1, text: 'My blood pressure was 118 over 76 yesterday.' }];
const candidate = { kind: 'measurement', label: 'Blood pressure', value: '118/76', unit: 'mmHg', referenceRange: null, method: null, effectiveAt: null, confidence: 0.8, segmentIndex: 0, quote: '118 over 76' };

test('maps audio claims to the exact timestamped segment quote', () => {
  assert.deepEqual(mapAudioTranscriptClaims([candidate], segments), [{ ...candidate, page: null, timestampSeconds: 12.4 }]);
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
