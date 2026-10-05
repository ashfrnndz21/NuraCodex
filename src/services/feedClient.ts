import { createHealthFeedSearchPayload } from './feedSearchConsent.mjs';
import { invalidateDemoSessionToken, requireDemoSessionAuthorizationHeader } from './demoSessionToken';

export type FeedTopic = { id: string; label: string };
export type FeedResult = { id: string; title: string; detail: string; url: string; publisher: string; topic: string; retrievedAt: string; thumbnailUrl?: string; publishedAt?: string };
export type FeedBrief = { id: string; topic: string; summary: string; sourceIds: string[] };
export type FeedPersonalizationInput = { topic: string; title: string; summary: string; mediaType: 'article' | 'video'; facts: { label: string; value: string; date?: string }[]; treatments: { name: string; purpose?: string }[] };
export type PersonalizedFeedNote = { index: number; headline: string; learnFromSource: string };
export type FeedActivity = { id: string; label: string; status: 'started' | 'complete' | 'failed'; detail?: string };
type FeedEvent = { type: 'run_started'; runId: string } | ({ type: 'trace' } & FeedActivity) | { type: 'feed_items'; items: FeedResult[]; briefs: FeedBrief[] } | { type: 'run_finished'; runId: string } | { type: 'run_error'; message: string; safeCode?: string };

const baseUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');

export async function personalizeHealthFeed(items: FeedPersonalizationInput[], personalizationConsent: boolean): Promise<PersonalizedFeedNote[]> {
  if (personalizationConsent !== true) throw new Error('Choose the separate AI personalization option before requesting personalized notes.');
  let authorization: string;
  try { authorization = requireDemoSessionAuthorizationHeader(); }
  catch (error) { throw error instanceof Error ? error : new Error('Sign in to continue with the local Nura preview.'); }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/health/feed/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization },
      body: JSON.stringify({ personalizationConsent: true, items }),
    });
  } catch {
    throw new Error('The feed loaded, but Nura could not reach its personalized note service.');
  }
  if (response.status === 401 || response.status === 403) {
    invalidateDemoSessionToken();
    throw new Error('Your local preview session ended. Sign in again to continue.');
  }
  let body: { notes?: PersonalizedFeedNote[]; message?: string } = {};
  try { body = await response.json() as typeof body; } catch { /* Use a safe local fallback. */ }
  if (!response.ok || !Array.isArray(body.notes) || body.notes.length !== items.length) {
    throw new Error(body.message || 'The feed loaded, but Nura could not prepare personalized notes.');
  }
  return body.notes.filter((note) => Number.isInteger(note.index) && note.index >= 0 && note.index < items.length
    && typeof note.headline === 'string' && typeof note.learnFromSource === 'string');
}

export function searchHealthFeed(topics: FeedTopic[], onActivity: (activity: FeedActivity) => void, consentConfirmed: boolean, excludeUrls: string[] = []): Promise<{ items: FeedResult[]; briefs: FeedBrief[] }> {
  return new Promise((resolve, reject) => {
    let payload: ReturnType<typeof createHealthFeedSearchPayload>;
    try { payload = createHealthFeedSearchPayload(topics, consentConfirmed, { excludeUrls }); }
    catch (error) { reject(error); return; }
    let authorization: string;
    try { authorization = requireDemoSessionAuthorizationHeader(); }
    catch (error) { reject(error); return; }
    const xhr = new XMLHttpRequest();
    let cursor = 0;
    let buffer = '';
    let eventName = '';
    let dataLines: string[] = [];
    let finished = false;
    let sawFinish = false;
    let items: FeedResult[] = [];
    let briefs: FeedBrief[] = [];
    const fail = (message: string) => { if (finished) return; finished = true; reject(new Error(message)); };
    const dispatch = () => {
      if (!dataLines.length) { eventName = ''; return; }
      try {
        const value = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
        const event = { ...value, type: eventName || String(value.type ?? '') } as FeedEvent;
        if (event.type === 'trace') onActivity({ id: event.id, label: event.label, status: event.status, detail: event.detail });
        if (event.type === 'feed_items') { items = Array.isArray(event.items) ? event.items : []; briefs = Array.isArray(event.briefs) ? event.briefs : []; }
        if (event.type === 'run_finished') sawFinish = true;
        if (event.type === 'run_error') fail(event.message);
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Nura could not read the feed response.');
      }
      eventName = '';
      dataLines = [];
    };
    const consume = () => {
      const text = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) dispatch();
        else if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
    };
    xhr.open('POST', `${baseUrl}/v1/health/feed`);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.setRequestHeader('authorization', authorization);
    xhr.setRequestHeader('accept', 'text/event-stream');
    xhr.timeout = 90_000;
    xhr.onprogress = consume;
    xhr.onload = () => {
      consume();
      if (finished) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        if (xhr.status === 401 || xhr.status === 403) {
          invalidateDemoSessionToken();
          fail('Your local preview session ended. Sign in again to continue.');
          return;
        }
        let message = `Nura’s health search returned ${xhr.status}.`;
        try { message = (JSON.parse(xhr.responseText) as { message?: string }).message || message; } catch { /* Keep the safe status message. */ }
        fail(message);
        return;
      }
      if (!sawFinish) { fail('The health search ended before it completed.'); return; }
      finished = true;
      resolve({ items, briefs });
    };
    xhr.onerror = () => fail('Nura could not reach the trusted health search service.');
    xhr.ontimeout = () => fail('The search took too long. Your saved profile was not changed.');
    xhr.onabort = () => fail('This search was stopped.');
    xhr.send(JSON.stringify(payload));
  });
}
