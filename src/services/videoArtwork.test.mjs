import test from 'node:test';
import assert from 'node:assert/strict';
import { getVideoArtworkTheme } from './videoArtwork.mjs';

test('video artwork palette follows the feed topic', () => {
  assert.equal(getVideoArtworkTheme('Cholesterol').id, 'cholesterol');
  assert.equal(getVideoArtworkTheme('Blood sugar').id, 'glucose');
  assert.equal(getVideoArtworkTheme('Heart health').id, 'heart');
});

test('video artwork uses the Nura education palette for an unrecognized or empty topic', () => {
  assert.equal(getVideoArtworkTheme('Kidney health').id, 'general');
  assert.equal(getVideoArtworkTheme('').id, 'general');
  assert.equal(getVideoArtworkTheme(null).id, 'general');
});
