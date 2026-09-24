import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type LocalSource = { id: string; displayName: string; mediaType: string; sizeBytes: number; sha256: string; state: string; importedAt: string; storage: 'device_original_only' };
export type CandidateClaim = {
  id: string; sourceId: string; kind: string; label: string; value: string; unit: string | null;
  effectiveAt: string | null; confidence: number | null; sourceLocation: { page: number | null; quote: string | null };
  evidenceState: string; acceptedAssertionId: string | null;
  originalExtraction?: { label: string; value: string; unit: string | null; effectiveAt: string | null };
  revisionHistory?: { assertionId: string; version: number; label: string; value: string; unit: string | null; effectiveAt: string | null; recordedAt: string }[];
};
export type IntakeResult = { source: LocalSource; claims: CandidateClaim[]; duplicate: boolean };
const baseUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
export type IntakeActivity = { id: string; label: string; status: 'started' | 'progress' | 'complete' | 'failed' | 'cancelled' };
export class IntakeCancelledError extends Error {
  constructor() {
    super('This extraction was stopped. No claim was added to the profile.');
    this.name = 'IntakeCancelledError';
  }
}
function activityFromEvent(type: string, data: Record<string, unknown>, sequence: number): IntakeActivity | null {
  const labels: Record<string, string> = {
    intake_started: 'Preparing the selected file', source_received: 'File received by the local demo',
    duplicate_detected: 'Exact duplicate found', extraction_started: 'Reading the selected file with the configured provider',
    extraction_completed: 'Extraction finished', claims_ready_for_review: `${typeof data.count === 'number' ? data.count : 'Extracted'} candidate details are ready for review`,
    intake_completed: 'Source is ready', intake_cancelled: 'Processing stopped', run_error: 'Processing could not complete',
  };
  const label = labels[type];
  if (!label) return null;
  const status = type === 'intake_cancelled' ? 'cancelled'
    : type === 'run_error' ? 'failed'
    : type === 'intake_started' || type === 'extraction_started' ? 'started'
      : type === 'source_received' ? 'progress' : 'complete';
  return { id: `${sequence}-${type}`, label, status };
}
export async function getSourceClaims(sourceId: string): Promise<{ source: LocalSource; claims: CandidateClaim[] }> {
  const response = await fetch(`${baseUrl}/v1/intake/sources/${encodeURIComponent(sourceId)}/claims`);
  const body = await response.json() as { message?: string; source?: LocalSource; claims?: CandidateClaim[] };
  if (!response.ok || !body.source) throw new Error(body.message || 'Nura could not open the extracted source.');
  return { source: body.source, claims: body.claims ?? [] };
}
export async function extractPickedFile(asset: { uri: string; name: string; mimeType?: string; size?: number }, onActivity?: (activity: IntakeActivity) => void, purpose: 'medical' | 'insurance' = 'medical', signal?: AbortSignal): Promise<IntakeResult> {
  const ext = asset.name.split('.').pop()?.toLowerCase();
  const inferred = ext === 'pdf' ? 'application/pdf' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : '';
  const declared = (asset.mimeType || '').toLowerCase();
  const mimeType = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(declared) ? declared : inferred;
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('The local demo reads PDF, JPEG, PNG and WEBP files only. Video review is not connected yet.');
  let bytes: Uint8Array;
  if (Platform.OS === 'web') {
    const localFile = await fetch(asset.uri);
    if (!localFile.ok) throw new Error('The selected local file could not be opened.');
    bytes = new Uint8Array(await (await localFile.blob()).arrayBuffer());
  } else {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    bytes = decodeBase64(base64);
  }
  if (signal?.aborted) throw new IntakeCancelledError();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let cursor = 0; let buffer = ''; let eventName = ''; let dataLines: string[] = []; let sequence = 0; let completedSource: string | null = null; let duplicate = false; let failed = false; let cancelled = false; let settled = false; let failureMessage = '';
    const removeAbortListener = () => signal?.removeEventListener('abort', cancel);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      reject(error);
    };
    const cancel = () => { if (!settled) xhr.abort(); };
    const dispatch = () => {
      if (!dataLines.length) { eventName = ''; return; }
      try {
        const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
        const activity = activityFromEvent(eventName, data, ++sequence);
        if (activity) onActivity?.(activity);
        if (eventName === 'intake_completed' && typeof data.sourceId === 'string') { completedSource = data.sourceId; duplicate = data.state === 'duplicate_exact'; }
        if (eventName === 'run_error') failed = true;
        if (eventName === 'intake_cancelled') cancelled = true;
        if (eventName === 'run_error' && typeof data.message === 'string') failureMessage = data.message;
      } catch { failed = true; }
      eventName = ''; dataLines = [];
    };
    const consume = () => {
      const text = xhr.responseText.slice(cursor); cursor = xhr.responseText.length; buffer += text;
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) dispatch();
        else if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
    };
    const finish = async () => {
      removeAbortListener();
      consume(); if (buffer.trim() && dataLines.length) dispatch();
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = 'Nura could not read this selected file.';
        try { message = (JSON.parse(xhr.responseText) as { message?: string }).message || message; } catch { /* keep safe generic message */ }
        fail(new Error(message)); return;
      }
      if (cancelled) { fail(new IntakeCancelledError()); return; }
      if (failed) { fail(new Error(failureMessage || 'This file could not be processed. No claims were added.')); return; }
      if (!completedSource) { fail(new Error('Nura did not return a reviewable source. No profile details were added.')); return; }
      try {
        const result = await getSourceClaims(completedSource);
        if (settled) return;
        settled = true;
        resolve({ ...result, duplicate });
      } catch (error) { fail(error instanceof Error ? error : new Error('The extracted source could not be opened.')); }
    };
    xhr.open('POST', `${baseUrl}/v1/intake/extract`);
    xhr.setRequestHeader('content-type', mimeType);
    xhr.setRequestHeader('x-nura-file-name', encodeURIComponent(asset.name));
    xhr.setRequestHeader('x-nura-consent-confirmed', 'true');
    xhr.setRequestHeader('x-nura-document-purpose', purpose);
    xhr.setRequestHeader('accept', 'text/event-stream');
    xhr.timeout = 120_000;
    xhr.onprogress = consume;
    xhr.onload = () => { void finish(); };
    xhr.onerror = () => fail(new Error('Nura could not reach the local file-reading service.'));
    xhr.ontimeout = () => fail(new Error('This file took too long to process. No claim was added.'));
    xhr.onabort = () => {
      if (settled) return;
      onActivity?.({ id: `${sequence + 1}-intake_cancelled`, label: 'Processing stopped at your request', status: 'cancelled' });
      fail(new IntakeCancelledError());
    };
    if (signal) {
      if (signal.aborted) { fail(new IntakeCancelledError()); return; }
      signal.addEventListener('abort', cancel, { once: true });
    }
    try { xhr.send(bytes); } catch (error) { fail(error instanceof Error ? error : new Error('Nura could not send this selected file.')); }
  });
}
export async function decideCandidate(claimId: string, decision: 'accept' | 'edit' | 'reject', editedValue?: { label: string; value: string; unit?: string; effectiveAt?: string }): Promise<{ claim: CandidateClaim; assertion: { id: string } | null; unchanged: boolean }> {
  const response = await fetch(`${baseUrl}/v1/intake/claims/${encodeURIComponent(claimId)}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, ...(editedValue ? { editedValue } : {}) }),
  });
  const body = await response.json() as { message?: string; claim?: CandidateClaim; assertion?: { id: string } | null; unchanged?: boolean };
  if (!response.ok || !body.claim) throw new Error(body.message || 'Nura could not save that review decision.');
  return { claim: body.claim, assertion: body.assertion ?? null, unchanged: body.unchanged ?? false };
}

export async function correctCandidate(claimId: string, expectedAssertionId: string, editedValue: { label: string; value: string; unit?: string; effectiveAt?: string }): Promise<{ claim: CandidateClaim; previousAssertion: { id: string; version: number }; assertion: { id: string; version: number; supersedes: string } }> {
  const response = await fetch(`${baseUrl}/v1/intake/claims/${encodeURIComponent(claimId)}/correction`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedAssertionId, editedValue }),
  });
  const body = await response.json() as { message?: string; claim?: CandidateClaim; previousAssertion?: { id: string; version: number }; assertion?: { id: string; version: number; supersedes: string } };
  if (!response.ok || !body.claim || !body.previousAssertion || !body.assertion) throw new Error(body.message || 'Nura could not save a new version of this detail.');
  return { claim: body.claim, previousAssertion: body.previousAssertion, assertion: body.assertion };
}
