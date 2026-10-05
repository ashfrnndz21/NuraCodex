import { createHash, randomBytes } from 'node:crypto';
import { createTrustedPrincipal } from '../ports/ProfileAccess.mjs';
import { SessionVerifier, sessionVerificationDenied, sessionVerificationSucceeded } from '../ports/SessionVerifier.mjs';

const DEMO_EMAIL = 'preview@nura.test';
const DEMO_PHONE = '+15555550100';
const DEMO_CODE = '720720';
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_ISSUER = 'nura-local-synthetic-demo';
const SESSION_SUBJECT = 'demo-actor';
const DEMO_PRINCIPAL = createTrustedPrincipal({ issuer: SESSION_ISSUER, subject: SESSION_SUBJECT });

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validDemoChallenge(challenge = {}) {
  if (!challenge || typeof challenge !== 'object' || Array.isArray(challenge)) return false;
  const keys = Object.keys(challenge);
  if (keys.length !== 3 || keys.some((key) => !['channel', 'destination', 'code'].includes(key))) return false;
  const { channel, destination, code } = challenge;
  const cleaned = typeof destination === 'string' ? destination.trim() : '';
  const normalizedPhone = cleaned.replace(/[\s()-]/g, '');
  const allowedDestination = channel === 'email'
    ? cleaned.toLowerCase() === DEMO_EMAIL
    : channel === 'phone' && normalizedPhone === DEMO_PHONE;
  return allowedDestination && String(code ?? '').trim() === DEMO_CODE;
}

/**
 * Loopback-only synthetic session adapter. The public sample code grants access
 * only to the fictional local demo profile; it does not prove email/phone
 * ownership and must never be used as production authentication.
 */
export class LocalDemoSessionVerifier extends SessionVerifier {
  #sessions = new Map();
  #now;
  #randomToken;
  identityMode = 'synthetic_demo_only';
  productionIdentity = false;

  constructor({ now = Date.now, randomToken = () => randomBytes(32).toString('base64url'), sessionTtlMs = SESSION_TTL_MS } = {}) {
    super();
    if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs <= 0) throw new RangeError('Session lifetime must be a positive safe integer.');
    this.#now = now;
    this.#randomToken = randomToken;
    this.#sessionTtlMs = sessionTtlMs;
  }

  #sessionTtlMs;

  issueDemoSession(challenge) {
    if (!validDemoChallenge(challenge)) throw new Error('Use the sample preview details shown on the sign-in screen.');
    const token = this.#randomToken();
    if (typeof token !== 'string' || token.length < 40 || token.length > 256) throw new Error('The local demo session could not be created.');
    const expiresAt = this.#now() + this.#sessionTtlMs;
    this.#sessions.set(digest(token), { principal: DEMO_PRINCIPAL, expiresAt, revoked: false });
    return { accessToken: token, expiresAt };
  }

  async verify(opaqueCredential) {
    if (typeof opaqueCredential !== 'string' || opaqueCredential.length < 40 || opaqueCredential.length > 256) return sessionVerificationDenied();
    const key = digest(opaqueCredential);
    const session = this.#sessions.get(key);
    if (!session || session.revoked || this.#now() >= session.expiresAt) {
      this.#sessions.delete(key);
      return sessionVerificationDenied();
    }
    return sessionVerificationSucceeded(session.principal);
  }

  revoke(opaqueCredential) {
    if (typeof opaqueCredential !== 'string' || opaqueCredential.length < 40 || opaqueCredential.length > 256) return false;
    const key = digest(opaqueCredential);
    const session = this.#sessions.get(key);
    if (!session) return false;
    session.revoked = true;
    this.#sessions.delete(key);
    return true;
  }
}
