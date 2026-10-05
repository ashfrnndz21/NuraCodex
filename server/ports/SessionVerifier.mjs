import { isTrustedPrincipal } from './ProfileAccess.mjs';

/**
 * A generic denial deliberately reveals no information about a credential.
 * Verifier adapters must return this shape for missing, malformed, expired,
 * revoked, or otherwise invalid credentials.
 */
export function sessionVerificationDenied() {
  return Object.freeze({ status: 'denied', principal: null });
}

/**
 * Build a verified result only from a principal minted by trusted server code
 * after validating an opaque session credential.
 *
 * This helper does not authenticate credentials and does not accept a JSON
 * principal, profile ID, or client-supplied identity as proof.
 *
 * @param {object} principal
 */
export function sessionVerificationSucceeded(principal) {
  if (!isTrustedPrincipal(principal)) {
    throw new TypeError('A verified session requires a server-trusted principal.');
  }
  return Object.freeze({ status: 'verified', principal });
}

/** Provider-neutral server-side session verification port. */
export class SessionVerifier {
  /**
   * Verify an opaque credential presented by a request. Implementations must
   * derive the principal from verified server-side session state, never from
   * principal/profile JSON supplied by the caller.
   *
   * @param {unknown} _opaqueCredential
   * @returns {Promise<
   *   {status: 'verified', principal: object} |
   *   {status: 'denied', principal: null}
   * >}
   */
  async verify(_opaqueCredential) {
    throw new Error('verify is not implemented.');
  }
}
