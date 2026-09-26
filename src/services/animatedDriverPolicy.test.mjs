import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeAnimatedDriverFor } from './animatedDriverPolicy.mjs';

test('keeps animations on the native driver for iOS and Android', () => {
  assert.equal(nativeAnimatedDriverFor('ios'), true);
  assert.equal(nativeAnimatedDriverFor('android'), true);
});

test('uses the JavaScript animation driver in web previews', () => {
  assert.equal(nativeAnimatedDriverFor('web'), false);
});

test('unknown platforms safely use the JavaScript animation driver', () => {
  assert.equal(nativeAnimatedDriverFor('windows'), false);
  assert.equal(nativeAnimatedDriverFor('unknown'), false);
});
