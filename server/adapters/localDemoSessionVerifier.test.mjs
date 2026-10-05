import assert from 'node:assert/strict';
import test from 'node:test';
import { previewIdentityInstructions } from '../../src/services/previewIdentity.mjs';
import { isTrustedPrincipal } from '../ports/ProfileAccess.mjs';
import { LocalDemoSessionVerifier } from './localDemoSessionVerifier.mjs';

test('local synthetic sign-in issues an opaque short-lived server session for sample details only', async () => {
  let now = 1_000;
  const token = 'synthetic-opaque-demo-session-token-0123456789abcdef';
  const verifier = new LocalDemoSessionVerifier({ now: () => now, randomToken: () => token });
  const issued = verifier.issueDemoSession({ channel: 'email', destination: previewIdentityInstructions.email, code: previewIdentityInstructions.code });
  assert.equal(issued.accessToken, token);
  const valid = await verifier.verify(token);
  assert.equal(valid.status, 'verified');
  assert.equal(isTrustedPrincipal(valid.principal), true);
  assert.equal(issued.expiresAt, now + 30 * 60 * 1000);
  now = issued.expiresAt;
  assert.deepEqual(await verifier.verify(token), { status: 'denied', principal: null });
});

test('local synthetic sign-in accepts reserved sample channels and denies other identities or codes', () => {
  const verifier = new LocalDemoSessionVerifier({ randomToken: () => 'synthetic-opaque-demo-session-token-0123456789abcdef' });
  assert.doesNotThrow(() => verifier.issueDemoSession({ channel: 'phone', destination: '+1 (555) 555-0100', code: previewIdentityInstructions.code }));
  const invalid = [
    { channel: 'email', destination: 'person@example.com', code: previewIdentityInstructions.code },
    { channel: 'phone', destination: '+1 555 555 0101', code: previewIdentityInstructions.code },
    { channel: 'email', destination: previewIdentityInstructions.email, code: '000000' },
    { channel: 'email', destination: previewIdentityInstructions.email, code: previewIdentityInstructions.code, profileId: 'foreign-profile' },
  ];
  for (const challenge of invalid) assert.throws(() => verifier.issueDemoSession(challenge));
});

test('sign-out revokes only an issued opaque credential', async () => {
  const verifier = new LocalDemoSessionVerifier({ randomToken: () => 'synthetic-opaque-demo-session-token-0123456789abcdef' });
  const issued = verifier.issueDemoSession({ channel: 'email', destination: previewIdentityInstructions.email, code: previewIdentityInstructions.code });
  assert.equal(verifier.revoke('synthetic-unissued-token-0123456789abcdef'), false);
  assert.equal(verifier.revoke(issued.accessToken), true);
  assert.deepEqual(await verifier.verify(issued.accessToken), { status: 'denied', principal: null });
});
