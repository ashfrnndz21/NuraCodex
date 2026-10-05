import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalDemoPrivacyConsentPolicy } from './localDemoPrivacyConsentPolicy.mjs';
import { LocalDemoRepository } from './localDemoRepository.mjs';
import { DEMO_PROFILE_ID } from '../contracts.mjs';
import { PRIVACY_CONSENT_POLICY_VERSION, PRIVACY_PURPOSES } from '../ports/PrivacyConsentPolicy.mjs';

test('local demo privacy settings persist and record purpose-scoped withdrawals without request content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-privacy-consent-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const policy = new LocalDemoPrivacyConsentPolicy({ repository, now: () => Date.parse('2026-09-29T08:00:00.000Z') });
    const initial = await policy.getSettings(DEMO_PROFILE_ID);
    assert.equal(initial.settings.aiProcessing, true);
    assert.equal(initial.settings.publicHealthSearch, true);
    assert.deepEqual(initial.events, []);

    await policy.changeSettings(DEMO_PROFILE_ID, { aiProcessing: false, publicHealthSearch: true });
    const withdrawn = await new LocalDemoPrivacyConsentPolicy({ repository: new LocalDemoRepository(directory) }).getSettings(DEMO_PROFILE_ID);
    assert.equal(withdrawn.settings.aiProcessing, false);
    assert.equal(withdrawn.settings.publicHealthSearch, true);
    assert.equal(withdrawn.events.length, 1);
    assert.equal(withdrawn.events[0].purpose, 'ai_processing');
    assert.equal(withdrawn.events[0].decision, 'withdrawn');
    assert.equal(withdrawn.events[0].policyVersion, PRIVACY_CONSENT_POLICY_VERSION);
    assert.deepEqual(Object.keys(withdrawn.events[0]).sort(), ['decision', 'id', 'policyVersion', 'profileId', 'purpose', 'recordedAt'].sort());
    assert.equal((await new LocalDemoPrivacyConsentPolicy({ repository: new LocalDemoRepository(directory) }).authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.AI_PROCESSING)).allowed, false);
    assert.equal((await new LocalDemoPrivacyConsentPolicy({ repository: new LocalDemoRepository(directory) }).authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH)).allowed, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('turning a withdrawn purpose back on requires confirmation of the current policy version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-privacy-reconsent-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const policy = new LocalDemoPrivacyConsentPolicy({ repository });
    await policy.changeSettings(DEMO_PROFILE_ID, { aiProcessing: false, publicHealthSearch: false });
    await assert.rejects(policy.changeSettings(DEMO_PROFILE_ID, { aiProcessing: true, publicHealthSearch: false }), { code: 'consent_reconfirmation_required' });
    await assert.rejects(policy.changeSettings(DEMO_PROFILE_ID, { aiProcessing: true, publicHealthSearch: false, consentConfirmed: true, policyVersion: 'old-policy' }), { code: 'consent_reconfirmation_required' });

    const restored = await policy.changeSettings(DEMO_PROFILE_ID, { aiProcessing: true, publicHealthSearch: false, consentConfirmed: true, policyVersion: PRIVACY_CONSENT_POLICY_VERSION });
    assert.equal(restored.settings.aiProcessing, true);
    assert.equal(restored.settings.publicHealthSearch, false);
    assert.equal(restored.events[0].purpose, 'ai_processing');
    assert.equal(restored.events[0].decision, 'enabled');
    assert.equal((await policy.authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.AI_PROCESSING)).allowed, true);
    assert.equal((await policy.authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH)).allowed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('privacy policy refuses any profile outside the local synthetic preview', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-privacy-isolation-'));
  try {
    const policy = new LocalDemoPrivacyConsentPolicy({ repository: new LocalDemoRepository(directory) });
    await assert.rejects(policy.getSettings('another-profile'), /unavailable for this profile/);
    await assert.rejects(policy.authorize('another-profile', PRIVACY_PURPOSES.AI_PROCESSING), /unavailable for this profile/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
