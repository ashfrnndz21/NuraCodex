import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_LIMITS, AUDIO_MEDIA_EXTENSIONS, validateAudioProbe } from './audioProcessor.mjs';

test('local audio preflight accepts only supported media types', () => {
  assert.deepEqual(Object.keys(AUDIO_MEDIA_EXTENSIONS).sort(), ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm'].sort());
});

test('audio duration must be available, contain an audio stream and stay within five minutes', () => {
  assert.equal(validateAudioProbe({ format: { duration: '42.5' }, streams: [{ codec_type: 'audio' }] }), 42.5);
  assert.throws(() => validateAudioProbe({ format: { duration: '30' }, streams: [{ codec_type: 'video' }] }), /does not contain an audio track/);
  assert.throws(() => validateAudioProbe({ format: {}, streams: [{ codec_type: 'audio' }] }), /duration could not be read/);
  assert.throws(() => validateAudioProbe({ format: { duration: '301' }, streams: [{ codec_type: 'audio' }] }), /five minutes or shorter/);
  assert.equal(AUDIO_LIMITS.maxDurationSeconds, 300);
});

test('uses the longest reported stream or container duration', () => {
  assert.equal(validateAudioProbe({ format: { duration: '42' }, streams: [{ codec_type: 'audio', duration: '43.2' }] }), 43.2);
});
