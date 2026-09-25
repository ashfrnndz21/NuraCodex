import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewIdentityAdapter, previewIdentityInstructions } from './previewIdentity.mjs';

test('preview verifier accepts only reserved fictional email and phone identities', () => {
  const adapter = createPreviewIdentityAdapter();
  assert.equal(adapter.requestCode('email', previewIdentityInstructions.email).mode, 'synthetic_preview');
  assert.equal(adapter.requestCode('phone', previewIdentityInstructions.phone).mode, 'synthetic_preview');
  assert.throws(() => adapter.requestCode('email', 'person@example.com'), /fictional preview address/);
  assert.throws(() => adapter.requestCode('phone', '+60123456789'), /fictional preview number/);
});

test('wrong, expired, missing and replayed preview codes cannot create a session', () => {
  let now = 10_000;
  const adapter = createPreviewIdentityAdapter({ now: () => now });
  assert.throws(() => adapter.verifyCode('missing', '720720'), /Request a new preview code/);
  const wrongCodeChallenge = adapter.requestCode('email', previewIdentityInstructions.email);
  assert.throws(() => adapter.verifyCode(wrongCodeChallenge.challengeId, '000000'), /not correct/);
  const expiredChallenge = adapter.requestCode('phone', previewIdentityInstructions.phone);
  now += previewIdentityInstructions.expiresInMinutes * 60_000;
  assert.throws(() => adapter.verifyCode(expiredChallenge.challengeId, previewIdentityInstructions.code), /expired/);
  const replayChallenge = adapter.requestCode('email', previewIdentityInstructions.email);
  const session = adapter.verifyCode(replayChallenge.challengeId, previewIdentityInstructions.code);
  assert.equal(session.profileId, 'fictional-preview-profile');
  assert.equal(session.mode, 'synthetic_preview');
  assert.throws(() => adapter.verifyCode(replayChallenge.challengeId, previewIdentityInstructions.code), /already been used/);
});

test('restored session accepts only the synthetic preview profile marker', () => {
  const adapter = createPreviewIdentityAdapter();
  assert.equal(adapter.restoreSession({ mode: 'production', profileId: 'another-profile' }), null);
  assert.equal(adapter.restoreSession({ mode: 'synthetic_preview', profileId: 'fictional-preview-profile' }).mode, 'synthetic_preview');
});
