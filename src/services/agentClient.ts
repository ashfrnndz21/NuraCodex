import { invalidateDemoSessionToken, requireDemoSessionAuthorizationHeader } from './demoSessionToken';
import { agentRunFailureMessage } from './agentRunFailure.mjs';

export type AgentSource = { reference: string; id: string; title: string; detail: string; date: string; source: string; status: string; kind: string; category?: string; url?: string; publisher?: string };
export type AgentTrace = { id: string; label: string; status: 'started' | 'complete'; detail?: string };
export type CoverageAssessment = { kind: 'explicit_benefit' | 'explicit_limit' | 'explicit_exclusion' | 'unclear'; policyReference: string; detail: string; relatedHealthReferences: string[] };
export type AgentMeaning = { text: string; citations: string[] };
export type AgentAnswer = { answer: string; citations: string[]; meaning?: AgentMeaning; unknowns: string[]; nextSteps: string[]; coverageAssessments?: CoverageAssessment[]; memoryProposal: { label: string; value: string; reason: string; sourceKind?: 'selected_record' | 'user_request' | 'user_statement'; sourceReferences?: string[] } | null };
export type AgentAvailability = { available: boolean; provider?: string; model?: string; reason?: string; failureCode?: 'ai_credential_rejected'; capabilities?: { documentExtraction?: boolean; trustedHealthSearch?: boolean; youtubeVideoSearch?: boolean } };
export type AgentEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'trace'; id: string; label: string; status: 'started' | 'complete'; detail?: string }
  | { type: 'evidence'; sources: AgentSource[] }
  | ({ type: 'answer' } & AgentAnswer)
  | { type: 'run_finished'; runId: string }
  | { type: 'run_error'; message: string; safeCode?: string };
export type AgentRunInput = {
  runId: string;
  mode?: 'symptom_support';
  question: string;
  consentConfirmed: true;
  history: { role: 'user' | 'assistant'; content: string; readingSource?: { title: string; publisher?: string; topic?: string; mediaType?: 'article' | 'video'; summary?: string; url?: string } }[];
  recentMessagesConsent?: boolean;
  externalSearchConsent: boolean;
  treatmentContextConsent: boolean;
  visitContextConsent: boolean;
  sourceContextConsent?: boolean;
  historyContextConsent?: boolean;
  derivedAgeConsent?: boolean;
  readingSource?: { title: string; publisher?: string; topic?: string; mediaType?: 'article' | 'video'; summary?: string; url?: string };
  context: {
    facts: { id: string; label: string; value: string; date: string; category: string; source: string; status: string; sourceId?: string; sourceClaimId?: string; reviewState?: string; validFrom?: string; validUntil?: string | null }[];
    topics: { id: string; label: string }[];
    links: { id: string; from: string; to: string; label: string; createdAt: string }[];
    treatments: { id: string; name: string; dose: string; schedule: string; purpose: string; prescriber: string; careLocation: string; pharmacy: string; status: 'current' | 'past'; startedOn: string; endedOn: string; source: string }[];
    visits: { id: string; purpose: string; appointmentAt: string; clinician: string; location: string; status: 'upcoming' | 'completed'; source: string; questions: string[]; outcome: string; followUp: string; followUpActions: { id: string; title: string; dueOn: string; status: 'open' | 'done'; source: string }[] }[];
    demographics?: { ageAtMeasurement: number; measurementDate: string };
    documentSources?: { id: string; title: string; documentType: string; dates: { kind: string; value: string; page: number | null; quote: string }[]; entities: { kind: string; value: string; page: number | null; quote: string }[]; notes: { kind: string; value: string; page: number | null; quote: string }[] }[];
  };
};
const baseUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');

export async function getAgentStatus(): Promise<AgentAvailability> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${baseUrl}/healthz`, { method: 'GET', signal: controller.signal });
    if (!response.ok) return { available: false, reason: 'Nura couldn’t connect just now. Please try again shortly.' };
    const body = await response.json() as { ok?: boolean; provider?: { provider?: string; configured?: boolean; authentication?: string; model?: string }; capabilities?: { documentExtraction?: boolean; trustedHealthSearch?: boolean; youtubeVideoSearch?: boolean } };
    if (body.provider?.authentication === 'rejected') {
      return { available: false, provider: body.provider.provider, model: body.provider.model, capabilities: body.capabilities, failureCode: 'ai_credential_rejected', reason: agentRunFailureMessage('ai_credential_rejected') };
    }
    return body.ok && body.provider?.configured
      ? { available: true, provider: body.provider.provider, model: body.provider.model, capabilities: body.capabilities }
      : { available: false, provider: body.provider?.provider, model: body.provider?.model, capabilities: body.capabilities, reason: 'Nura is temporarily unavailable. Please try again later.' };
  } catch {
    return { available: false, reason: 'Nura couldn’t connect just now. Please try again shortly.' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function clearLocalDemoProcessingData(): Promise<{ sources: number; claims: number; assertions: number; activityEvents: number; deletionReceipts: number }> {
  const authorization = requireDemoSessionAuthorizationHeader();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/demo/profile`, { method: 'DELETE', headers: { accept: 'application/json', authorization } });
  } catch {
    throw new Error('Nura couldn’t clear saved document details. Your existing information has not changed. Please try again.');
  }
  if (response.status === 401 || response.status === 403) {
    invalidateDemoSessionToken();
    throw new Error('Your local preview session ended. Sign in again to continue.');
  }
  let body: { cleared?: { sources?: number; claims?: number; assertions?: number; activityEvents?: number; deletionReceipts?: number }; message?: string } = {};
  try { body = await response.json() as typeof body; } catch { /* Keep the safe fallback below. */ }
  if (!response.ok || !body.cleared) throw new Error('Nura couldn’t clear the saved document details. Your existing information has not changed. Please try again.');
  return {
    sources: Number(body.cleared.sources) || 0,
    claims: Number(body.cleared.claims) || 0,
    assertions: Number(body.cleared.assertions) || 0,
    activityEvents: Number(body.cleared.activityEvents) || 0,
    deletionReceipts: Number(body.cleared.deletionReceipts) || 0,
  };
}

export function runNuraAgent(input: AgentRunInput, onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let cursor = 0;
    let buffer = '';
    let eventName = '';
    let dataLines: string[] = [];
    let finished = false;
    let sawFinish = false;
    let sawAnswer = false;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const fail = (message: string) => { if (finished) return; finished = true; cleanup(); reject(new Error(message)); };
    const abort = () => {
      if (finished) return;
      xhr.abort();
      fail('This run was stopped. You can try again when you’re ready.');
    };
    let authorization: string;
    try { authorization = requireDemoSessionAuthorizationHeader(); }
    catch (error) { fail(error instanceof Error ? error.message : 'Sign in to continue with the local Nura preview.'); return; }
    if (signal?.aborted) { fail('This run was stopped. You can try again when you’re ready.'); return; }
    signal?.addEventListener('abort', abort, { once: true });
    const dispatch = () => {
      if (finished || !dataLines.length) { eventName = ''; return; }
      try {
        const value = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
        const event = { ...value, type: eventName || String(value.type ?? '') } as AgentEvent;
        if (event.type === 'run_error') event.message = agentRunFailureMessage(event.safeCode);
        onEvent(event);
        if (event.type === 'answer') sawAnswer = true;
        if (event.type === 'run_finished') sawFinish = true;
        if (event.type === 'run_error') fail(event.message);
      } catch (error) {
        if (error instanceof SyntaxError) { fail('Nura couldn’t complete this answer. Please try again.'); return; }
        fail('Nura couldn’t complete this answer. Your saved information has not changed. Please try again.');
      }
      eventName = '';
      dataLines = [];
    };
    const consume = () => {
      if (finished) return;
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
    xhr.open('POST', `${baseUrl}/v1/agent/runs`);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.setRequestHeader('authorization', authorization);
    xhr.setRequestHeader('accept', 'text/event-stream');
    xhr.timeout = 120_000;
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
        if (xhr.status === 409) {
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string; purpose?: string; message?: string };
            if (body.error === 'consent_withdrawn'
              && ['ai_processing', 'public_health_search'].includes(body.purpose || '')
              && typeof body.message === 'string') {
              fail(body.message);
              return;
            }
          } catch { /* Use the safe general response below. */ }
        }
        fail('Nura couldn’t complete this answer. Your saved information has not changed. Please try again.');
        return;
      }
      if (!sawFinish || !sawAnswer) { fail('Nura couldn’t finish this answer. Your saved information has not changed. Please try again.'); return; }
      finished = true;
      cleanup();
      resolve();
    };
    xhr.onerror = () => fail('Nura couldn’t connect. Check your connection and try again.');
    xhr.ontimeout = () => fail('Nura is taking longer than expected. Your saved information has not changed. Please try again.');
    xhr.onabort = () => fail(signal?.aborted ? 'This run was stopped. You can try again when you’re ready.' : 'This request was cancelled. Your saved health information has not changed.');
    xhr.send(JSON.stringify(input));
  });
}
