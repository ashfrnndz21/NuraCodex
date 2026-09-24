import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { getLanguageModelStatus, extractDocumentClaims, searchHealthSources } from './adapters/index.mjs';
import { runAgent } from './agent/orchestrator.mjs';
import { sanitizeRunBody } from './agent/context.mjs';
import { addHealthFeedCandidate, uniqueHealthFeedItems } from './agent/feedResults.mjs';
import { localDemoRepository } from './adapters/localDemoRepository.mjs';
import { createCandidateClaim, createDocumentContext, createRunEvent, createSourceRecord, DEMO_PROFILE_ID } from './contracts.mjs';

const host = process.env.NURA_BIND_HOST || '127.0.0.1';
const port = Number(process.env.NURA_AGENT_PORT || 4175);
const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!allowedHosts.has(host)) throw new Error('The development agent server binds to loopback only. Add authenticated deployment infrastructure before exposing it to a network.');
if (process.env.NODE_ENV === 'production') throw new Error('This development agent server cannot be started in production.');
const allowedOrigins = new Set((process.env.NURA_ALLOWED_ORIGINS || 'http://localhost:8092,http://127.0.0.1:8092,http://localhost:8081,http://127.0.0.1:8081').split(',').map((value) => value.trim()).filter(Boolean));
const rate = new Map();
const MAX_BODY_BYTES = 96_000;
const configuredUploadCap = Number(process.env.NURA_MAX_INTAKE_BYTES || 15 * 1024 * 1024);
const MAX_INTAKE_BYTES = Number.isSafeInteger(configuredUploadCap) ? Math.min(Math.max(configuredUploadCap, 64 * 1024), 15 * 1024 * 1024) : 15 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ['application/pdf', ['.pdf']], ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']], ['image/webp', ['.webp']],
]);
const DEMO_INTAKE_ENABLED = process.env.NURA_ENABLE_DEMO_INTAKE !== 'false';

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function cors(request, response) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'Origin');
  }
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type, accept, x-nura-file-name, x-nura-consent-confirmed, x-nura-document-purpose');
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

function rateLimited(ip) {
  const now = Date.now(); const recent = (rate.get(ip) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 8) return true;
  recent.push(now); rate.set(ip, recent); return false;
}

function cleanFilename(raw, contentType) {
  let decoded = '';
  try { decoded = decodeURIComponent(raw || ''); } catch { decoded = ''; }
  const basename = decoded.split(/[\\/]/).pop()?.replace(/[\0-\x1f\x7f]/g, '').trim().slice(0, 160) || 'health-record';
  const allowed = MIME_EXTENSIONS.get(contentType);
  const extension = basename.slice(basename.lastIndexOf('.')).toLowerCase();
  if (!allowed || !allowed.includes(extension)) throw new Error('Choose a PDF, JPEG, PNG or WEBP file with a matching file type.');
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
  const labels = {
    run_started: 'Nura started this request', run_finished: 'Nura completed this request', run_error: 'Nura could not complete this request', feed_items: 'Trusted health sources are ready',
    intake_started: 'Preparing the selected source', source_received: 'Source received for this local demo', duplicate_detected: 'An exact duplicate was found',
    extraction_started: 'Reading the selected document', extraction_completed: 'Document extraction completed',
    claims_ready_for_review: 'Extracted items are ready for your review', intake_completed: 'The selected source is ready', intake_cancelled: 'File processing stopped', review_completed: 'Your review was saved', trace: 'Nura updated its activity', evidence: 'Nura checked selected evidence', answer: 'Nura prepared an answer',
  };
  return labels[type] || 'Nura updated this request';
}

function openSse(response, runId) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  response.flushHeaders?.();
  let sequence = 0;
  const pendingWrites = [];
  const emit = (type, data = {}) => {
    if (response.writableEnded || response.destroyed) return;
    sequence += 1;
    const event = {
      schemaVersion: 1, eventId: randomUUID(), sequence, occurredAt: new Date().toISOString(),
      ...data,
      runId: typeof data.runId === 'string' ? data.runId : runId,
    };
    response.write(`id: ${sequence}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
    // Persist only safe envelope metadata. Never persist event detail, answer text, evidence values or file content.
    const persisted = createRunEvent({ runId, sequence, type, stage: type.split('_')[0], status: statusForEvent(type, data), displayLabel: displayForEvent(type, data) });
    pendingWrites.push(localDemoRepository.appendRunEvent(persisted));
  };
  return { emit, flush: async () => { await Promise.allSettled(pendingWrites); } };
}

async function handleExtraction(request, response) {
  if (!DEMO_INTAKE_ENABLED) { json(response, 404, { error: 'not_found' }); return; }
  if (request.headers['x-nura-consent-confirmed'] !== 'true') { json(response, 400, { error: 'consent_required', message: 'Confirm that this selected file may be sent to the configured AI provider for this one extraction.' }); return; }
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!MIME_EXTENSIONS.has(contentType)) { json(response, 415, { error: 'unsupported_media_type', message: 'Only PDF, JPEG, PNG and WEBP files are supported in this local demo.' }); return; }
  const purposeHeader = String(request.headers['x-nura-document-purpose'] || 'medical');
  if (purposeHeader !== 'medical' && purposeHeader !== 'insurance') { json(response, 400, { error: 'invalid_document_purpose', message: 'Choose a medical record or insurance policy review.' }); return; }
  let filename;
  try { filename = cleanFilename(String(request.headers['x-nura-file-name'] || ''), contentType); }
  catch (error) { json(response, 400, { error: 'invalid_file_name', message: error.message }); return; }
  if (!getLanguageModelStatus().configured) { json(response, 503, { error: 'service_unavailable', message: 'The local extraction service needs a configured server-side OpenAI API key.' }); return; }

  const runId = randomUUID();
  const abortController = new AbortController();
  response.on('close', () => { if (!response.writableEnded) abortController.abort(); });
  const { emit, flush } = openSse(response, runId);
  emit('intake_started', { mediaType: contentType });
  let sourceId = null;
  try {
    const bytes = await readBinaryBody(request);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const duplicate = await localDemoRepository.findSourceByHash(DEMO_PROFILE_ID, sha256);
    if (duplicate && duplicate.state !== 'failed') {
      emit('duplicate_detected', { sourceId: duplicate.id, duplicateOfSourceId: duplicate.id, sha256, exactMatch: true });
      emit('intake_completed', { sourceId: duplicate.id, state: 'duplicate_exact', exactMatch: true });
      return;
    }

    const source = duplicate ?? createSourceRecord({ displayName: filename, mediaType: contentType, sizeBytes: bytes.length, sha256 });
    sourceId = source.id;
    if (!duplicate) await localDemoRepository.createSource(source);
    emit('source_received', { sourceId, sha256, sizeBytes: bytes.length, storage: 'device_original_only' });
    await localDemoRepository.setSourceState(sourceId, 'extracting');
    emit('extraction_started', { sourceId, provider: 'openai_responses', realProviderCall: true });
    const extraction = await extractDocumentClaims({ bytes, filename, mediaType: contentType, purpose: purposeHeader, signal: abortController.signal });
    if (abortController.signal.aborted) {
      await localDemoRepository.setSourceState(sourceId, 'failed');
      emit('intake_cancelled', { sourceId, state: 'failed' });
      return;
    }
    const claims = extraction.claims.map((claim) => createCandidateClaim({
      sourceId, kind: claim.kind, label: claim.label, value: claim.value, unit: claim.unit,
      referenceRange: claim.referenceRange, method: claim.method,
      effectiveAt: claim.effectiveAt, confidence: claim.confidence,
      sourceLocation: { page: claim.page, quote: claim.quote, locationConfidence: 'model_suggested' },
    })).filter(Boolean);
    const documentContext = createDocumentContext(extraction.documentContext);
    await localDemoRepository.saveCandidateClaims(claims);
    await localDemoRepository.setSourceState(sourceId, claims.length ? 'candidate_review' : 'extracted_empty', { documentContext });
    emit('extraction_completed', { sourceId, candidateCount: claims.length, state: claims.length ? 'candidate_review' : 'extracted_empty' });
    if (claims.length) emit('claims_ready_for_review', { sourceId, claimIds: claims.map((claim) => claim.id), count: claims.length });
    emit('intake_completed', { sourceId, state: claims.length ? 'candidate_review' : 'extracted_empty' });
  } catch (error) {
    if (sourceId) await localDemoRepository.setSourceState(sourceId, 'failed').catch(() => {});
    const message = abortController.signal.aborted ? 'This extraction was stopped. No claim was added to the profile.' : error instanceof Error ? error.message : 'The selected document could not be processed.';
    emit(abortController.signal.aborted ? 'intake_cancelled' : 'run_error', { sourceId, message });
  } finally {
    await flush();
    if (!response.writableEnded) response.end();
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

async function handleHealthFeed(request, response) {
  if (process.env.NURA_HEALTH_SEARCH_ENABLED !== 'true' || process.env.NURA_ENABLE_DEMO_WEB_SEARCH !== 'true') {
    json(response, 503, { error: 'search_disabled', message: 'Trusted health search is disabled on this local service.' });
    return;
  }
  if (!getLanguageModelStatus().configured) {
    json(response, 503, { error: 'service_unavailable', message: 'The trusted health search service is not configured.' });
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
  const topics = [];
  for (const value of body.topics) {
    const id = typeof value?.id === 'string' ? value.id.trim() : '';
    const label = typeof value?.label === 'string' ? value.label.trim().replace(/\s+/g, ' ') : '';
    if (!/^[A-Za-z0-9:_-]{1,80}$/.test(id) || !/^[\p{L}\p{N}][\p{L}\p{N} &'()+/-]{0,59}$/u.test(label)) {
      json(response, 400, { error: 'invalid_topics', message: 'One of the selected health areas could not be searched.' });
      return;
    }
    topics.push({ id, label });
  }

  const runId = randomUUID();
  const abortController = new AbortController();
  response.on('close', () => { if (!response.writableEnded) abortController.abort(); });
  const { emit, flush } = openSse(response, runId);
  emit('run_started', { runId });
  try {
    const byUrl = new Map();
    const byTitle = new Map();
    const briefs = [];
    for (const [index, topic] of topics.entries()) {
      if (abortController.signal.aborted) throw new Error('Search stopped.');
      const activityId = `trusted-search-${index + 1}`;
      emit('trace', { id: activityId, label: 'Searching trusted health sources', status: 'started', detail: `Selected area: ${topic.label}` });
      const result = await searchHealthSources({ query: topic.label, signal: abortController.signal });
      let sourceCount = 0;
      for (const source of result.sources) {
        let url;
        try { url = new URL(source.url); } catch { continue; }
        if (url.protocol !== 'https:') continue;
        const resultItem = addHealthFeedCandidate({
          byUrl, byTitle, source, topic: topic.label,
          title: healthSourceTitle(source.title, url.pathname, topic.label),
          detail: String(source.detail || '').replace(/\s+/g, ' ').slice(0, 520) || `Open the publisher’s page for its guidance on ${topic.label}.`,
          retrievedAt: new Date().toISOString(),
        });
        if (resultItem.added) sourceCount += 1;
      }
      const topicSources = uniqueHealthFeedItems(byUrl).filter((item) => item.topic.split(' · ').includes(topic.label));
      briefs.push({ id: topic.id, topic: topic.label, summary: cleanHealthSummary(result.summary), sourceIds: topicSources.map((item) => item.id) });
      emit('trace', { id: activityId, label: 'Searching trusted health sources', status: 'complete', detail: `Found ${sourceCount} new source${sourceCount === 1 ? '' : 's'} for ${topic.label}` });
    }
    const items = uniqueHealthFeedItems(byUrl).slice(0, 12);
    emit('feed_items', { items, briefs });
    emit('run_finished', { runId });
  } catch {
    emit('run_error', { runId, message: abortController.signal.aborted ? 'This search was stopped. Your saved profile was not changed.' : 'Nura could not complete the trusted health search. Your saved profile was not changed.' });
  } finally {
    await flush();
    if (!response.writableEnded) response.end();
  }
}

const server = createServer(async (request, response) => {
  cors(request, response);
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  if (request.headers.origin && !allowedOrigins.has(request.headers.origin)) { json(response, 403, { error: 'origin_not_allowed' }); return; }

  if (request.method === 'GET' && url.pathname === '/healthz') {
    const provider = getLanguageModelStatus();
    json(response, 200, { ok: true, service: 'nura-agent-dev', mode: 'local_demo_synthetic_only', provider, capabilities: {
      askProfile: provider.configured,
      documentExtraction: DEMO_INTAKE_ENABLED && provider.configured,
      trustedHealthSearch: process.env.NURA_HEALTH_SEARCH_ENABLED === 'true' && process.env.NURA_ENABLE_DEMO_WEB_SEARCH === 'true' && provider.configured,
      persistentDemoRepository: true,
    } });
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
    if (rateLimited(request.socket.remoteAddress ?? 'unknown')) { json(response, 429, { error: 'rate_limited', message: 'Please wait a moment before searching again.' }); return; }
    await handleHealthFeed(request, response);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/intake/extract') {
    if (rateLimited(request.socket.remoteAddress ?? 'unknown')) { json(response, 429, { error: 'rate_limited', message: 'Please wait a moment before trying again.' }); return; }
    await handleExtraction(request, response);
    return;
  }

  const claimsMatch = request.method === 'GET' && url.pathname.match(/^\/v1\/intake\/sources\/([a-zA-Z0-9-]+)\/claims$/);
  if (claimsMatch) {
    const source = await localDemoRepository.getSource(claimsMatch[1]);
    if (!source || source.profileId !== DEMO_PROFILE_ID) { json(response, 404, { error: 'source_not_found' }); return; }
    const claims = await localDemoRepository.listClaims(source.id);
    json(response, 200, { mode: 'local_demo_synthetic_only', source, claims });
    return;
  }

  const decisionMatch = request.method === 'POST' && url.pathname.match(/^\/v1\/intake\/claims\/([a-zA-Z0-9-]+)\/decision$/);
  if (decisionMatch) {
    if (!DEMO_INTAKE_ENABLED) { json(response, 404, { error: 'not_found' }); return; }
    if (rateLimited(request.socket.remoteAddress ?? 'unknown')) { json(response, 429, { error: 'rate_limited', message: 'Please wait a moment before trying again.' }); return; }
    let body;
    try { body = await readBody(request); } catch (error) { json(response, 400, { error: 'invalid_request', message: error.message }); return; }
    const existing = await localDemoRepository.getClaim(decisionMatch[1]);
    if (!existing || existing.profileId !== DEMO_PROFILE_ID) { json(response, 404, { error: 'claim_not_found' }); return; }
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
    if (rateLimited(request.socket.remoteAddress ?? 'unknown')) { json(response, 429, { error: 'rate_limited', message: 'Please wait a moment before trying again.' }); return; }
    let body;
    try { body = await readBody(request); } catch (error) { json(response, 400, { error: 'invalid_request', message: error.message }); return; }
    const existing = await localDemoRepository.getClaim(correctionMatch[1]);
    if (!existing || existing.profileId !== DEMO_PROFILE_ID) { json(response, 404, { error: 'claim_not_found' }); return; }
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
    if (rateLimited(request.socket.remoteAddress ?? 'unknown')) { json(response, 429, { error: 'rate_limited', message: 'Please wait a moment before trying again.' }); return; }
    let body;
    try { body = await readBody(request); } catch (error) { json(response, 400, { error: 'invalid_request', message: error.message }); return; }
    const existing = await localDemoRepository.getClaim(retractionMatch[1]);
    if (!existing || existing.profileId !== DEMO_PROFILE_ID) { json(response, 404, { error: 'claim_not_found' }); return; }
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
  if (rateLimited(request.socket.remoteAddress ?? 'unknown')) { json(response, 429, { error: 'rate_limited', message: 'Please wait a moment before asking again.' }); return; }
  let body;
  let runId;
  try { body = await readBody(request); runId = sanitizeRunBody(body).runId; }
  catch (error) { json(response, 400, { error: 'invalid_request', message: error instanceof Error ? error.message : 'The request could not be read.' }); return; }
  if (!getLanguageModelStatus().configured) { json(response, 503, { error: 'service_unavailable', message: 'Nura’s answer service is not configured on this development server yet.' }); return; }
  const abortController = new AbortController();
  response.on('close', () => { if (!response.writableEnded) abortController.abort(); });
  const { emit, flush } = openSse(response, runId);
  try {
    // Development only: request content is held in memory for the run; event persistence omits health values and answer text.
    await runAgent(body, emit, abortController.signal);
  } catch (error) {
    if (abortController.signal.aborted) emit('run_error', { runId, message: 'This run was stopped. Saved records were not changed.' });
    else emit('run_error', { runId, message: error instanceof Error ? error.message : 'Nura could not complete this run.' });
  } finally {
    await flush();
    if (!response.writableEnded) response.end();
  }
});

server.listen(port, host, () => {
  const status = getLanguageModelStatus();
  console.log(`Nura local agent listening at http://${host}:${port} · provider ${status.provider} · configured ${status.configured} · synthetic demo mode`);
});
