/**
 * Server-side profile authorization port.
 *
 * A caller must pass a principal created after a trusted server-side session
 * verifier has completed. A client request body or profile ID is never proof
 * of identity. This port and its local demo adapter do not implement login,
 * OTP, or production identity.
 */
const trustedPrincipals = new WeakSet();

/**
 * Mint an in-process principal capability after an upstream verifier succeeds.
 * This helper does not authenticate its input; only trusted server code may
 * call it after verifying a session. The WeakSet brand cannot be recreated
 * from JSON or by copying the visible issuer/subject fields.
 *
 * @param {{issuer:string, subject:string}} input
 */
export function createTrustedPrincipal(input) {
  const issuer = typeof input?.issuer === 'string' ? input.issuer.trim() : '';
  const subject = typeof input?.subject === 'string' ? input.subject.trim() : '';
  if (!issuer || !subject) throw new Error('A verified principal needs an issuer and subject.');
  const principal = Object.freeze({ issuer, subject });
  trustedPrincipals.add(principal);
  return principal;
}

export function isTrustedPrincipal(principal) {
  return principal !== null && typeof principal === 'object' && trustedPrincipals.has(principal);
}

export function profileAccessDenied(reason = 'profile_not_available') {
  return { status: 'denied', profileId: null, reason };
}

export function profileAccessAllowed(profileId) {
  return { status: 'allowed', profileId, reason: null };
}

/** Implementations are adapters; callers depend on this port contract. */
export class ProfileAccess {
  /** @param {{principal:object, requestedProfileId:string}} _request */
  async authorize(_request) {
    throw new Error('authorize is not implemented.');
  }
}
