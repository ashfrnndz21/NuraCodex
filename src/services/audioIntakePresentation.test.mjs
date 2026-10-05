import assert from 'node:assert/strict';
import test from 'node:test';
import { audioReviewConsentCopy, isAudioReviewProcessable, isSupportedAudioMediaType, resolveStagedIntakeMediaType, stagedIntakeKind } from './audioIntakePresentation.mjs';
import { isSupportedIntakeMediaType } from './intakeFileTypes.mjs';

test('stages supported audio formats with distinct types while leaving server upload types unchanged', () => {
  const examples = [
    ['voice.mp3', undefined, 'audio/mpeg'],
    ['voice.m4a', undefined, 'audio/mp4'],
    ['voice.wav', undefined, 'audio/wav'],
    ['voice.ogg', undefined, 'audio/ogg'],
    ['voice.flac', undefined, 'audio/flac'],
    ['voice.webm', 'audio/webm', 'audio/webm'],
  ];

  for (const [name, mimeType, expected] of examples) {
    const actual = resolveStagedIntakeMediaType({ name, mimeType });
    assert.equal(actual, expected);
    assert.equal(stagedIntakeKind(actual), 'audio');
    assert.equal(isSupportedIntakeMediaType(actual), false, 'audio must not enter the shared server upload allowlist');
    assert.equal(isSupportedAudioMediaType(actual), true, 'audio media types are recognized only by the dedicated consent-gated path');
  }
  assert.equal(resolveStagedIntakeMediaType({ name: 'clip.webm', mimeType: 'video/webm' }), 'video/webm');
  assert.equal(resolveStagedIntakeMediaType({ name: 'clip.webm' }), 'video/webm');
});

test('includes staged audio in review batches behind a separate consent step', () => {
  assert.equal(isAudioReviewProcessable({ kind: 'audio' }), true);
  assert.equal(isAudioReviewProcessable({ kind: 'pdf' }), true);
  assert.equal(isAudioReviewProcessable({ kind: 'video' }), true);
});

test('explains that each recording needs separate approval for transcription and suggestions', () => {
  const copy = audioReviewConsentCopy('clinic-visit.m4a');
  assert.equal(copy.title, 'AUDIO · SEPARATE APPROVAL');
  assert.equal(copy.actionLabel, 'Review this recording');
  assert.match(copy.body, /clinic-visit\.m4a/);
  assert.match(copy.body, /choose whether to send it to OpenAI/);
  assert.match(copy.body, /timestamp/);
  assert.match(copy.body, /stay pending until you review/);
});
