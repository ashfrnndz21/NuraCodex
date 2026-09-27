import assert from 'node:assert/strict';
import test from 'node:test';
import { activityMotionPresentation, shouldUseMotion } from './motionPolicy.mjs';

test('waits for the operating system preference before enabling motion', () => {
  assert.equal(shouldUseMotion(null), false);
  assert.equal(shouldUseMotion(undefined), false);
  assert.equal(shouldUseMotion(true), false);
  assert.equal(shouldUseMotion(false), true);
});

test('keeps real activity state while replacing the spinner in reduced-motion mode', () => {
  assert.deepEqual(activityMotionPresentation(true, true), {
    showSpinner: false,
    showStaticStatus: true,
    busy: true,
  });
  assert.deepEqual(activityMotionPresentation(true, false), {
    showSpinner: true,
    showStaticStatus: false,
    busy: true,
  });
  assert.deepEqual(activityMotionPresentation(false, true), {
    showSpinner: false,
    showStaticStatus: false,
    busy: false,
  });
});
