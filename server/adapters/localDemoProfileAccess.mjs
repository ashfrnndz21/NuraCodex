import { DEMO_PROFILE_ID } from '../contracts.mjs';
import { createTrustedPrincipal, isTrustedPrincipal, ProfileAccess, profileAccessAllowed, profileAccessDenied } from '../ports/ProfileAccess.mjs';

const DEMO_ISSUER = 'nura-local-synthetic-demo';
const DEMO_SUBJECT = 'demo-actor';

/**
 * Local-only authorization for the one synthetic demo profile.
 *
 * This adapter is not production identity, user authentication, or OTP. Its
 * demo principal is a server-side fixture for local development only. A
 * production adapter must validate a real server-verified session and apply
 * account-scoped policy without trusting client-supplied profile identifiers.
 */
export class LocalDemoProfileAccess extends ProfileAccess {
  /** Explicit metadata prevents this fixture from being mistaken for login. */
  identityMode = 'synthetic_demo_only';
  productionIdentity = false;

  async authorize(request) {
    const principal = request?.principal;
    if (!isTrustedPrincipal(principal)) return profileAccessDenied('untrusted_principal');

    if (principal.issuer !== DEMO_ISSUER || principal.subject !== DEMO_SUBJECT) {
      return profileAccessDenied('profile_not_available');
    }
    if (request?.requestedProfileId !== DEMO_PROFILE_ID) {
      return profileAccessDenied('profile_not_available');
    }
    return profileAccessAllowed(DEMO_PROFILE_ID);
  }
}

/** Server-created local fixture; never derive this principal from request data. */
export const LOCAL_DEMO_PRINCIPAL = createTrustedPrincipal({ issuer: DEMO_ISSUER, subject: DEMO_SUBJECT });
