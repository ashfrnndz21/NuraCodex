import { isTrustedPrincipal } from './ProfileAccess.mjs';
import { sessionVerificationDenied } from './SessionVerifier.mjs';

/** Read a bearer credential from an HTTP-like request and resolve its principal through the verifier port. */
export async function verifyRequestSession(request, sessionVerifier) {
  const authorization = request?.headers?.authorization;
  if (typeof authorization !== 'string') return sessionVerificationDenied();
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,256})$/);
  if (!match) return sessionVerificationDenied();
  try {
    const result = await sessionVerifier.verify(match[1]);
    return result?.status === 'verified' && isTrustedPrincipal(result.principal)
      ? result
      : sessionVerificationDenied();
  } catch {
    return sessionVerificationDenied();
  }
}
