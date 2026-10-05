import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { browserAssetId, readBrowserAsset } from '../state/browserAssetStore.mjs';
import { sourceSha256Matches } from './sourceIdentity.mjs';
import { isLocalSampleFixtureId } from './localSampleFixtures.mjs';
import { getHealthAreaContext } from './healthAreaContext.mjs';
import { invalidateDemoSessionToken, requireDemoSessionAuthorizationHeader } from './demoSessionToken';
import { ACCEPTED_DOCUMENT_FORMATS, isSupportedIntakeMediaType } from './intakeFileTypes.mjs';
import { AUDIO_PROCESSING_CONSENT_VERSION, isSupportedAudioMediaType, resolveStagedIntakeMediaType } from './audioIntakePresentation.mjs';

export type DocumentContextEntry = { kind: string; value: string; page: number | null; quote: string | null };
export type DocumentContext = { documentType: string | null; dates: DocumentContextEntry[]; entities: DocumentContextEntry[]; notes: DocumentContextEntry[] };
export type DocumentPurposeCheck = { expectedPurpose: 'medical' | 'insurance'; kind: 'insurance_policy' | 'medical_record' | 'travel_document' | 'identity_document' | 'financial_document' | 'other' | 'unclear'; status: 'match' | 'mismatch' | 'unclear'; confidence: number; segmentsReviewed: number };
export type LocalSource = { id: string; displayName: string; mediaType: string; sizeBytes: number; sha256: string; state: string; importedAt: string; storage: 'device_original_only'; healthAreaId?: string; documentPurpose?: 'medical' | 'insurance'; documentPurposeCheck?: DocumentPurposeCheck | null; origin?: 'user_entered' | 'document_extraction'; processingMode?: 'local_sample_fixture' | 'connected_ai_provider' | 'local_rule_based' | null; documentContext?: DocumentContext | null };
export type CandidateClaim = {
  id: string; sourceId: string; kind: string; label: string; value: string; unit: string | null;
  referenceRange?: string | null; method?: string | null;
  effectiveAt: string | null; confidence: number | null; sourceLocation: { page: number | null; quote: string | null; timestampSeconds?: number | null; locationConfidence?: 'model_suggested' | 'server_sampled' | 'verified_fixture' | 'not_available' };
  evidenceState: 'candidate' | 'needs_review' | 'user_confirmed' | 'rejected' | 'superseded' | 'user_retracted'; acceptedAssertionId: string | null;
  retractedAt?: string | null; retractionReason?: 'not_personal' | null;
  originalExtraction?: { label: string; value: string; unit: string | null; effectiveAt: string | null };
  revisionHistory?: { assertionId: string; version: number; label: string; value: string; unit: string | null; effectiveAt: string | null; recordedAt: string }[];
};
export type IntakeResult = { source: LocalSource; claims: CandidateClaim[]; duplicate: boolean };
const baseUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');
export function resolveIntakeMediaType(asset: { name: string; mimeType?: string }) {
  return resolveStagedIntakeMediaType(asset);
}
export function formatVideoTimestamp(timestampSeconds: number) {
  const total = Math.max(0, Math.floor(timestampSeconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function describeSourceLocation(location: CandidateClaim['sourceLocation'], mediaType?: string) {
  const timestampLabel = mediaType?.startsWith('audio/') ? 'Audio' : mediaType?.startsWith('video/') ? 'Video' : 'Clip';
  return [location.quote, location.page ? `Page ${location.page}` : null, typeof location.timestampSeconds === 'number' ? `${timestampLabel} · ${formatVideoTimestamp(location.timestampSeconds)}` : null].filter(Boolean).join(' · ');
}

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
function utf8Bytes(value: string): Uint8Array {
  const encoded = unescape(encodeURIComponent(value));
  const bytes = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) bytes[index] = encoded.charCodeAt(index);
  return bytes;
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
export async function sourceMatchesText(text: string, source: LocalSource): Promise<boolean> {
  try {
    const bytes = utf8Bytes(text);
    if (bytes.byteLength !== source.sizeBytes) return false;
    return sourceSha256Matches(source.sha256, await sha256Bytes(bytes));
  } catch { return false; }
}
export type IntakeActivity = { id: string; label: string; status: 'started' | 'progress' | 'complete' | 'failed' | 'cancelled' };
export type SelfReportReview = { source: LocalSource; claims: CandidateClaim[]; duplicate: boolean };
export class IntakeCancelledError extends Error {
  constructor() {
    super('This extraction was stopped. No claim was added to the profile.');
    this.name = 'IntakeCancelledError';
  }
}
function activityFromEvent(type: string, data: Record<string, unknown>, sequence: number): IntakeActivity | null {
  const localSample = data.processingMode === 'local_sample_fixture';
  const insurancePurpose = data.documentPurpose === 'insurance';
  const insuranceSample = localSample && insurancePurpose;
  const audio = typeof data.mediaType === 'string' && data.mediaType.startsWith('audio/');
  const labels: Record<string, string> = {
    intake_started: audio ? 'Preparing your recording' : localSample ? insuranceSample ? 'Checking the example policy' : 'Checking the example report' : insurancePurpose ? 'Preparing your policy file' : 'Preparing your file', source_received: audio ? 'Recording ready' : localSample ? insuranceSample ? 'Example policy ready' : 'Example report ready' : insurancePurpose ? 'Policy file ready for reading' : 'File ready for reading',
    duplicate_detected: 'This file is already in your records', health_area_context_applied: `Considering ${getHealthAreaContext(typeof data.areaId === 'string' ? data.areaId : '')?.label ?? 'your selected area'} as a reading hint`, document_purpose_check_started: insurancePurpose ? 'Checking the policy file category across its pages' : 'Checking the health file category across its pages', document_purpose_check_completed: 'Document category check complete', extraction_started: audio ? 'Checking recording length' : insurancePurpose ? 'Reading your policy document' : 'Reading your document',
    audio_transcription_started: 'Transcribing your recording', audio_transcription_completed: `Transcription ready · ${typeof data.segmentCount === 'number' ? data.segmentCount : 'Timestamped'} sections`, audio_suggestions_started: 'Preparing details for your review', audio_suggestions_completed: `${typeof data.suggestionCount === 'number' ? data.suggestionCount : 'Suggested'} health details ready for review`,
    video_sampling_started: 'Finding clear moments in the video', video_frames_ready: `${typeof data.frameCount === 'number' ? data.frameCount : 'Selected'} moments ready`, video_extraction_started: 'Reading visible details from those moments',
    purpose_confirmation_required: 'Check the document category before details are read',
    extraction_completed: data.state === 'purpose_confirmation_required' ? 'Category checked; details were not read' : audio ? 'Recording details ready to review' : localSample ? insuranceSample ? 'Policy terms ready to review' : 'Report details ready to review' : insurancePurpose ? 'Policy reading complete' : 'Document reading complete', claims_ready_for_review: `${typeof data.count === 'number' ? data.count : 'Suggested'} ${audio ? 'health details' : insurancePurpose ? 'policy terms' : 'details'} are ready for your review`,
    intake_completed: audio ? 'Your recording source is ready' : insurancePurpose ? 'Your policy source is ready' : 'Your file is ready', intake_cancelled: 'Reading stopped at your request', run_error: 'Nura couldn’t read this file. Check it and try again.',
  };
  const label = localSample && type === 'extraction_started' ? insuranceSample ? 'Organizing policy terms' : 'Organizing report details'
    : data.safeCode === 'sample_processing_conflict' ? 'This sample is already saved from another review path'
    : data.safeCode === 'local_sample_mismatch' ? 'This file did not match the built-in sample'
    : labels[type];
  if (!label) return null;
  const status = type === 'intake_cancelled' ? 'cancelled'
    : type === 'run_error' ? 'failed'
    : type === 'intake_started' || type === 'extraction_started' || type === 'video_sampling_started' || type === 'video_extraction_started' || type === 'audio_transcription_started' || type === 'audio_suggestions_started' ? 'started'
      : type === 'source_received' || type === 'video_frames_ready' || type === 'health_area_context_applied' || type === 'audio_transcription_completed' ? 'progress' : 'complete';
  return { id: `${sequence}-${type}`, label, status };
}
function safeExtractionFailureMessage(data: Record<string, unknown>) {
  const safeCode = typeof data.safeCode === 'string' ? data.safeCode : '';
  const message = typeof data.message === 'string' ? data.message : '';
  if (data.error === 'consent_withdrawn' && data.purpose === 'document_review') return 'AI document reading is off in Data & privacy settings. Turn it on there to review personal files.';
  if (safeCode === 'local_sample_mismatch' || safeCode === 'sample_processing_conflict') return message || 'This sample could not be matched. Choose the original sample file and try again.';
  if (message === 'The local extraction service needs a configured server-side AI service for regular uploads.' || message === 'Nura’s answer service is not configured on this development server.' || /configured model provider .* has no adapter installed/i.test(message)) {
    return 'Nura’s file reader is not connected for personal uploads in this preview yet.';
  }
  if (message === 'The AI service key was not accepted. Check the server configuration.') return 'Nura’s file reader could not connect. Please try again later.';
  if (message.startsWith('The document is too long or detailed to read in one pass.')) return 'This document is too long or detailed to finish in one pass. Split it into smaller files and retry; nothing was saved.';
  if (message.startsWith('The document service could not finish reading this file.')) return 'Nura could not finish reading this file. Try a clearer copy; nothing was saved.';
  const providerFailure = message.match(/^The configured AI service could not complete this operation \((\d{3})\)\.?$/);
  if (providerFailure) return `Nura’s file reader returned an error (${providerFailure[1]}). Please try again.`;
  if (/^(The document service returned (an unreadable extraction|incomplete review details)|The video review returned (unreadable details|incomplete details))\./.test(message)) {
    return 'Nura could not prepare reviewable details from this file. Try a clearer scan or another copy.';
  }
  return 'Nura couldn’t read this file. Check the file and try again.';
}
export async function getSourceClaims(sourceId: string): Promise<{ source: LocalSource; claims: CandidateClaim[] }> {
  const authorization = requireDemoSessionAuthorizationHeader();
  const response = await fetch(`${baseUrl}/v1/intake/sources/${encodeURIComponent(sourceId)}/claims`, { headers: { authorization } });
  if (response.status === 401 || response.status === 403) {
    invalidateDemoSessionToken();
    throw new Error('Your local preview session ended. Sign in again to continue.');
  }
  const body = await response.json() as { message?: string; source?: LocalSource; claims?: CandidateClaim[] };
  if (!response.ok || !body.source) throw new Error(body.message || 'Nura could not open the extracted source.');
  return { source: body.source, claims: body.claims ?? [] };
}

export async function removeLocalDemoSource(sourceId: string): Promise<{ source: number; claims: number; assertions: number; activityEvents: number; claimIds: string[]; assertionIds: string[]; alreadyRemoved: boolean }> {
  const authorization = requireDemoSessionAuthorizationHeader();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/intake/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE', headers: { accept: 'application/json', authorization } });
  } catch {
    throw new Error('Nura could not confirm removal from the local preview service. Your saved copy in the app is unchanged; retry to finish or confirm the removal.');
  }
  if (response.status === 401 || response.status === 403) { invalidateDemoSessionToken(); throw new Error('Your local preview session ended. Sign in again to continue.'); }
  const body = await response.json() as {
    removed?: { source?: number; claims?: number; assertions?: number; activityEvents?: number };
    claimIds?: unknown;
    assertionIds?: unknown;
    alreadyRemoved?: unknown;
    message?: string;
  };
  if (!response.ok || !body.removed || ![0, 1].includes(body.removed.source ?? -1)
    || !Array.isArray(body.claimIds) || !body.claimIds.every((id) => typeof id === 'string')
    || !Array.isArray(body.assertionIds) || !body.assertionIds.every((id) => typeof id === 'string')
    || typeof body.alreadyRemoved !== 'boolean') {
    throw new Error(body.message || 'Nura could not confirm removal from the local preview service. Your saved copy in the app is unchanged; retry to finish or confirm the removal.');
  }
  return {
    source: body.removed.source ?? 0,
    claims: body.removed.claims ?? 0,
    assertions: body.removed.assertions ?? 0,
    activityEvents: body.removed.activityEvents ?? 0,
    claimIds: body.claimIds,
    assertionIds: body.assertionIds,
    alreadyRemoved: body.alreadyRemoved,
  };
}

export async function analyzeSelfReport(input: { noteId: string; text: string; topic?: { id: string; label: string }; consentForThisNote: boolean }): Promise<SelfReportReview> {
  let endpoint: URL;
  try { endpoint = new URL(baseUrl); }
  catch { throw new Error('Self-reported descriptions are available only in the local preview.'); }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) {
    throw new Error('This preview keeps self-reported descriptions on the local Nura service. Remote description processing is not enabled.');
  }
  const authorization = requireDemoSessionAuthorizationHeader();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/intake/self-report`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization },
      body: JSON.stringify({ consentForThisNote: input.consentForThisNote, noteId: input.noteId, text: input.text, topic: input.topic ?? null }),
    });
  } catch {
    throw new Error('The local description organizer could not be reached. Your note remains on this device.');
  }
  if (response.status === 401 || response.status === 403) {
    invalidateDemoSessionToken();
    throw new Error('Your local preview session ended. Sign in again to continue.');
  }
  const body = await response.json() as { message?: string; source?: LocalSource; claims?: CandidateClaim[]; duplicate?: boolean };
  if (!response.ok || !body.source) throw new Error(body.message || 'Nura could not organize this description.');
  return { source: body.source, claims: body.claims ?? [], duplicate: body.duplicate ?? false };
}
export async function extractPickedFile(asset: { uri: string; name: string; mimeType?: string; size?: number; localSampleFixtureId?: string }, onActivity?: (activity: IntakeActivity) => void, purpose: 'medical' | 'insurance' = 'medical', signal?: AbortSignal, healthAreaId?: string, audioProcessingConsent = false, purposeConfirmed = false): Promise<IntakeResult> {
  const mimeType = resolveIntakeMediaType(asset);
  const isAudio = isSupportedAudioMediaType(mimeType);
  if (!isSupportedIntakeMediaType(mimeType) && !isAudio) throw new Error(`Choose a ${ACCEPTED_DOCUMENT_FORMATS}, image or supported video file.`);
  if (isAudio && !audioProcessingConsent) throw new Error('Choose separately to send this recording for transcription before reviewing it.');
  if (isAudio && purpose !== 'medical') throw new Error('Audio can only be reviewed as a health record.');
  if (purpose === 'insurance' && mimeType.startsWith('video/')) throw new Error('Choose a policy document or image for your Insurance Registry.');
  const authorization = requireDemoSessionAuthorizationHeader();
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
        if (eventName === 'run_error') failureMessage = safeExtractionFailureMessage(data);
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
        if (xhr.status === 401 || xhr.status === 403) {
          invalidateDemoSessionToken();
          fail(new Error('Your local preview session ended. Sign in again to continue.'));
          return;
        }
        let message = safeExtractionFailureMessage({});
        try { message = safeExtractionFailureMessage(JSON.parse(xhr.responseText) as Record<string, unknown>); } catch { /* keep safe generic message */ }
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
    if (purposeConfirmed) xhr.setRequestHeader('x-nura-document-purpose-confirmed', purpose);
    if (isAudio) xhr.setRequestHeader('x-nura-audio-processing-consent', AUDIO_PROCESSING_CONSENT_VERSION);
    const areaContext = purpose === 'medical' ? getHealthAreaContext(healthAreaId ?? '') : null;
    if (areaContext) xhr.setRequestHeader('x-nura-health-area', areaContext.id);
    xhr.setRequestHeader('authorization', authorization);
    const localSampleFixture = mimeType === 'application/pdf' && isLocalSampleFixtureId(asset.localSampleFixtureId, purpose) ? asset.localSampleFixtureId : undefined;
    if (localSampleFixture) xhr.setRequestHeader('x-nura-local-sample-fixture', localSampleFixture);
    xhr.setRequestHeader('accept', 'text/event-stream');
    xhr.timeout = 240_000;
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
  const authorization = requireDemoSessionAuthorizationHeader();
  const response = await fetch(`${baseUrl}/v1/intake/claims/${encodeURIComponent(claimId)}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization }, body: JSON.stringify({ decision, ...(editedValue ? { editedValue } : {}) }),
  });
  if (response.status === 401 || response.status === 403) { invalidateDemoSessionToken(); throw new Error('Your local preview session ended. Sign in again to continue.'); }
  const body = await response.json() as { message?: string; claim?: CandidateClaim; assertion?: { id: string } | null; unchanged?: boolean };
  if (!response.ok || !body.claim) throw new Error(body.message || 'Nura could not save that review decision.');
  return { claim: body.claim, assertion: body.assertion ?? null, unchanged: body.unchanged ?? false };
}

export async function correctCandidate(claimId: string, expectedAssertionId: string, editedValue: { label: string; value: string; unit?: string; effectiveAt?: string }): Promise<{ claim: CandidateClaim; previousAssertion: { id: string; version: number }; assertion: { id: string; version: number; supersedes: string } }> {
  const authorization = requireDemoSessionAuthorizationHeader();
  const response = await fetch(`${baseUrl}/v1/intake/claims/${encodeURIComponent(claimId)}/correction`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization },
    body: JSON.stringify({ expectedAssertionId, editedValue }),
  });
  if (response.status === 401 || response.status === 403) { invalidateDemoSessionToken(); throw new Error('Your local preview session ended. Sign in again to continue.'); }
  const body = await response.json() as { message?: string; claim?: CandidateClaim; previousAssertion?: { id: string; version: number }; assertion?: { id: string; version: number; supersedes: string } };
  if (!response.ok || !body.claim || !body.previousAssertion || !body.assertion) throw new Error(body.message || 'Nura could not save a new version of this detail.');
  return { claim: body.claim, previousAssertion: body.previousAssertion, assertion: body.assertion };
}

export async function retractAcceptedCandidate(claimId: string, expectedAssertionId: string): Promise<{ claim: CandidateClaim; previousAssertion: { id: string; validUntil: string | null }; unchanged: boolean }> {
  const authorization = requireDemoSessionAuthorizationHeader();
  const response = await fetch(`${baseUrl}/v1/intake/claims/${encodeURIComponent(claimId)}/retraction`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization },
    body: JSON.stringify({ expectedAssertionId, reason: 'not_personal' }),
  });
  if (response.status === 401 || response.status === 403) { invalidateDemoSessionToken(); throw new Error('Your local preview session ended. Sign in again to continue.'); }
  const body = await response.json() as { message?: string; claim?: CandidateClaim; previousAssertion?: { id: string; validUntil: string | null }; unchanged?: boolean };
  if (!response.ok || !body.claim || !body.previousAssertion) throw new Error(body.message || 'Nura could not remove this detail from the active profile.');
  return { claim: body.claim, previousAssertion: body.previousAssertion, unchanged: body.unchanged ?? false };
}
