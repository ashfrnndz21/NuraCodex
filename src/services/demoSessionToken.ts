let activeAccessToken: string | null = null;
let expiresAtMs: number | null = null;
let invalidationHandler: (() => void) | null = null;

export function setDemoSessionToken(accessToken: string | null, expiresAt?: string) {
  activeAccessToken = typeof accessToken === 'string' && accessToken.trim() ? accessToken : null;
  const parsedExpiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  expiresAtMs = activeAccessToken && Number.isFinite(parsedExpiry) ? parsedExpiry : null;
}

export function getDemoSessionToken() {
  return activeAccessToken;
}

export function getDemoSessionAuthorizationHeader() {
  if (activeAccessToken && expiresAtMs !== null && Date.now() >= expiresAtMs) {
    invalidateDemoSessionToken();
    return null;
  }
  return activeAccessToken ? `Bearer ${activeAccessToken}` : null;
}

export function requireDemoSessionAuthorizationHeader() {
  const authorization = getDemoSessionAuthorizationHeader();
  if (!authorization) throw new Error('Sign in to continue with the local Nura preview.');
  return authorization;
}

export function registerDemoSessionInvalidationHandler(handler: () => void) {
  invalidationHandler = handler;
  return () => {
    if (invalidationHandler === handler) invalidationHandler = null;
  };
}

export function invalidateDemoSessionToken() {
  activeAccessToken = null;
  expiresAtMs = null;
  invalidationHandler?.();
}
