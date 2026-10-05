import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createAudioIntakeProcessor } from './audioIntake.mjs';
import { hasAudioProcessingConsent, OPENAI_AUDIO_PROCESSING_CONSENT } from '../ports/AudioTranscription.mjs';

test('audio processing consent is exact and versioned independently from file review consent', () => {
  assert.equal(hasAudioProcessingConsent(OPENAI_AUDIO_PROCESSING_CONSENT), true);
  assert.equal(hasAudioProcessingConsent('true'), false);
  assert.equal(hasAudioProcessingConsent('openai-transcription-and-health-suggestions-v0'), false);
  assert.equal(hasAudioProcessingConsent(undefined), false);
});

test('audio processor runs local preflight, mocked transcription and exact-quote claim mapping in order', async () => {
  const calls = [];
  const processAudioIntake = createAudioIntakeProcessor({
    inspectDuration: async () => { calls.push('inspect'); return 8.5; },
    transcriptionPort: { transcribe: async () => {
      calls.push('transcribe');
      return { duration: 8.5, segments: [{ start: 1.5, end: 4, text: 'My blood pressure was 118 over 76.' }] };
    } },
    suggestClaims: async ({ segments }) => {
      calls.push('suggest');
      assert.deepEqual(segments, [{ start: 1.5, end: 4, text: 'My blood pressure was 118 over 76.' }]);
      return { claims: [
        { kind: 'measurement', label: 'Blood pressure', value: '118/76', unit: 'mmHg', segmentIndex: 0, quote: 'blood pressure was 118 over 76', subject: 'self' },
        { kind: 'measurement', label: 'Unsupported quote', value: '99', unit: null, segmentIndex: 0, quote: 'the reading was 99' },
      ] };
    },
  });

  const result = await processAudioIntake({ bytes: Buffer.from('synthetic'), filename: 'recording.wav', mediaType: 'audio/wav' });
  assert.deepEqual(calls, ['inspect', 'transcribe', 'suggest']);
  assert.deepEqual(result, {
    claims: [{ kind: 'measurement', label: 'Blood pressure', value: '118/76', unit: 'mmHg', segmentIndex: 0, quote: 'blood pressure was 118 over 76', page: null, timestampSeconds: 1.5 }],
    documentContext: null,
    audio: { durationSeconds: 8.5, segmentCount: 1 },
  });
});

test('audio processor checks cancellation after local validation before calling the transcription port', async () => {
  const calls = [];
  const controller = new AbortController();
  const processAudioIntake = createAudioIntakeProcessor({
    inspectDuration: async () => { controller.abort(); return 8; },
    transcriptionPort: { transcribe: async () => calls.push('transcribe') },
    suggestClaims: async () => calls.push('suggest'),
  });
  await assert.rejects(processAudioIntake({ bytes: Buffer.from('synthetic'), filename: 'voice.wav', mediaType: 'audio/wav', signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(calls, [], 'an aborted local check must not transfer audio or transcript');
});

test('audio processor stops before transcript suggestions if cancellation arrives during transcription', async () => {
  const calls = [];
  const controller = new AbortController();
  const processAudioIntake = createAudioIntakeProcessor({
    inspectDuration: async () => 8,
    transcriptionPort: { transcribe: async () => {
      calls.push('transcribe');
      controller.abort();
      return { duration: 8, segments: [{ start: 0, end: 3, text: 'A synthetic health detail.' }] };
    } },
    suggestClaims: async () => { calls.push('suggest'); return { claims: [] }; },
  });
  await assert.rejects(processAudioIntake({ bytes: Buffer.from('synthetic'), filename: 'voice.wav', mediaType: 'audio/wav', signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(calls, ['transcribe'], 'cancelled transcription must not be followed by health-detail suggestion generation');
});
