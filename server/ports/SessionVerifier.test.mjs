import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrustedPrincipal, isTrustedPrincipal } from './ProfileAccess.mjs';
import { SessionVerifier, sessionVerificationDenied, sessionVerificationSucceeded } from './SessionVerifier.mjs';

const VALID_CREDENTIAL = 'opaque.synthetic.session.valid-01';
const EXPIRED_CREDENTIAL = 'opaque.synthetic.session.expired-01';
const REVOKED_CREDENTIAL = 'opaque.synthetic.session.revoked-01';

function createFixture() {
  let currentTime = 10_000;
  return {
    validCredential: VALID_CREDENTIAL,
    expiredCredential: EXPIRED_CREDENTIAL,
    revokedCredential: REVOKED_CREDENTIAL,
    now: () => currentTime,
    advanceTo: (nextTime) => { currentTime = nextTime; },
    principal: createTrustedPrincipal({ issuer: 'synthetic-session-test', subject: 'synthetic-user-01' }),
  };
}

/** First test adapter: explicit session records with per-record state. */
class RecordMapSessionVerifier extends SessionVerifier {
  #sessions;
  #now;

  constructor(fixture) {
    super();
    this.#now = fixture.now;
    this.#sessions = new Map([
      [fixture.validCredential, { principal: fixture.principal, expiresAt: 20_000, revoked: false }],
      [fixture.expiredCredential, { principal: fixture.principal, expiresAt: 9_999, revoked: false }],
      [fixture.revokedCredential, { principal: fixture.principal, expiresAt: 20_000, revoked: true }],
    ]);
  }

  async verify(opaqueCredential) {
    if (typeof opaqueCredential !== 'string' || !opaqueCredential.trim()) return sessionVerificationDenied();
    const session = this.#sessions.get(opaqueCredential);
    if (!session || session.revoked || this.#now() >= session.expiresAt) return sessionVerificationDenied();
    return sessionVerificationSucceeded(session.principal);
  }
}

/** Second test adapter: active-token index plus independent expiry/revocation sets. */
class ActiveIndexSessionVerifier extends SessionVerifier {
  #activePrincipals;
  #expirations;
  #revoked;
  #now;

  constructor(fixture) {
    super();
    this.#now = fixture.now;
    this.#activePrincipals = new Map([[fixture.validCredential, fixture.principal]]);
    this.#expirations = new Map([
      [fixture.validCredential, 20_000],
      [fixture.expiredCredential, 9_999],
      [fixture.revokedCredential, 20_000],
    ]);
    this.#revoked = new Set([fixture.revokedCredential]);
  }

  async verify(opaqueCredential) {
    if (typeof opaqueCredential !== 'string' || !opaqueCredential.trim()) return sessionVerificationDenied();
    if (this.#revoked.has(opaqueCredential)) return sessionVerificationDenied();
    const expiresAt = this.#expirations.get(opaqueCredential);
    const principal = this.#activePrincipals.get(opaqueCredential);
    if (!principal || expiresAt === undefined || this.#now() >= expiresAt) return sessionVerificationDenied();
    return sessionVerificationSucceeded(principal);
  }
}

async function assertSessionVerifierConformance(VerifierAdapter) {
  const fixture = createFixture();
  const verifier = new VerifierAdapter(fixture);

  const verified = await verifier.verify(fixture.validCredential);
  assert.equal(verified.status, 'verified');
  assert.equal(verified.principal, fixture.principal);
  assert.equal(isTrustedPrincipal(verified.principal), true);

  const denied = sessionVerificationDenied();
  for (const missing of [undefined, null, '']) {
    assert.deepEqual(await verifier.verify(missing), denied, `missing credential ${String(missing)}`);
  }

  const serializedIdentity = JSON.stringify({
    principal: { issuer: fixture.principal.issuer, subject: fixture.principal.subject },
    profileId: 'synthetic-foreign-profile',
  });
  for (const malformed of [
    {},
    { credential: fixture.validCredential },
    { principal: { issuer: fixture.principal.issuer, subject: fixture.principal.subject } },
    { profileId: 'synthetic-foreign-profile' },
    '   ',
    serializedIdentity,
  ]) {
    assert.deepEqual(await verifier.verify(malformed), denied, 'malformed or client-supplied identity is denied generically');
  }

  assert.deepEqual(await verifier.verify(fixture.expiredCredential), denied, 'expired credential is denied');
  assert.deepEqual(await verifier.verify(fixture.revokedCredential), denied, 'revoked credential is denied');

  // A session that was valid can no longer be used after its validity window.
  fixture.advanceTo(20_000);
  assert.deepEqual(await verifier.verify(fixture.validCredential), denied, 'session expires at its boundary');
}

test('record-map verifier satisfies the shared opaque-session contract', async () => {
  await assertSessionVerifierConformance(RecordMapSessionVerifier);
});

test('active-index verifier passes the same contract after an adapter swap', async () => {
  await assertSessionVerifierConformance(ActiveIndexSessionVerifier);
});

test('verified results reject principals reconstructed from JSON', () => {
  const serializedPrincipal = JSON.parse(JSON.stringify({ issuer: 'synthetic', subject: 'synthetic-user' }));
  assert.throws(() => sessionVerificationSucceeded(serializedPrincipal), /server-trusted principal/);
});

test('base port remains abstract', async () => {
  await assert.rejects(new SessionVerifier().verify('opaque.synthetic.credential'), /verify is not implemented/);
});
