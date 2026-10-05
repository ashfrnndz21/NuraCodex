export const PRIVACY_CONSENT_POLICY_VERSION = 'nura-privacy-v1';

export const PRIVACY_PURPOSES = Object.freeze({
  AI_PROCESSING: 'ai_processing',
  PUBLIC_HEALTH_SEARCH: 'public_health_search',
  DOCUMENT_REVIEW: 'document_review',
});

export const DEFAULT_PRIVACY_SETTINGS = Object.freeze({
  aiProcessing: true,
  publicHealthSearch: true,
  policyVersion: PRIVACY_CONSENT_POLICY_VERSION,
  updatedAt: null,
});

const purposes = new Set(Object.values(PRIVACY_PURPOSES));

export function privacyPurposeDecision(settings, purpose) {
  if (!purposes.has(purpose)) return { allowed: false, reason: 'unknown_purpose' };
  if (purpose === PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH) {
    return settings?.publicHealthSearch
      ? { allowed: true, reason: null }
      : { allowed: false, reason: 'public_health_search_withdrawn' };
  }
  if (!settings?.aiProcessing) return { allowed: false, reason: 'ai_processing_withdrawn' };
  return { allowed: true, reason: null };
}

/** Server boundary for reading, changing and enforcing profile privacy choices. */
export class PrivacyConsentPolicy {
  async getSettings(_profileId) {
    throw new Error('getSettings is not implemented.');
  }

  async changeSettings(_profileId, _input) {
    throw new Error('changeSettings is not implemented.');
  }

  async authorize(_profileId, _purpose) {
    throw new Error('authorize is not implemented.');
  }
}
