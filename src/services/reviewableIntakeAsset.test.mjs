import assert from 'node:assert/strict';
import test from 'node:test';
import { isReviewableIntakeAsset } from './reviewableIntakeAsset.mjs';

test('does not queue a synthetic timeline placeholder as an attached medical file', () => {
  assert.equal(isReviewableIntakeAsset({ uri: 'demo://example-blood-test.pdf', kind: 'pdf' }, 'medical'), false);
});

test('keeps browser-stored files and medical videos reviewable', () => {
  assert.equal(isReviewableIntakeAsset({ uri: 'nura-local-asset://sample', kind: 'pdf' }, 'medical'), true);
  assert.equal(isReviewableIntakeAsset({ uri: 'file:///sample.mp4', kind: 'video' }, 'medical'), true);
});

test('does not offer videos to the insurance registry', () => {
  assert.equal(isReviewableIntakeAsset({ uri: 'file:///policy.mp4', kind: 'video' }, 'insurance'), false);
});
