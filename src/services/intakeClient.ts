import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { browserAssetId, readBrowserAsset } from '../state/browserAssetStore.mjs';
import { sourceSha256Matches } from './sourceIdentity.mjs';

export type DocumentContextEntry = { kind: string; value: string; page: number | null; quote: string | null };
export type DocumentContext = { documentType: string | null; dates: DocumentContextEntry[]; entities: DocumentContextEntry[]; notes: DocumentContextEntry[] };
export type LocalSource = { id: string; displayName: string; mediaType: string; sizeBytes: number; sha256: string; state: string; importedAt: string; storage: 'device_original_only'; documentContext?: DocumentContext | null };
export type CandidateClaim = {
  id: string; sourceId: string; kind: string; label: string; value: string; unit: string | null;
  referenceRange?: string | null; method?: string | null;
  effectiveAt: string | null; confidence: number | null; sourceLocation: { page: number | null; quote: string | null };
  evidenceState: 'candidate' | 'needs_review' | 'user_confirmed' | 'rejected' | 'superseded' | 'user_retracted'; acceptedAssertionId: string | null;
  retractedAt?: string | null; retractionReason?: 'not_personal' | null;
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
async function readAssetBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const storedId = browserAssetId(uri);
    const storedBlob = storedId ? await readBrowserAsset(storedId) : null;
    if (storedId && !storedBlob) throw new Error('The saved copy of this file is missing from browser storage. Choose it again to continue.');
    const localFile = storedId ? null : await fetch(uri);
    if (localFile && !localFile.ok) throw new Error('The selected local file could not be opened.');
    const blob = storedBlob ?? await localFile?.blob();
    if (!blob) throw new Error('The selected local file could not be opened.');
    return new Uint8Array(await blob.arrayBuffer());
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return decodeBase64(base64);
}
async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const digest = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, ownedBytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function sourceMatchesAsset(asset: { uri: string }, source: LocalSource): Promise<boolean> {
  try {
    const bytes = await readAssetBytes(asset.uri);
    if (bytes.byteLength !== source.sizeBytes) return false;
    return sourceSha256Matches(source.sha256, await sha256Bytes(bytes));
  } catch {
    return false;
  }
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
    intake_started: 'Preparing your file', source_received: 'File ready for review',
    duplicate_detected: 'This file is already in your records', extraction_started: 'Reading your document',
    extraction_completed: 'Document reading complete', claims_ready_for_review: `${typeof data.count === 'number' ? data.count : 'Suggested'} details are ready for your review`,
    intake_completed: 'Your file is ready', intake_cancelled: 'Reading stopped at your request', run_error: 'Nura couldn’t read this file. Check it and try again.',
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
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('Nura can read PDF files and JPG, PNG or WebP photos. Video review isn’t available yet.');
  const bytes = await readAssetBytes(asset.uri);
  const selectedFileSha256 = await sha256Bytes(bytes);
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
        if (eventName === 'run_error') failureMessage = 'Nura couldn’t read this file. Please check it and try again.';
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
        if (result.source.sizeBytes !== bytes.byteLength || !sourceSha256Matches(result.source.sha256, selectedFileSha256)) {
          fail(new Error('The source returned for this file did not match its contents. No extracted details were shown or added.'));
          return;
        }
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

export async function retractAcceptedCandidate(claimId: string, expectedAssertionId: string): Promise<{ claim: CandidateClaim; previousAssertion: { id: string; validUntil: string | null }; unchanged: boolean }> {
  const response = await fetch(`${baseUrl}/v1/intake/claims/${encodeURIComponent(claimId)}/retraction`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedAssertionId, reason: 'not_personal' }),
  });
  const body = await response.json() as { message?: string; claim?: CandidateClaim; previousAssertion?: { id: string; validUntil: string | null }; unchanged?: boolean };
  if (!response.ok || !body.claim || !body.previousAssertion) throw new Error(body.message || 'Nura could not remove this detail from the active profile.');
  return { claim: body.claim, previousAssertion: body.previousAssertion, unchanged: body.unchanged ?? false };
}
