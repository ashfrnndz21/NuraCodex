import { hasExistingProfileEvidence } from './profileDemographics.mjs';

const setupRoutes = new Set(['/', '/sign-in']);

/** Keep a new signed-in preview on the required profile setup before other app routes. */
export function shouldRedirectToProfileSetup(pathname, profile = {}) {
  const path = String(pathname || '/').split('?')[0] || '/';
  if (setupRoutes.has(path)) return false;

  // Preserve established records; the fresh demo's fictional fixtures do not count as user history.
  return !hasExistingProfileEvidence(profile);
}
