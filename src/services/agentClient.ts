export type AgentSource = { reference: string; id: string; title: string; detail: string; date: string; source: string; status: string; kind: string; category?: string; url?: string; publisher?: string };
export type AgentTrace = { id: string; label: string; status: 'started' | 'complete'; detail?: string };
export type CoverageAssessment = { kind: 'explicit_benefit' | 'explicit_limit' | 'explicit_exclusion' | 'unclear'; policyReference: string; detail: string; relatedHealthReferences: string[] };
export type AgentAnswer = { answer: string; citations: string[]; unknowns: string[]; nextSteps: string[]; coverageAssessments?: CoverageAssessment[]; memoryProposal: { label: string; value: string; reason: string } | null };
export type AgentEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'trace'; id: string; label: string; status: 'started' | 'complete'; detail?: string }
  | { type: 'evidence'; sources: AgentSource[] }
  | ({ type: 'answer' } & AgentAnswer)
  | { type: 'run_finished'; runId: string }
  | { type: 'run_error'; message: string };
export type AgentRunInput = {
  runId: string;
  mode?: 'symptom_support';
  question: string;
  consentConfirmed: true;
  history: { role: 'user' | 'assistant'; content: string }[];
  externalSearchConsent: boolean;
  treatmentContextConsent: boolean;
  visitContextConsent: boolean;
  context: {
    facts: { id: string; label: string; value: string; date: string; category: string; source: string; status: string }[];
    topics: { id: string; label: string }[];
    links: { id: string; from: string; to: string; label: string; createdAt: string }[];
    treatments: { id: string; name: string; dose: string; schedule: string; purpose: string; prescriber: string; careLocation: string; pharmacy: string; status: 'current' | 'past'; startedOn: string; endedOn: string; source: string }[];
    visits: { id: string; purpose: string; appointmentAt: string; clinician: string; location: string; status: 'upcoming' | 'completed'; source: string; questions: string[]; outcome: string; followUp: string; followUpActions: { id: string; title: string; dueOn: string; status: 'open' | 'done'; source: string }[] }[];
  };
};
const baseUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');

export async function getAgentStatus(): Promise<{ available: boolean; provider?: string; model?: string; reason?: string; capabilities?: { documentExtraction?: boolean; trustedHealthSearch?: boolean } }> {
  try {
    const response = await fetch(`${baseUrl}/healthz`, { method: 'GET' });
    if (!response.ok) return { available: false, reason: 'Nura’s local agent service is not responding.' };
    const body = await response.json() as { ok?: boolean; provider?: { provider?: string; configured?: boolean; model?: string }; capabilities?: { documentExtraction?: boolean; trustedHealthSearch?: boolean } };
    return body.ok && body.provider?.configured
      ? { available: true, provider: body.provider.provider, model: body.provider.model, capabilities: body.capabilities }
      : { available: false, provider: body.provider?.provider, model: body.provider?.model, capabilities: body.capabilities, reason: 'The local agent service is running, but its model provider is not configured.' };
  } catch {
    return { available: false, reason: 'The local agent service could not be reached.' };
  }
}

export async function clearLocalDemoProcessingData(): Promise<{ sources: number; claims: number; assertions: number; activityEvents: number }> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/demo/profile`, { method: 'DELETE', headers: { accept: 'application/json' } });
  } catch {
    throw new Error('Nura could not reach the local processing service. Its saved extraction data was not cleared.');
  }
  let body: { cleared?: { sources?: number; claims?: number; assertions?: number; activityEvents?: number }; message?: string } = {};
  try { body = await response.json() as typeof body; } catch { /* Keep the safe fallback below. */ }
  if (!response.ok || !body.cleared) throw new Error(body.message || 'The local processing service could not clear its saved demo data.');
  return {
    sources: Number(body.cleared.sources) || 0,
    claims: Number(body.cleared.claims) || 0,
    assertions: Number(body.cleared.assertions) || 0,
    activityEvents: Number(body.cleared.activityEvents) || 0,
  };
}

export function runNuraAgent(input: AgentRunInput, onEvent: (event: AgentEvent) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let cursor = 0;
    let buffer = '';
    let eventName = '';
    let dataLines: string[] = [];
    let finished = false;
    let sawFinish = false;
    const fail = (message: string) => { if (finished) return; finished = true; reject(new Error(message)); };
    const dispatch = () => {
      if (!dataLines.length) { eventName = ''; return; }
      try {
        const value = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
        const event = { ...value, type: eventName || String(value.type ?? '') } as AgentEvent;
        onEvent(event);
        if (event.type === 'run_finished') sawFinish = true;
        if (event.type === 'run_error') fail(event.message);
      } catch (error) {
        if (error instanceof SyntaxError) { fail('Nura received an unreadable update from its agent service.'); return; }
        fail(error instanceof Error ? error.message : 'Nura could not complete this run.');
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
    xhr.open('POST', `${baseUrl}/v1/agent/runs`);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.setRequestHeader('accept', 'text/event-stream');
    xhr.timeout = 120_000;
    xhr.onprogress = consume;
    xhr.onload = () => {
      consume();
      if (finished) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = `Nura’s agent service returned ${xhr.status}.`;
        try { message = (JSON.parse(xhr.responseText) as { message?: string }).message || message; } catch { /* Keep the safe status message. */ }
        fail(message);
        return;
      }
      if (!sawFinish) { fail('The agent service ended before it completed the answer.'); return; }
      finished = true;
      resolve();
    };
    xhr.onerror = () => fail('Nura could not reach the agent service. Check that the local backend is running.');
    xhr.ontimeout = () => fail('This request took too long. Your saved records have not been changed.');
    xhr.onabort = () => fail('This request was stopped.');
    xhr.send(JSON.stringify(input));
  });
}
