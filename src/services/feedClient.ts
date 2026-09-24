export type FeedTopic = { id: string; label: string };
export type FeedResult = { id: string; title: string; detail: string; url: string; publisher: string; topic: string; retrievedAt: string };
export type FeedBrief = { id: string; topic: string; summary: string; sourceIds: string[] };
export type FeedActivity = { id: string; label: string; status: 'started' | 'complete'; detail?: string };
type FeedEvent = { type: 'run_started'; runId: string } | ({ type: 'trace' } & FeedActivity) | { type: 'feed_items'; items: FeedResult[]; briefs: FeedBrief[] } | { type: 'run_finished'; runId: string } | { type: 'run_error'; message: string };

const baseUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');

export function searchHealthFeed(topics: FeedTopic[], onActivity: (activity: FeedActivity) => void): Promise<{ items: FeedResult[]; briefs: FeedBrief[] }> {
  return new Promise((resolve, reject) => {
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
    xhr.setRequestHeader('accept', 'text/event-stream');
    xhr.timeout = 90_000;
    xhr.onprogress = consume;
    xhr.onload = () => {
      consume();
      if (finished) return;
      if (xhr.status < 200 || xhr.status >= 300) {
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
    xhr.send(JSON.stringify({ consentConfirmed: true, topics }));
  });
}
