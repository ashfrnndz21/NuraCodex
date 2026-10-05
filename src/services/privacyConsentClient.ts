import { invalidateDemoSessionToken, requireDemoSessionAuthorizationHeader } from './demoSessionToken';

const baseUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');

export type PrivacyPreferencePurpose = 'aiProcessing' | 'publicHealthSearch';
export type PrivacyPreferenceEvent = {
  id: string;
  purpose: 'ai_processing' | 'public_health_search';
  decision: 'enabled' | 'withdrawn';
  policyVersion: string;
  recordedAt: string;
};
export type PrivacyConsentState = {
  mode: 'local_demo_synthetic_only';
  policyVersion: string;
  settings: {
    aiProcessing: boolean;
    publicHealthSearch: boolean;
    policyVersion: string;
    updatedAt: string | null;
  };
  events: PrivacyPreferenceEvent[];
};

async function request(method: 'GET' | 'PUT', input?: {
  aiProcessing: boolean;
  publicHealthSearch: boolean;
  consentConfirmed?: boolean;
  policyVersion?: string;
}): Promise<PrivacyConsentState> {
  const authorization = requireDemoSessionAuthorizationHeader();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/privacy/consent-preferences`, {
      method,
      headers: {
        accept: 'application/json',
        authorization,
        ...(input ? { 'content-type': 'application/json' } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
  } catch {
    throw new Error('Nura could not reach the local service to update your privacy choices. Try again.');
  }
  if (response.status === 401 || response.status === 403) {
    invalidateDemoSessionToken();
    throw new Error('Your local preview session ended. Sign in again to continue.');
  }
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const message = body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : 'Nura could not update your privacy choices. Try again.';
    throw new Error(message);
  }
  if (!body || typeof body !== 'object') throw new Error('Nura returned an unreadable privacy settings response.');
  const state = body as Partial<PrivacyConsentState>;
  if (state.mode !== 'local_demo_synthetic_only'
    || typeof state.policyVersion !== 'string'
    || typeof state.settings?.aiProcessing !== 'boolean'
    || typeof state.settings.publicHealthSearch !== 'boolean'
    || !Array.isArray(state.events)) {
    throw new Error('Nura returned incomplete privacy settings. Try again.');
  }
  return state as PrivacyConsentState;
}

export function getPrivacyConsentState() {
  return request('GET');
}

export function updatePrivacyConsentState(input: {
  aiProcessing: boolean;
  publicHealthSearch: boolean;
  consentConfirmed?: boolean;
  policyVersion?: string;
}) {
  return request('PUT', input);
}
