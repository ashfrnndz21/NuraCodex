import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PRIVACY_SETTINGS, PRIVACY_PURPOSES, privacyPurposeDecision } from './PrivacyConsentPolicy.mjs';

test('privacy policy allows an AI request only after per-run consent is still checked separately', () => {
  assert.deepEqual(privacyPurposeDecision(DEFAULT_PRIVACY_SETTINGS, PRIVACY_PURPOSES.AI_PROCESSING), { allowed: true, reason: null });
});

test('withdrawing AI processing blocks AI answers and document review', () => {
  const settings = { ...DEFAULT_PRIVACY_SETTINGS, aiProcessing: false };
  assert.equal(privacyPurposeDecision(settings, PRIVACY_PURPOSES.AI_PROCESSING).reason, 'ai_processing_withdrawn');
  assert.equal(privacyPurposeDecision(settings, PRIVACY_PURPOSES.DOCUMENT_REVIEW).allowed, false);
});

test('public health search can be withdrawn without withdrawing Ask', () => {
  const settings = { ...DEFAULT_PRIVACY_SETTINGS, publicHealthSearch: false };
  assert.equal(privacyPurposeDecision(settings, PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH).reason, 'public_health_search_withdrawn');
  assert.equal(privacyPurposeDecision(settings, PRIVACY_PURPOSES.AI_PROCESSING).allowed, true);
});

test('public health search remains available when AI processing is withdrawn', () => {
  const settings = { ...DEFAULT_PRIVACY_SETTINGS, aiProcessing: false, publicHealthSearch: true };
  assert.deepEqual(privacyPurposeDecision(settings, PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH), { allowed: true, reason: null });
  assert.equal(privacyPurposeDecision(settings, PRIVACY_PURPOSES.AI_PROCESSING).reason, 'ai_processing_withdrawn');
  assert.equal(privacyPurposeDecision(settings, PRIVACY_PURPOSES.DOCUMENT_REVIEW).reason, 'ai_processing_withdrawn');
});

test('unknown processing purposes fail closed', () => {
  assert.deepEqual(privacyPurposeDecision(DEFAULT_PRIVACY_SETTINGS, 'unknown'), { allowed: false, reason: 'unknown_purpose' });
});
