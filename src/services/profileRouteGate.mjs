import { ageFromDateOfBirth, hasExistingProfileEvidence } from './profileDemographics.mjs';

const alwaysOpenRoutes = new Set(['/', '/sign-in', '/privacy']);
const setupRoutes = new Set(['/setup', '/intake', '/review', '/insurance', '/treatment', '/registry', '/profile-summary']);

/** Keep a new signed-in preview on the required profile setup before other app routes. */
export function shouldRedirectToProfileSetup(pathname, profile = {}) {
  const path = String(pathname || '/').split('?')[0] || '/';
  if (alwaysOpenRoutes.has(path)) return false;

  // Every profile needs a valid birth date before protected health views open.
  if (ageFromDateOfBirth(profile.birthday) === null) return true;

  // A newly started first-run journey must resolve every registry and the final review before Home or other app areas open.
  if (profile.setupProgress?.started && profile.setupProgress.complete !== true) return !setupRoutes.has(path);

  // Preserve established records; the fresh demo's fictional fixtures do not count as user history.
  if (setupRoutes.has(path)) return !hasExistingProfileEvidence(profile);
  return !hasExistingProfileEvidence(profile);
}
