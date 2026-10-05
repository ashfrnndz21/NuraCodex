import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCompleteProfileSetup,
  completeProfileSetupProgress,
  INITIAL_PROFILE_SETUP_PROGRESS,
  normalizeProfileSetupProgress,
  setProfileSetupSection,
} from './profileSetupProgress.mjs';

test('new setup remains incomplete until every section is explicitly resolved', () => {
  assert.equal(canCompleteProfileSetup(INITIAL_PROFILE_SETUP_PROGRESS), false);
  let progress = setProfileSetupSection(INITIAL_PROFILE_SETUP_PROGRESS, 'healthRecords', 'none');
  progress = setProfileSetupSection(progress, 'medicines', 'saved');
  assert.equal(canCompleteProfileSetup(progress), false);
  progress = setProfileSetupSection(progress, 'insurance', 'none');
  assert.equal(canCompleteProfileSetup(progress), true);
  assert.deepEqual(completeProfileSetupProgress(progress), { ...progress, finalReview: true, complete: true });
});

test('changing a resolved section requires final review again', () => {
  const complete = completeProfileSetupProgress({
    started: true, healthRecords: 'saved', medicines: 'none', insurance: 'saved', finalReview: false, complete: false,
  });
  const reopened = setProfileSetupSection(complete, 'insurance', 'pending');
  assert.equal(reopened.finalReview, false);
  assert.equal(reopened.complete, false);
  assert.equal(canCompleteProfileSetup(reopened), false);
});

test('a source review can be deferred without blocking setup completion', () => {
  let progress = setProfileSetupSection(INITIAL_PROFILE_SETUP_PROGRESS, 'healthRecords', 'deferred');
  progress = setProfileSetupSection(progress, 'medicines', 'none');
  progress = setProfileSetupSection(progress, 'insurance', 'deferred');

  assert.equal(canCompleteProfileSetup(progress), true);
  assert.equal(progress.healthRecords, 'deferred');
  assert.equal(progress.insurance, 'deferred');
  assert.equal(normalizeProfileSetupProgress(progress).healthRecords, 'deferred');
  assert.equal(completeProfileSetupProgress(progress).complete, true);
});

test('finishing a deferred review after onboarding keeps the profile setup complete', () => {
  const complete = completeProfileSetupProgress({
    started: true, healthRecords: 'deferred', medicines: 'none', insurance: 'saved', finalReview: false, complete: false,
  });
  const reviewed = setProfileSetupSection(complete, 'healthRecords', 'saved');
  assert.equal(reviewed.finalReview, true);
  assert.equal(reviewed.complete, true);
});

test('legacy or malformed values normalize to a safe incomplete state', () => {
  assert.deepEqual(normalizeProfileSetupProgress(null), { ...INITIAL_PROFILE_SETUP_PROGRESS });
  assert.equal(normalizeProfileSetupProgress({ started: true, healthRecords: 'maybe', complete: true }).complete, false);
  assert.equal(canCompleteProfileSetup({ started: true, healthRecords: 'maybe', medicines: 'none', insurance: 'none' }), false);
});
