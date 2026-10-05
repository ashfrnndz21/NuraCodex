import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { getLanguageModel, getLanguageModelStatus, getYouTubeVideoSearchStatus, extractDocumentClaims, mapLocalSampleDocument, verifyLocalSampleDocument, LocalSampleMismatchError, HealthSearchConfigurationError, HealthVideoSearchUnavailableError, extractVideoClaims, searchHealthFeedSources, getAudioIntakeProcessor } from './adapters/index.mjs';
import { isRetryableEmptySource, resolveDocumentPurpose } from './agent/documentPurpose.mjs';
import { getHealthAreaContext } from '../src/services/healthAreaContext.mjs';
import { sanitizePublicHealthTopics } from '../src/services/healthSearchTopic.mjs';
import { runAgent } from './agent/orchestrator.mjs';
import { sanitizeRunBody } from './agent/context.mjs';
import { resolveAuthorizedAskContext } from './agent/authorizedAskContext.mjs';
import { interpretSelfReportRequest } from './agent/selfReport.mjs';
import { organizeSelfReportLocally } from './agent/localSelfReport.mjs';
import { addHealthFeedCandidate, canonicalHealthUrl } from './agent/feedResults.mjs';
import { localDemoRepository } from './adapters/localDemoRepository.mjs';
import { LocalDemoProfileAccess } from './adapters/localDemoProfileAccess.mjs';
import { LocalDemoSessionVerifier } from './adapters/localDemoSessionVerifier.mjs';
import { LocalDemoPrivacyConsentPolicy } from './adapters/localDemoPrivacyConsentPolicy.mjs';
import { PRIVACY_CONSENT_POLICY_VERSION, PRIVACY_PURPOSES } from './ports/PrivacyConsentPolicy.mjs';
import { isLocalSampleFixtureId } from '../src/services/localSampleFixtures.mjs';
import { verifyRequestSession } from './ports/requestSession.mjs';
import { createCandidateClaim, createDocumentContext, createRunEvent, createSourceRecord, DEMO_PROFILE_ID as DEMO_PROFILE_FIXTURE_ID } from './contracts.mjs';
import { allowedOriginsFromEnv, applyCorsHeaders, isAllowedOrigin } from './cors.mjs';
import { createScopedRateLimiter } from './rateLimit.mjs';
import { getYouTubeVideoId } from '../src/services/youtubeVideo.mjs';
import { ACCEPTED_DOCUMENT_FORMATS, INTAKE_MIME_EXTENSIONS } from '../src/services/intakeFileTypes.mjs';
import { AUDIO_MEDIA_EXTENSIONS } from './adapters/audioProcessor.mjs';
import { hasAudioProcessingConsent, OPENAI_AUDIO_PROCESSING_CONSENT } from './ports/AudioTranscription.mjs';
import { presentAgentRunFailure } from '../src/services/agentRunFailure.mjs';
import { createFeedPersonalizedNotes, sanitizeFeedPersonalizationRequest } from './agent/feedPersonalizedNotes.mjs';
import { InFlightProcessing } from './agent/inFlightProcessing.mjs';

const host = process.env.NURA_BIND_HOST || '127.0.0.1';
const port = Number(process.env.NURA_AGENT_PORT || 4175);
const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!allowedHosts.has(host)) throw new Error('The development agent server binds to loopback only. Add authenticated deployment infrastructure before exposing it to a network.');
if (process.env.NODE_ENV === 'production') throw new Error('This development agent server cannot be started in production.');
const allowedOrigins = allowedOriginsFromEnv(process.env.NURA_ALLOWED_ORIGINS);
const rateLimited = createScopedRateLimiter();
const localDemoProfileAccess = new LocalDemoProfileAccess();
const testSessionTtlMs = process.env.NODE_ENV === 'test' ? Number(process.env.NURA_TEST_DEMO_SESSION_TTL_MS) : Number.NaN;
const localDemoSessionVerifier = new LocalDemoSessionVerifier(
  Number.isSafeInteger(testSessionTtlMs) && testSessionTtlMs > 0 ? { sessionTtlMs: testSessionTtlMs } : {},
);
const localDemoPrivacyConsentPolicy = new LocalDemoPrivacyConsentPolicy({ repository: localDemoRepository });
const inFlightProcessing = new InFlightProcessing();
// This loopback-only server stores one fictional demo profile. Every data route
// requires a server-issued session; this is not production identity or isolation.
const DEMO_PROFILE_ID = DEMO_PROFILE_FIXTURE_ID;
const MAX_BODY_BYTES = 96_000;
const configuredUploadCap = Number(process.env.NURA_MAX_INTAKE_BYTES || 15 * 1024 * 1024);
const MAX_INTAKE_BYTES = Number.isSafeInteger(configuredUploadCap) ? Math.min(Math.max(configuredUploadCap, 64 * 1024), 15 * 1024 * 1024) : 15 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([...Object.entries(INTAKE_MIME_EXTENSIONS), ...Object.entries(AUDIO_MEDIA_EXTENSIONS)]);
const SUPPORTED_UPLOAD_MESSAGE = `Choose a ${ACCEPTED_DOCUMENT_FORMATS}, JPEG, PNG or WebP image, MP4, MOV, M4V or WebM video, or MP3, M4A, WAV, OGG, FLAC or audio WEBM file with a matching file type.`;
const DEMO_INTAKE_ENABLED = process.env.NURA_ENABLE_DEMO_INTAKE !== 'false';

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function cors(request, response) {
  applyCorsHeaders(request.headers.origin, response, allowedOrigins);
}

async function canAccessProfile(profileId, principal) {
  const result = await localDemoProfileAccess.authorize({ principal, requestedProfileId: profileId });
  return result.status === 'allowed';
}

async function readBody(request, limit = MAX_BODY_BYTES) {
  let body = ''; let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > limit) throw new Error('This request is too large.');
    body += part.toString('utf8');
  }
  try { return JSON.parse(body || '{}'); } catch { throw new Error('The request body was not valid JSON.'); }
}

async function readBinaryBody(request) {
  const length = Number(request.headers['content-length'] || 0);
  if (length > MAX_INTAKE_BYTES) throw new Error('This file is larger than the local demo limit.');
  const chunks = []; let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > MAX_INTAKE_BYTES) throw new Error('This file is larger than the local demo limit.');
    chunks.push(part);
  }
  if (!size) throw new Error('The selected file is empty.');
  return Buffer.concat(chunks, size);
}

function cleanFilename(raw, contentType) {
  let decoded = '';
  try { decoded = decodeURIComponent(raw || ''); } catch { decoded = ''; }
  const basename = decoded.split(/[\\/]/).pop()?.replace(/[\0-\x1f\x7f]/g, '').trim().slice(0, 160) || 'health-record';
  const allowed = MIME_EXTENSIONS.get(contentType);
  const extension = basename.slice(basename.lastIndexOf('.')).toLowerCase();
  if (!allowed || !allowed.includes(extension)) throw new Error(SUPPORTED_UPLOAD_MESSAGE);
  return basename;
}

function statusForEvent(type, data) {
  if (data?.status && ['started', 'progress', 'complete', 'failed'].includes(data.status)) return data.status;
  if (type === 'run_started' || type.endsWith('_started')) return 'started';
  if (type === 'run_finished' || type.endsWith('_completed') || type.endsWith('_ready_for_review')) return 'complete';
  if (type === 'run_error' || type.endsWith('_failed')) return 'failed';
  return 'progress';
}

function displayForEvent(type, data) {
  const insurancePurpose = data?.documentPurpose === 'insurance';
  const isAudio = typeof data?.mediaType === 'string' && data.mediaType.startsWith('audio/');
  if (isAudio && type === 'intake_started') return 'Preparing the selected audio for local review';
  if (isAudio && type === 'extraction_started') return 'Preparing a timestamped transcript for your review';
  if (isAudio && type === 'extraction_completed') return 'Audio suggestions are ready to review';
  if (isAudio && type === 'claims_ready_for_review') return 'Audio suggestions are ready for your review';
  if (isAudio && type === 'intake_completed') return 'Audio source review is ready';
  if (data?.processingMode === 'local_sample_fixture') {
    const sampleLabels = insurancePurpose ? {
      intake_started: 'Checking the example policy',
      source_received: 'Example policy ready',
      extraction_started: 'Organizing policy terms',
      extraction_completed: 'Policy terms are ready to review',
      claims_ready_for_review: 'Policy suggestions are ready for your review',
      intake_completed: 'Local policy review is ready',
    } : {
      intake_started: 'Checking the example report',
      source_received: 'Example report ready',
      extraction_started: 'Organizing report details',
      extraction_completed: 'Sample details are ready to review',
      claims_ready_for_review: 'Sample suggestions are ready for your review',
      intake_completed: 'Local sample review is ready',
    };
    if (sampleLabels[type]) return sampleLabels[type];
  }
  const labels = {
    run_started: 'Nura started this request', run_finished: 'Nura completed this request', run_error: 'Nura could not complete this request', feed_items: 'Trusted health sources are ready',
    intake_started: insurancePurpose ? 'Preparing the policy source' : 'Preparing the selected source', source_received: insurancePurpose ? 'Policy source received for this local demo' : 'Source received for this local demo', duplicate_detected: 'An exact duplicate was found',
    extraction_started: insurancePurpose ? 'Reading the policy document' : 'Reading the selected document', extraction_completed: insurancePurpose ? 'Policy document reading completed' : 'Document extraction completed',
    video_sampling_started: 'Selecting clear moments from the video', video_frames_ready: 'Video moments are ready for review', video_extraction_started: 'Reading visible details in the selected moments',
    claims_ready_for_review: insurancePurpose ? 'Policy suggestions are ready for your review' : 'Extracted items are ready for your review', intake_completed: insurancePurpose ? 'Policy source review is ready' : 'The selected source is ready', intake_cancelled: 'File processing stopped', review_completed: 'Your review was saved', self_report_started: 'Nura organized a description locally', self_report_completed: 'Quoted suggestions are ready for review', trace: 'Nura updated its activity', evidence: 'Nura checked selected evidence', answer: 'Nura prepared an answer',
  };
  return labels[type] || 'Nura updated this request';
}

function openSse(response, runId, documentPurpose, signal = null) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  response.flushHeaders?.();
  let sequence = 0;
  const pendingWrites = [];
  const emit = (type, data = {}) => {
    if (response.writableEnded || response.destroyed || signal?.aborted) return;
    sequence += 1;
    const event = {
      schemaVersion: 1, eventId: randomUUID(), sequence, occurredAt: new Date().toISOString(),
      ...data, documentPurpose: data.documentPurpose ?? documentPurpose,
      runId: typeof data.runId === 'string' ? data.runId : runId,
    };
    response.write(`id: ${sequence}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
    // Persist only safe envelope metadata. Never persist event detail, answer text, evidence values or file content.
    const persisted = createRunEvent({ runId, sequence, type, stage: type.split('_')[0], status: statusForEvent(type, data), displayLabel: displayForEvent(type, data) });
    pendingWrites.push(localDemoRepository.appendRunEvent(persisted));
  };
  return { emit, flush: async () => { await Promise.allSettled(pendingWrites); } };
}

async function handleExtraction(request, response, operation = null) {
  if (!DEMO_INTAKE_ENABLED) { json(response, 404, { error: 'not_found' }); return; }
  if (request.headers['x-nura-consent-confirmed'] !== 'true') { json(response, 400, { error: 'consent_required', message: 'Confirm before Nura reads this selected file.' }); return; }
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!MIME_EXTENSIONS.has(contentType)) { json(response, 415, { error: 'unsupported_media_type', message: SUPPORTED_UPLOAD_MESSAGE }); return; }
  const isAudio = contentType.startsWith('audio/');
  if (isAudio && !hasAudioProcessingConsent(request.headers['x-nura-audio-processing-consent'])) {
    json(response, 400, {
      error: 'audio_processing_consent_required',
      requiredConsent: OPENAI_AUDIO_PROCESSING_CONSENT,
      message: 'Audio needs its own per-file approval for transcription and health-detail suggestions. No audio was read or sent.',
    });
    return;
  }
  const requestedPurpose = String(request.headers['x-nura-document-purpose'] || 'medical');
  if (requestedPurpose !== 'medical' && requestedPurpose !== 'insurance') { json(response, 400, { error: 'invalid_document_purpose', message: 'Choose a medical record or insurance policy review.' }); return; }
  if (contentType.startsWith('video/') && requestedPurpose !== 'medical') { json(response, 400, { error: 'invalid_document_purpose', message: 'Videos can only be reviewed as medical records.' }); return; }
  if (isAudio && requestedPurpose !== 'medical') { json(response, 400, { error: 'invalid_document_purpose', message: 'Audio can only be reviewed as medical records.' }); return; }
  const audioProcessor = isAudio ? getAudioIntakeProcessor() : null;
  if (isAudio && !audioProcessor) {
    json(response, 503, {
      error: 'audio_transcription_unavailable',
      message: 'Audio transcription is not enabled in this preview. The selected audio was not read or sent.',
    });
    return;
  }
  let filename;
  try { filename = cleanFilename(String(request.headers['x-nura-file-name'] || ''), contentType); }
  catch (error) { json(response, 400, { error: 'invalid_file_name', message: error.message }); return; }
  let effectivePurpose = contentType.startsWith('video/') ? 'medical' : resolveDocumentPurpose({ requestedPurpose, filename });
  const fixtureId = String(request.headers['x-nura-local-sample-fixture'] || '');
  const healthAreaId = String(request.headers['x-nura-health-area'] || '').trim();
  const healthAreaContext = healthAreaId && effectivePurpose === 'medical' ? getHealthAreaContext(healthAreaId) : null;
  if (healthAreaId && requestedPurpose !== 'medical') { json(response, 400, { error: 'invalid_health_area', message: 'Health-area context is only available for medical records.' }); return; }
  if (healthAreaId && effectivePurpose === 'medical' && !healthAreaContext) { json(response, 400, { error: 'invalid_health_area', message: 'Choose a supported health area for this report.' }); return; }
  if (!isAudio && !fixtureId && !getLanguageModelStatus().configured) { json(response, 503, { error: 'service_unavailable', message: 'The local extraction service needs a configured server-side AI service for regular uploads.' }); return; }

  const runId = randomUUID();
  const abortController = operation ? { signal: operation.signal, abort: operation.abort } : new AbortController();
  response.on('close', () => { if (!response.writableEnded) abortController.abort(); });
  const { emit, flush } = openSse(response, runId, effectivePurpose, abortController.signal);
  const syntheticAudioFixture = isAudio && process.env.NODE_ENV === 'test' && process.env.NURA_TEST_AUDIO_ADAPTER === 'synthetic';
  const processingMode = fixtureId ? 'local_sample_fixture' : syntheticAudioFixture ? 'local_rule_based' : 'connected_ai_provider';
  emit('intake_started', { mediaType: contentType, processingMode });
  let sourceId = null;
  try {
    const bytes = await readBinaryBody(request);
    if (abortController.signal.aborted) return;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    let localSample;
    try {
      localSample = verifyLocalSampleDocument({ bytes, filename, mediaType: contentType, purpose: effectivePurpose, fixtureId });
    } catch (error) {
      if (!(error instanceof LocalSampleMismatchError)) throw error;
      emit('run_error', { sourceId: null, safeCode: 'local_sample_mismatch', processingMode, message: error.message });
      return;
    }
    const duplicate = await localDemoRepository.findSourceByHash(DEMO_PROFILE_ID, sha256);
    if (duplicate && localSample && duplicate.processingMode !== localSample.processingMode) {
      emit('run_error', {
        sourceId: duplicate.id,
        safeCode: 'sample_processing_conflict',
        processingMode,
        message: 'An earlier copy of this exact sample is already saved through another review path. This attempt did not send it again or change that review. Open the saved source, or clear the local preview repository before using the local sample path.',
      });
      return;
    }
    if (duplicate && !isRetryableEmptySource(duplicate)) {
      const savedProcessingMode = duplicate.processingMode ?? 'unknown';
      emit('duplicate_detected', { sourceId: duplicate.id, duplicateOfSourceId: duplicate.id, sha256, exactMatch: true, processingMode: savedProcessingMode, requestedProcessingMode: processingMode });
      emit('intake_completed', { sourceId: duplicate.id, state: 'duplicate_exact', exactMatch: true, processingMode: savedProcessingMode, requestedProcessingMode: processingMode });
      return;
    }

    if (abortController.signal.aborted) return;
    const source = duplicate ?? createSourceRecord({ displayName: filename, mediaType: contentType, sizeBytes: bytes.length, sha256, processingMode: localSample?.processingMode ?? processingMode, healthAreaId: healthAreaContext?.id, documentPurpose: effectivePurpose });
    sourceId = source.id;
    if (!duplicate) await localDemoRepository.createSource(source);
    emit('source_received', { sourceId, sha256, sizeBytes: bytes.length, storage: 'device_original_only', processingMode });
    if (healthAreaContext && !localSample && !contentType.startsWith('video/')) emit('health_area_context_applied', { sourceId, areaId: healthAreaContext.id, areaLabel: healthAreaContext.label });
    await localDemoRepository.setSourceState(sourceId, 'extracting', { documentPurpose: effectivePurpose });
    const isVideo = contentType.startsWith('video/');
    emit('extraction_started', isAudio
      ? syntheticAudioFixture
        ? { sourceId, mediaType: contentType, processingMode, processor: 'synthetic_test_only', externalProviderCall: false }
        : { sourceId, mediaType: contentType, processingMode, provider: 'openai_audio_transcriptions_and_responses', realProviderCall: true }
      : localSample
      ? { sourceId, mediaType: 'document', processingMode, processor: 'local_sample_fixture', externalProviderCall: false }
      : { sourceId, mediaType: isVideo ? 'video' : 'document', processingMode, provider: 'openai_responses', realProviderCall: true });
    let extraction = localSample ? mapLocalSampleDocument({ fixtureId: localSample.fixtureId }) : undefined;
    if (isAudio) {
      extraction = await audioProcessor({ bytes, filename, mediaType: contentType, signal: abortController.signal, onProgress: (type, details = {}) => emit(type, { sourceId, mediaType: contentType, ...details }) });
    } else if (isVideo) {
      emit('video_sampling_started', { sourceId, limitSeconds: 180, maxMoments: 6 });
      extraction = await extractVideoClaims({
        bytes, mediaType: contentType, purpose: effectivePurpose, signal: abortController.signal,
        onFramesReady: (details) => {
          emit('video_frames_ready', { sourceId, frameCount: details.frameCount, durationSeconds: details.durationSeconds });
          emit('video_extraction_started', { sourceId, frameCount: details.frameCount });
        },
      });
    } else if (!localSample) {
      extraction = await extractDocumentClaims({ bytes, filename, mediaType: contentType, purpose: effectivePurpose, signal: abortController.signal, healthAreaLabel: healthAreaContext?.label });
      const detectedPurpose = resolveDocumentPurpose({ requestedPurpose: effectivePurpose, filename, documentType: extraction.documentContext?.documentType });
      if (effectivePurpose === 'medical' && detectedPurpose === 'insurance') {
        effectivePurpose = detectedPurpose;
        await localDemoRepository.setSourceState(sourceId, 'extracting', { documentPurpose: effectivePurpose });
        extraction = await extractDocumentClaims({ bytes, filename, mediaType: contentType, purpose: effectivePurpose, signal: abortController.signal });
      }
    }
    if (abortController.signal.aborted) {
      await localDemoRepository.setSourceState(sourceId, 'failed');
      emit('intake_cancelled', { sourceId, state: 'failed' });
      return;
    }
    const claims = extraction.claims.map((claim) => createCandidateClaim({
      sourceId, kind: claim.kind, label: claim.label, value: claim.value, unit: claim.unit,
      referenceRange: claim.referenceRange, method: claim.method,
      effectiveAt: claim.effectiveAt, confidence: claim.confidence,
      sourceLocation: { page: claim.page, timestampSeconds: claim.timestampSeconds, quote: claim.quote, locationConfidence: localSample ? 'verified_fixture' : claim.timestampSeconds === null || claim.timestampSeconds === undefined ? 'model_suggested' : 'server_sampled' },
    })).filter(Boolean);
    const documentContext = createDocumentContext(extraction.documentContext);
    if (abortController.signal.aborted) {
      await localDemoRepository.setSourceState(sourceId, 'failed');
      return;
    }
    await localDemoRepository.saveCandidateClaims(claims, { signal: abortController.signal });
    await localDemoRepository.setSourceState(sourceId, claims.length ? 'candidate_review' : 'extracted_empty', { documentContext, documentPurpose: effectivePurpose });
    emit('extraction_completed', { sourceId, mediaType: contentType, candidateCount: claims.length, state: claims.length ? 'candidate_review' : 'extracted_empty', processingMode, documentPurpose: effectivePurpose });
    if (claims.length) emit('claims_ready_for_review', { sourceId, mediaType: contentType, claimIds: claims.map((claim) => claim.id), count: claims.length, processingMode, documentPurpose: effectivePurpose });
    emit('intake_completed', { sourceId, mediaType: contentType, state: claims.length ? 'candidate_review' : 'extracted_empty', processingMode, documentPurpose: effectivePurpose });
  } catch (error) {
    if (sourceId) await localDemoRepository.setSourceState(sourceId, 'failed').catch(() => {});
    const message = abortController.signal.aborted ? 'This extraction was stopped. No claim was added to the profile.' : error instanceof Error ? error.message : 'The selected document could not be processed.';
    emit(abortController.signal.aborted ? 'intake_cancelled' : 'run_error', { sourceId, message });
  } finally {
    await flush();
    operation?.finish();
    if (!response.writableEnded) response.end();
  }
}

async function handleSelfReport(request, response) {
  if (!DEMO_INTAKE_ENABLED) { json(response, 404, { error: 'not_found' }); return; }
  if (String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    json(response, 415, { error: 'unsupported_media_type', message: 'Send one selected description for local review.' });
    return;
  }
  let body;
  try { body = await readBody(request, 12_000); }
  catch (error) { json(response, 400, { error: 'invalid_request', message: error.message }); return; }

  let prepared;
  try {
    prepared = await interpretSelfReportRequest(body, { interpret: async ({ text }) => organizeSelfReportLocally(text) });
  } catch (error) {
    json(response, 400, { error: 'invalid_self_report', message: error instanceof Error ? error.message : 'This description could not be validated.' });
    return;
  }

  const sha256 = createHash('sha256').update(prepared.text, 'utf8').digest('hex');
  try {
    const duplicate = await localDemoRepository.findSourceByHash(DEMO_PROFILE_ID, sha256);
    if (duplicate?.origin === 'user_entered') {
      const claims = await localDemoRepository.listClaims(duplicate.id);
      json(response, 200, { mode: 'local_demo_synthetic_only', duplicate: true, source: duplicate, claims });
      return;
    }

    const unresolvedNotes = prepared.unknowns.map((item) => ({
      kind: 'unresolved_self_report', value: item.reason, quote: item.quote, page: null,
    }));
    const source = createSourceRecord({
      displayName: 'Your description', mediaType: 'text/plain', sizeBytes: Buffer.byteLength(prepared.text, 'utf8'),
      sha256, origin: 'user_entered', state: 'extracting',
      documentContext: unresolvedNotes.length ? { documentType: 'Self-reported description', notes: unresolvedNotes } : null,
    });
    await localDemoRepository.createSource(source);
    const claims = prepared.claims.map((claim) => createCandidateClaim({
      sourceId: source.id, kind: claim.kind, label: claim.label, value: claim.value,
      unit: claim.unit, effectiveAt: claim.effectiveAt, confidence: claim.confidence,
      sourceLocation: { quote: claim.quote, page: null },
    })).filter(Boolean);
    await localDemoRepository.saveCandidateClaims(claims);
    const nextState = claims.length ? 'candidate_review' : 'extracted_empty';
    await localDemoRepository.setSourceState(source.id, nextState);
    const runId = randomUUID();
    await localDemoRepository.appendRunEvent(createRunEvent({ runId, sequence: 1, type: 'self_report_completed', stage: 'self_report_review', status: 'complete', displayLabel: 'Nura organized this description on the local service', refs: [{ kind: 'source', id: source.id }, ...claims.slice(0, 20).map((claim) => ({ kind: 'claim', id: claim.id }))] }));
    json(response, 200, { mode: 'local_demo_synthetic_only', duplicate: false, source: { ...source, state: nextState }, claims });
  } catch {
    // Never return an exception, request body, prompt, or provider payload to the client.
    json(response, 500, { error: 'self_report_review_failed', message: 'This description could not be organized. Your saved profile was not changed.' });
  }
}

function healthSourceTitle(title, pathname, topic) {
  const supplied = typeof title === 'string' ? title.trim() : '';
  if (supplied && supplied.toLowerCase() !== 'health information source') return supplied.slice(0, 140);
  const segments = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part).replace(/\.(html?|aspx?)$/i, ''));
  const descriptive = segments.filter((part) => !/^(en|about|health|health-topics|topics|diseases|conditions)$/i.test(part));
  const slug = descriptive.at(-1) || segments.at(-1) || '';
  if (!slug || slug.length > 55 || !/[-_]/.test(slug)) return `${topic} health information`;
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 140);
}

function cleanHealthSummary(value) {
  return String(value || '').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1').replace(/https?:\/\/[^\s)]+/g, '').replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1400);
}

async function handleHealthFeed(request, response, operation = null) {
  if (process.env.NURA_HEALTH_SEARCH_ENABLED !== 'true' || process.env.NURA_ENABLE_DEMO_WEB_SEARCH !== 'true') {
    json(response, 503, { error: 'search_disabled', message: 'Trusted health search is disabled on this local service.' });
    return;
  }
  let body;
  try { body = await readBody(request); }
  catch (error) { json(response, 400, { error: 'invalid_request', message: error.message }); return; }
  if (body.consentConfirmed !== true) {
    json(response, 400, { error: 'consent_required', message: 'Confirm that Nura may search trusted public sources for the selected health areas.' });
    return;
  }
  if (!Array.isArray(body.topics) || body.topics.length < 1 || body.topics.length > 3) {
    json(response, 400, { error: 'invalid_topics', message: 'Choose between one and three health areas for this search.' });
    return;
  }
  let topics;
  try {
    topics = sanitizePublicHealthTopics(body.topics.map((value) => ({
      id: typeof value?.id === 'string' ? value.id.trim() : '',
      label: typeof value?.label === 'string' ? value.label.trim().replace(/\s+/g, ' ') : '',
    })));
  } catch {
    json(response, 400, { error: 'invalid_topics', message: 'One of the selected health areas could not be searched.' });
    return;
  }
  if (body.excludeUrls !== undefined && (!Array.isArray(body.excludeUrls) || body.excludeUrls.length > 500)) {
    json(response, 400, { error: 'invalid_excluded_sources', message: 'The list of sources already in your library could not be used.' });
    return;
  }
  const previouslySeenUrls = [...new Set((body.excludeUrls ?? []).flatMap((value) => {
    if (typeof value !== 'string' || value.length > 2048) return [];
    const canonical = canonicalHealthUrl(value);
    return canonical ? [canonical] : [];
  }))];

  const runId = randomUUID();
  const abortController = operation ? { signal: operation.signal, abort: operation.abort } : new AbortController();
  response.on('close', () => { if (!response.writableEnded) abortController.abort(); });
  const { emit, flush } = openSse(response, runId, undefined, abortController.signal);
  emit('run_started', { runId });
  try {
    const byUrl = new Map();
    const byTitle = new Map();
    const items = [];
    const briefs = [];
    const failedTopics = [];
    for (const [index, topic] of topics.entries()) {
      if (abortController.signal.aborted) throw new Error('Search stopped.');
      const activityId = `trusted-search-${index + 1}`;
      emit('trace', { id: activityId, label: 'Searching trusted health sources', status: 'started', detail: `Selected area: ${topic.label}` });
      let result;
      try {
        result = await searchHealthFeedSources({
          query: topic.label,
          signal: abortController.signal,
          excludeUrls: [...previouslySeenUrls, ...items.map((item) => item.url)],
        });
      } catch (error) {
        if (abortController.signal.aborted) throw error;
        const message = error instanceof HealthVideoSearchUnavailableError || error instanceof HealthSearchConfigurationError
          ? error.message
          : 'Trusted source search did not finish. Try again in a moment.';
        const safeCode = typeof error?.code === 'string' && /^[a-z0-9_]{1,64}$/i.test(error.code) ? error.code : 'trusted_health_search_failed';
        failedTopics.push({ topic: topic.label, message, safeCode });
        emit('trace', { id: activityId, label: 'Searching trusted health sources', status: 'failed', detail: `Search failed for ${topic.label} — ${message}` });
        continue;
      }
      let articleCount = 0;
      let videoCount = 0;
      const topicItems = [];
      for (const source of result.sources) {
        let url;
        try { url = new URL(source.url); } catch { continue; }
        if (url.protocol !== 'https:') continue;
        const isVideo = Boolean(getYouTubeVideoId(url.href));
        if (isVideo ? videoCount >= 3 : articleCount >= 3) continue;
        const candidate = addHealthFeedCandidate({
          byUrl, byTitle, source, topic: topic.label,
          title: healthSourceTitle(source.title, url.pathname, topic.label),
          detail: String(source.detail || '').replace(/\s+/g, ' ').slice(0, 520) || `Open the publisher’s page for its guidance on ${topic.label}.`,
          retrievedAt: new Date().toISOString(),
          mergeTopic: false,
        });
        if (!candidate.added) continue;
        items.push(candidate.item);
        topicItems.push(candidate.item);
        if (isVideo) videoCount += 1;
        else articleCount += 1;
      }
      briefs.push({ id: topic.id, topic: topic.label, summary: cleanHealthSummary(result.summary), sourceIds: topicItems.map((item) => item.id) });
      const unavailableMessage = typeof result.unavailableMessage === 'string' ? result.unavailableMessage : '';
      const mediaCounts = `Found ${articleCount} article${articleCount === 1 ? '' : 's'} · ${videoCount} video${videoCount === 1 ? '' : 's'} for ${topic.label}`;
      const missingMedia = [
        articleCount < 3 ? `${3 - articleCount} more article${3 - articleCount === 1 ? '' : 's'}` : '',
        videoCount < 3 ? `${3 - videoCount} more video${3 - videoCount === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      const shortfallMessage = missingMedia.length ? `Only ${articleCount} of 3 articles and ${videoCount} of 3 videos are available; try this topic again later.` : '';
      const activityMessage = [unavailableMessage, shortfallMessage].filter(Boolean).join(' ');
      if (!topicItems.length && !failedTopics.some((failure) => failure.topic === topic.label)) {
        failedTopics.push({ topic: topic.label, message: activityMessage || 'No trusted articles or videos were found for this topic.', safeCode: 'trusted_health_search_empty' });
      }
      emit('trace', {
        id: activityId,
        label: 'Searching trusted health sources',
        status: activityMessage ? 'failed' : 'complete',
        detail: activityMessage ? `${mediaCounts} · ${activityMessage}` : mediaCounts,
      });
    }
    if (!items.length && failedTopics.length) {
      const failure = failedTopics[0];
      emit('run_error', { runId, message: failure.message, safeCode: failure.safeCode });
      return;
    }
    emit('feed_items', { items, briefs });
    emit('run_finished', { runId });
  } catch (error) {
    const message = abortController.signal.aborted
      ? 'This search was stopped. Your saved profile was not changed.'
      : error instanceof HealthVideoSearchUnavailableError
        ? error.message
        : error instanceof HealthSearchConfigurationError
          ? error.message
        : 'Nura could not complete the trusted health search. Your saved profile was not changed.';
    const safeCode = typeof error?.code === 'string' && /^[a-z0-9_]{1,64}$/i.test(error.code) ? error.code : undefined;
    emit('run_error', { runId, message, ...(safeCode ? { safeCode } : {}) });
  } finally {
    await flush();
    operation?.finish();
    if (!response.writableEnded) response.end();
  }
}

const server = createServer(async (request, response) => {
  cors(request, response);
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  if (!isAllowedOrigin(request.headers.origin, allowedOrigins)) { json(response, 403, { error: 'origin_not_allowed' }); return; }

  if (request.method === 'GET' && url.pathname === '/healthz') {
    const provider = getLanguageModelStatus();
    json(response, 200, { ok: true, service: 'nura-agent-dev', mode: 'local_demo_synthetic_only', provider, capabilities: {
      askProfile: provider.configured,
      documentExtraction: DEMO_INTAKE_ENABLED && provider.configured,
      localSampleDocuments: DEMO_INTAKE_ENABLED,
      trustedHealthSearch: process.env.NURA_HEALTH_SEARCH_ENABLED === 'true' && process.env.NURA_ENABLE_DEMO_WEB_SEARCH === 'true' && getYouTubeVideoSearchStatus().configured,
      youtubeVideoSearch: getYouTubeVideoSearchStatus().configured,
      audioTranscription: process.env.NURA_ENABLE_AUDIO_INTAKE !== 'false' && provider.configured,
      persistentDemoRepository: true,
    }, identity: { mode: localDemoProfileAccess.identityMode, sessionVerification: 'server_issued_synthetic_demo', productionIdentity: localDemoProfileAccess.productionIdentity } });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/demo/session') {
    if (rateLimited('demo-session', request.socket.remoteAddress ?? 'unknown', 8)) { json(response, 429, { error: 'rate_limited', message: 'Please wait before opening another preview session.' }); return; }
    if (String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      json(response, 415, { error: 'unsupported_media_type' }); return;
    }
    let challenge;
    try { challenge = await readBody(request, 4_000); }
    catch { json(response, 400, { error: 'invalid_request', message: 'Check the sample preview details and try again.' }); return; }
    try {
      const issued = localDemoSessionVerifier.issueDemoSession(challenge);
      json(response, 201, { mode: 'synthetic_demo_session', accessToken: issued.accessToken, expiresAt: new Date(issued.expiresAt).toISOString() });
    } catch {
      json(response, 401, { error: 'preview_sign_in_denied', message: 'The preview sign-in could not be verified. Check the sample details and try again.' });
    }
    return;
  }

  let requestPrincipal = null;
  if (url.pathname.startsWith('/v1/')) {
    const verification = await verifyRequestSession(request, localDemoSessionVerifier);
    if (verification.status !== 'verified') { json(response, 401, { error: 'session_required', message: 'Your preview session has ended. Sign in again to continue.' }); return; }
    requestPrincipal = verification.principal;
    const access = await localDemoProfileAccess.authorize({ principal: requestPrincipal, requestedProfileId: DEMO_PROFILE_ID });
    if (access.status !== 'allowed') { json(response, 403, { error: 'profile_unavailable', message: 'This preview profile is unavailable.' }); return; }
  }

  if (url.pathname === '/v1/demo/session' && request.method === 'GET') {
    json(response, 200, { valid: true, mode: 'synthetic_demo_session' });
    return;
  }
  if (url.pathname === '/v1/demo/session' && request.method === 'DELETE') {
    const credential = String(request.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]{40,256})$/)?.[1];
    json(response, 200, { revoked: localDemoSessionVerifier.revoke(credential), mode: 'synthetic_demo_session' });
    return;
  }

  if (url.pathname === '/v1/privacy/consent-preferences' && request.method === 'GET') {
    try {
      const state = await localDemoPrivacyConsentPolicy.getSettings(DEMO_PROFILE_ID);
      json(response, 200, {
        mode: 'local_demo_synthetic_only',
        policyVersion: PRIVACY_CONSENT_POLICY_VERSION,
        settings: state.settings,
        events: state.events.map(({ id, purpose, decision, policyVersion, recordedAt }) => ({ id, purpose, decision, policyVersion, recordedAt })),
      });
    } catch {
      json(response, 500, { error: 'privacy_preferences_unavailable', message: 'Nura could not load your processing choices. Try again.' });
    }
    return;
  }

  if (url.pathname === '/v1/privacy/consent-preferences' && request.method === 'PUT') {
    let body;
    try { body = await readBody(request, 4_000); }
    catch (error) { json(response, 400, { error: 'invalid_privacy_preferences', message: error.message }); return; }
    // Withdrawal takes effect for active demo work as soon as the request is
    // accepted, before persistence or another provider response can complete.
    const withdrawnPurposes = [];
    if (body?.aiProcessing === false) withdrawnPurposes.push(PRIVACY_PURPOSES.AI_PROCESSING, PRIVACY_PURPOSES.DOCUMENT_REVIEW);
    if (body?.publicHealthSearch === false) withdrawnPurposes.push(PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH);
    if (withdrawnPurposes.length) inFlightProcessing.abortPurposes(DEMO_PROFILE_ID, withdrawnPurposes);
    try {
      const state = await localDemoPrivacyConsentPolicy.changeSettings(DEMO_PROFILE_ID, body);
      json(response, 200, {
        mode: 'local_demo_synthetic_only',
        policyVersion: PRIVACY_CONSENT_POLICY_VERSION,
        settings: state.settings,
        events: state.events.map(({ id, purpose, decision, policyVersion, recordedAt }) => ({ id, purpose, decision, policyVersion, recordedAt })),
      });
    } catch (error) {
      const reconfirmation = error?.code === 'consent_reconfirmation_required';
      json(response, reconfirmation ? 409 : 400, {
        error: reconfirmation ? 'consent_reconfirmation_required' : 'invalid_privacy_preferences',
        message: error instanceof Error ? error.message : 'Choose valid privacy settings.',
      });
    }
    return;
  }

  if (request.method === 'DELETE' && url.pathname === '/v1/demo/profile') {
    try {
      const cleared = await localDemoRepository.clearDemoProfile(DEMO_PROFILE_ID);
      json(response, 200, { mode: 'local_demo_synthetic_only', cleared });
    } catch {
      json(response, 500, { error: 'demo_data_clear_failed', message: 'The local processing data could not be cleared. Try again.' });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/health/feed') {
    if (rateLimited('health-search', request.socket.remoteAddress ?? 'unknown')) { json(response, 429, { error: 'rate_limited', message: 'Please wait a moment before searching again.' }); return; }
    const operation = inFlightProcessing.begin({ profileId: DEMO_PROFILE_ID, purposes: [PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH] });
    const decision = await localDemoPrivacyConsentPolicy.authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH);
    if (!decision.allowed || operation.signal.aborted) {
      operation.finish();
      json(response, 409, { error: 'consent_withdrawn', purpose: PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH, message: 'Public health searches are turned off in Data & privacy settings.' });
      return;
    }
    try { await handleHealthFeed(request, response, operation); }
    finally { operation.finish(); }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/health/feed/notes') {
    if (rateLimited('health-feed-notes', request.socket.remoteAddress ?? 'unknown', 12)) { json(response, 429, { error: 'rate_limited', message: 'Please wait before requesting more personalized notes.' }); return; }
    const operation = inFlightProcessing.begin({ profileId: DEMO_PROFILE_ID, purposes: [PRIVACY_PURPOSES.AI_PROCESSING] });
    const decision = await localDemoPrivacyConsentPolicy.authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.AI_PROCESSING);
    if (!decision.allowed || operation.signal.aborted) {
      operation.finish();
      json(response, 409, { error: 'consent_withdrawn', purpose: PRIVACY_PURPOSES.AI_PROCESSING, message: 'AI processing is turned off in Data & privacy settings.' });
      return;
    }
    let body;
    try { body = await readBody(request, 48_000); sanitizeFeedPersonalizationRequest(body); }
    catch (error) { operation.finish(); json(response, 400, { error: 'invalid_personalization_request', message: error instanceof Error ? error.message : 'Review the personalization choice and try again.' }); return; }
    const providerStatus = getLanguageModelStatus();
    if (!providerStatus.configured) { operation.finish(); json(response, 503, { error: 'service_unavailable', message: 'Nura’s personalized reading service is not configured on this development server yet.' }); return; }
    response.on('close', () => { if (!response.writableEnded) operation.abort(); });
    try {
      if (operation.signal.aborted) { json(response, 409, { error: 'consent_withdrawn', purpose: PRIVACY_PURPOSES.AI_PROCESSING, message: 'AI processing is turned off in Data & privacy settings.' }); return; }
      const notes = await createFeedPersonalizedNotes({ request: body, createResponse: getLanguageModel().createResponse, signal: operation.signal });
      if (!response.writableEnded && !operation.signal.aborted) json(response, 200, { notes });
      else if (!response.writableEnded) json(response, 409, { error: 'consent_withdrawn', purpose: PRIVACY_PURPOSES.AI_PROCESSING, message: 'AI processing is turned off in Data & privacy settings.' });
    } catch (error) {
      const failure = presentAgentRunFailure(error, operation.signal.aborted);
      const credentialRejected = failure.safeCode === 'ai_credential_rejected';
      if (!response.writableEnded) json(response, operation.signal.aborted ? 409 : credentialRejected ? 503 : 502, { error: operation.signal.aborted ? 'consent_withdrawn' : failure.safeCode, ...(operation.signal.aborted ? { purpose: PRIVACY_PURPOSES.AI_PROCESSING } : {}), message: operation.signal.aborted ? 'AI processing is turned off in Data & privacy settings.' : failure.message });
    } finally {
      operation.finish();
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/intake/extract') {
    if (rateLimited('document-processing', request.socket.remoteAddress ?? 'unknown', 20)) { json(response, 429, { error: 'rate_limited', message: 'You’ve reached the short-term limit for file processing. Please wait a moment before trying again.' }); return; }
    const purpose = String(request.headers['x-nura-document-purpose'] || 'medical');
    const fixtureId = String(request.headers['x-nura-local-sample-fixture'] || '');
    let operation = null;
    if (!isLocalSampleFixtureId(fixtureId, purpose)) {
      operation = inFlightProcessing.begin({ profileId: DEMO_PROFILE_ID, purposes: [PRIVACY_PURPOSES.DOCUMENT_REVIEW] });
      const decision = await localDemoPrivacyConsentPolicy.authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.DOCUMENT_REVIEW);
      if (!decision.allowed || operation.signal.aborted) {
        operation.finish();
        json(response, 409, { error: 'consent_withdrawn', purpose: PRIVACY_PURPOSES.DOCUMENT_REVIEW, message: 'AI document reading is turned off in Data & privacy settings.' });
        return;
      }
    }
    try { await handleExtraction(request, response, operation); }
    finally { operation?.finish(); }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/intake/self-report') {
    await handleSelfReport(request, response);
    return;
  }

  const claimsMatch = request.method === 'GET' && url.pathname.match(/^\/v1\/intake\/sources\/([a-zA-Z0-9-]+)\/claims$/);
  if (claimsMatch) {
    const source = await localDemoRepository.getSource(claimsMatch[1]);
    if (!source || !(await canAccessProfile(source.profileId, requestPrincipal))) { json(response, 404, { error: 'source_not_found' }); return; }
    const claims = await localDemoRepository.listClaims(source.id);
    json(response, 200, { mode: 'local_demo_synthetic_only', source, claims });
    return;
  }

  const sourceRemovalMatch = request.method === 'DELETE' && url.pathname.match(/^\/v1\/intake\/sources\/([a-zA-Z0-9-]+)$/);
  if (sourceRemovalMatch) {
    const source = await localDemoRepository.getSource(sourceRemovalMatch[1]);
    const profileId = source?.profileId ?? DEMO_PROFILE_ID;
    if (!(await canAccessProfile(profileId, requestPrincipal))) { json(response, 404, { error: 'source_not_found' }); return; }
    try {
      // The local preview repository retains an identifier-only deletion receipt
      // so a retry after a lost response can still finish device-side cleanup.
      const result = await localDemoRepository.removeSource(sourceRemovalMatch[1], profileId);
      if (!result) { json(response, 404, { error: 'source_not_found' }); return; }
      const { sourceId: _sourceId, profileId: _profileId, claimIds, assertionIds, alreadyRemoved, ...removed } = result;
      json(response, 200, { mode: 'local_demo_synthetic_only', alreadyRemoved, removed, claimIds, assertionIds });
    } catch {
      json(response, 500, { error: 'source_removal_failed', message: 'Nura could not remove this source and its review details. Try again.' });
    }
    return;
  }

  const decisionMatch = request.method === 'POST' && url.pathname.match(/^\/v1\/intake\/claims\/([a-zA-Z0-9-]+)\/decision$/);
  if (decisionMatch) {
    if (!DEMO_INTAKE_ENABLED) { json(response, 404, { error: 'not_found' }); return; }
    let body;
    try { body = await readBody(request); } catch (error) { json(response, 400, { error: 'invalid_request', message: error.message }); return; }
    const existing = await localDemoRepository.getClaim(decisionMatch[1]);
    if (!existing || !(await canAccessProfile(existing.profileId, requestPrincipal))) { json(response, 404, { error: 'claim_not_found' }); return; }
    try {
      const result = await localDemoRepository.decideClaim(existing.id, body);
      const event = createRunEvent({ runId: `review-${existing.id}`, sequence: 1, type: result.claim.evidenceState === 'user_confirmed' ? 'claim.accepted' : `claim.${result.claim.evidenceState}`, stage: 'claim_review', status: 'complete', displayLabel: result.claim.evidenceState === 'user_confirmed' ? 'You accepted a sourced claim' : 'You reviewed a sourced claim', refs: [{ kind: 'source', id: result.claim.sourceId }, ...(result.assertion ? [{ kind: 'assertion', id: result.assertion.id }] : [])] });
      await localDemoRepository.appendRunEvent(event);
      json(response, 200, { mode: 'local_demo_synthetic_only', ...result });
    } catch (error) { json(response, 400, { error: 'invalid_decision', message: error instanceof Error ? error.message : 'The review decision could not be saved.' }); }
    return;
  }

  const correctionMatch = request.method === 'POST' && url.pathname.match(/^\/v1\/intake\/claims\/([a-zA-Z0-9-]+)\/correction$/);
  if (correctionMatch) {
    if (!DEMO_INTAKE_ENABLED) { json(response, 404, { error: 'not_found' }); return; }
    let body;
    try { body = await readBody(request); } catch (error) { json(response, 400, { error: 'invalid_request', message: error.message }); return; }
    const existing = await localDemoRepository.getClaim(correctionMatch[1]);
    if (!existing || !(await canAccessProfile(existing.profileId, requestPrincipal))) { json(response, 404, { error: 'claim_not_found' }); return; }
    try {
      const result = await localDemoRepository.correctClaim(existing.id, body);
      const event = createRunEvent({
        runId: `correction-${existing.id}`, sequence: result.claim.revisionHistory.length, type: 'claim.corrected',
        stage: 'claim_review', status: 'complete', displayLabel: 'You corrected a sourced detail',
        refs: [{ kind: 'source', id: result.claim.sourceId }, { kind: 'assertion', id: result.previousAssertion.id }, { kind: 'assertion', id: result.assertion.id }],
      });
      await localDemoRepository.appendRunEvent(event);
      json(response, 200, { mode: 'local_demo_synthetic_only', ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The correction could not be saved.';
      const conflict = /changed since you opened|current accepted version is unavailable/i.test(message);
      json(response, conflict ? 409 : 400, { error: conflict ? 'stale_version' : 'invalid_correction', message });
    }
    return;
  }

  const retractionMatch = request.method === 'POST' && url.pathname.match(/^\/v1\/intake\/claims\/([a-zA-Z0-9-]+)\/retraction$/);
  if (retractionMatch) {
    if (!DEMO_INTAKE_ENABLED) { json(response, 404, { error: 'not_found' }); return; }
    let body;
    try { body = await readBody(request); } catch (error) { json(response, 400, { error: 'invalid_request', message: error.message }); return; }
    const existing = await localDemoRepository.getClaim(retractionMatch[1]);
    if (!existing || !(await canAccessProfile(existing.profileId, requestPrincipal))) { json(response, 404, { error: 'claim_not_found' }); return; }
    try {
      const result = await localDemoRepository.retractClaim(existing.id, body);
      if (!result || !result.previousAssertion) { json(response, 409, { error: 'retraction_unavailable', message: 'The accepted source version could not be found.' }); return; }
      if (!result.unchanged) {
        await localDemoRepository.appendRunEvent(createRunEvent({
          runId: `retraction-${existing.id}`, sequence: 1, type: 'claim.retracted',
          stage: 'claim_review', status: 'complete', displayLabel: 'You removed a detail from the active profile',
          refs: [{ kind: 'source', id: result.claim.sourceId }, { kind: 'assertion', id: result.previousAssertion.id }],
        }));
      }
      json(response, 200, { mode: 'local_demo_synthetic_only', ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The detail could not be removed from the active profile.';
      const conflict = /changed since you opened|current accepted version is unavailable/i.test(message);
      json(response, conflict ? 409 : 400, { error: conflict ? 'stale_version' : 'invalid_retraction', message });
    }
    return;
  }

  if (request.method !== 'POST' || url.pathname !== '/v1/agent/runs') { json(response, 404, { error: 'not_found' }); return; }
  if (rateLimited('ask', request.socket.remoteAddress ?? 'unknown')) { json(response, 429, { error: 'rate_limited', message: 'Please wait a moment before asking again.' }); return; }
  const operation = inFlightProcessing.begin({ profileId: DEMO_PROFILE_ID, purposes: [PRIVACY_PURPOSES.AI_PROCESSING] });
  try {
  const aiDecision = await localDemoPrivacyConsentPolicy.authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.AI_PROCESSING);
  if (!aiDecision.allowed || operation.signal.aborted) {
    json(response, 409, { error: 'consent_withdrawn', purpose: PRIVACY_PURPOSES.AI_PROCESSING, message: 'AI answers are turned off in Data & privacy settings.' });
    return;
  }
  let body;
  let runId;
  try {
    body = await readBody(request);
    body = resolveAuthorizedAskContext(body, {
      profileId: DEMO_PROFILE_ID,
      assertions: await localDemoRepository.listAssertions(DEMO_PROFILE_ID),
      sources: await localDemoRepository.listSources(DEMO_PROFILE_ID),
    });
    runId = sanitizeRunBody(body).runId;
  }
  catch (error) { json(response, 400, { error: 'invalid_request', message: error instanceof Error ? error.message : 'The request could not be read.' }); return; }
  if (body.externalSearchConsent === true) {
    operation.addPurposes([PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH]);
    const searchDecision = await localDemoPrivacyConsentPolicy.authorize(DEMO_PROFILE_ID, PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH);
    if (!searchDecision.allowed || operation.signal.aborted) {
      json(response, 409, { error: 'consent_withdrawn', purpose: PRIVACY_PURPOSES.PUBLIC_HEALTH_SEARCH, message: 'Public health searches are turned off in Data & privacy settings. Turn them back on or ask without a web search.' });
      return;
    }
  }
  if (!getLanguageModelStatus().configured) { json(response, 503, { error: 'service_unavailable', message: 'Nura’s answer service is not configured on this development server yet.' }); return; }
  response.on('close', () => { if (!response.writableEnded) operation.abort(); });
  const { emit, flush } = openSse(response, runId, undefined, operation.signal);
  try {
    // Development only: request content is held in memory for the run; event persistence omits health values and answer text.
    await runAgent(body, emit, operation.signal);
  } catch (error) {
    emit('run_error', { runId, ...presentAgentRunFailure(error, operation.signal.aborted) });
  } finally {
    await flush();
    if (!response.writableEnded) response.end();
  }
  } finally {
    operation.finish();
  }
});

server.listen(port, host, () => {
  const status = getLanguageModelStatus();
  console.log(`Nura local agent listening at http://${host}:${port} · provider ${status.provider} · configured ${status.configured} · synthetic demo mode`);
});
