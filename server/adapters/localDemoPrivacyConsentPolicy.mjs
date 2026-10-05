import { randomUUID } from 'node:crypto';
import { DEMO_PROFILE_ID } from '../contracts.mjs';
import {
  DEFAULT_PRIVACY_SETTINGS,
  PRIVACY_CONSENT_POLICY_VERSION,
  PrivacyConsentPolicy,
  privacyPurposeDecision,
} from '../ports/PrivacyConsentPolicy.mjs';

const EVENT_LIMIT = 5_000;

function requireDemoProfile(profileId) {
  if (profileId !== DEMO_PROFILE_ID) throw new Error('Privacy settings are unavailable for this profile.');
}

function cleanEvent(event, profileId) {
  if (!event || event.profileId !== profileId || typeof event.id !== 'string') return null;
  if (!['ai_processing', 'public_health_search'].includes(event.purpose)) return null;
  if (!['enabled', 'withdrawn'].includes(event.decision)) return null;
  if (event.policyVersion !== PRIVACY_CONSENT_POLICY_VERSION || !Number.isFinite(Date.parse(event.recordedAt))) return null;
  return {
    id: event.id,
    profileId,
    purpose: event.purpose,
    decision: event.decision,
    policyVersion: event.policyVersion,
    recordedAt: new Date(event.recordedAt).toISOString(),
  };
}

function cleanSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { ...DEFAULT_PRIVACY_SETTINGS };
  if (typeof settings.aiProcessing !== 'boolean' || typeof settings.publicHealthSearch !== 'boolean') return { ...DEFAULT_PRIVACY_SETTINGS };
  const updatedAt = typeof settings.updatedAt === 'string' && Number.isFinite(Date.parse(settings.updatedAt))
    ? new Date(settings.updatedAt).toISOString()
    : null;
  return {
    aiProcessing: settings.aiProcessing,
    publicHealthSearch: settings.publicHealthSearch,
    policyVersion: PRIVACY_CONSENT_POLICY_VERSION,
    updatedAt,
  };
}

export class LocalDemoPrivacyConsentPolicy extends PrivacyConsentPolicy {
  #repository;
  #now;

  constructor({ repository, now = Date.now } = {}) {
    super();
    if (!repository || typeof repository.getPrivacyConsentState !== 'function' || typeof repository.savePrivacyConsentState !== 'function') {
      throw new TypeError('The local demo privacy policy needs a privacy-state repository.');
    }
    this.#repository = repository;
    this.#now = now;
  }

  async getSettings(profileId) {
    requireDemoProfile(profileId);
    const stored = await this.#repository.getPrivacyConsentState(profileId);
    const events = (Array.isArray(stored?.events) ? stored.events : [])
      .map((event) => cleanEvent(event, profileId))
      .filter(Boolean)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    return { settings: cleanSettings(stored?.settings), events };
  }

  async changeSettings(profileId, input) {
    requireDemoProfile(profileId);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose valid privacy settings.');
    const allowedKeys = new Set(['aiProcessing', 'publicHealthSearch', 'consentConfirmed', 'policyVersion']);
    if (Object.keys(input).some((key) => !allowedKeys.has(key))
      || typeof input.aiProcessing !== 'boolean'
      || typeof input.publicHealthSearch !== 'boolean'
      || (input.consentConfirmed !== undefined && typeof input.consentConfirmed !== 'boolean')
      || (input.policyVersion !== undefined && typeof input.policyVersion !== 'string')) {
      throw new Error('Choose valid privacy settings.');
    }

    const current = await this.getSettings(profileId);
    const reenabled = (!current.settings.aiProcessing && input.aiProcessing)
      || (!current.settings.publicHealthSearch && input.publicHealthSearch);
    if (reenabled && (input.consentConfirmed !== true || input.policyVersion !== PRIVACY_CONSENT_POLICY_VERSION)) {
      const error = new Error('Review and confirm the current privacy terms before turning these requests back on.');
      error.code = 'consent_reconfirmation_required';
      throw error;
    }

    const nextSettings = {
      aiProcessing: input.aiProcessing,
      publicHealthSearch: input.publicHealthSearch,
      policyVersion: PRIVACY_CONSENT_POLICY_VERSION,
      updatedAt: new Date(this.#now()).toISOString(),
    };
    const changed = [];
    if (current.settings.aiProcessing !== nextSettings.aiProcessing) {
      changed.push({ purpose: 'ai_processing', decision: nextSettings.aiProcessing ? 'enabled' : 'withdrawn' });
    }
    if (current.settings.publicHealthSearch !== nextSettings.publicHealthSearch) {
      changed.push({ purpose: 'public_health_search', decision: nextSettings.publicHealthSearch ? 'enabled' : 'withdrawn' });
    }
    if (!changed.length) return current;

    const recordedAt = nextSettings.updatedAt;
    const newEvents = changed.map((change) => ({
      id: randomUUID(), profileId, ...change,
      policyVersion: PRIVACY_CONSENT_POLICY_VERSION,
      recordedAt,
    }));
    const events = [...current.events, ...newEvents].slice(-EVENT_LIMIT);
    await this.#repository.savePrivacyConsentState(profileId, nextSettings, events);
    return { settings: nextSettings, events: [...events].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)) };
  }

  async authorize(profileId, purpose) {
    const state = await this.getSettings(profileId);
    return privacyPurposeDecision(state.settings, purpose);
  }
}
