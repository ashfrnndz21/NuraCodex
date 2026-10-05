import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrustedPrincipal } from './ProfileAccess.mjs';
import { sessionVerificationDenied, sessionVerificationSucceeded } from './SessionVerifier.mjs';
import { verifyRequestSession } from './requestSession.mjs';

const TOKEN = 'synthetic-opaque-session-credential-0123456789abcdefgh';
const principal = createTrustedPrincipal({ issuer: 'synthetic-test', subject: 'synthetic-user' });

function request(authorization) { return { headers: authorization === undefined ? {} : { authorization } }; }

test('request session adapter resolves only a verified bearer principal', async () => {
  const verifier = { verify: async (credential) => credential === TOKEN ? sessionVerificationSucceeded(principal) : sessionVerificationDenied() };
  assert.deepEqual(await verifyRequestSession(request(`Bearer ${TOKEN}`), verifier), { status: 'verified', principal });
});

test('missing, malformed and non-bearer authorization are denied generically', async () => {
  let calls = 0;
  const verifier = { verify: async () => { calls += 1; return sessionVerificationDenied(); } };
  for (const header of [undefined, '', 'Basic abc', `Bearer ${TOKEN.slice(0, 10)}`, `Bearer ${TOKEN} trailing`, ['Bearer', TOKEN]]) {
    assert.deepEqual(await verifyRequestSession(request(header), verifier), sessionVerificationDenied());
  }
  assert.equal(calls, 0, 'malformed credentials are rejected before the verifier');
});

test('verifier failures and unverified results fail closed', async () => {
  assert.deepEqual(await verifyRequestSession(request(`Bearer ${TOKEN}`), { verify: async () => { throw new Error('internal detail'); } }), sessionVerificationDenied());
  assert.deepEqual(await verifyRequestSession(request(`Bearer ${TOKEN}`), { verify: async () => ({ status: 'verified', principal: { issuer: 'spoofed', subject: 'spoofed' } }) }), sessionVerificationDenied());
});
