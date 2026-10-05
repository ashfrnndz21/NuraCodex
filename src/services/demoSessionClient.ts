import type { PreviewIdentityChannel } from './previewIdentity.mjs';

const baseUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');
const SESSION_CHECK_TIMEOUT_MS = 3_000;

export type DemoServerSession = {
  mode: 'synthetic_demo_session';
  accessToken: string;
  expiresAt: string;
};

function validSession(value: unknown): value is DemoServerSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<DemoServerSession>;
  return session.mode === 'synthetic_demo_session'
    && typeof session.accessToken === 'string'
    && /^[A-Za-z0-9_-]{40,256}$/.test(session.accessToken)
    && typeof session.expiresAt === 'string'
    && Number.isFinite(Date.parse(session.expiresAt))
    && Date.now() < Date.parse(session.expiresAt);
}

export async function createDemoServerSession(channel: PreviewIdentityChannel, destination: string, code: string): Promise<DemoServerSession> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/demo/session`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ channel, destination, code }),
    });
  } catch {
    throw new Error('Nura could not reach the local preview sign-in service. Your details were not saved. Try again.');
  }
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !validSession(body)) {
    throw new Error('The local preview could not be opened. Check the sample access code and try again.');
  }
  return body;
}

/** Returns false for an invalid/revoked credential and throws only when verification cannot be reached. */
export async function validateDemoServerSession(accessToken: string): Promise<boolean> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);
  try {
    response = await fetch(`${baseUrl}/v1/demo/session`, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch {
    throw new Error('The local preview sign-in service could not be reached.');
  } finally {
    clearTimeout(timeout);
  }
  if (response.status >= 400 && response.status < 500) return false;
  if (!response.ok) throw new Error('The local preview sign-in service could not verify this session.');
  let body: unknown;
  try { body = await response.json(); } catch { return false; }
  return Boolean(body && typeof body === 'object' && (body as { valid?: unknown }).valid === true);
}

export async function revokeDemoServerSession(accessToken: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${baseUrl}/v1/demo/session`, {
      method: 'DELETE',
      headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    // An already-expired or previously-revoked session is also safely signed out.
    if (!response.ok && response.status !== 401) throw new Error('The local preview could not confirm sign-out.');
  } catch {
    throw new Error('The local preview could not confirm sign-out.');
  } finally {
    clearTimeout(timeout);
  }
}
