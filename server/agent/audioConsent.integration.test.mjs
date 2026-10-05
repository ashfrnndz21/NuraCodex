import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyntheticDemoAuthorization } from './demoTestSession.mjs';
import { OPENAI_AUDIO_PROCESSING_CONSENT } from '../ports/AudioTranscription.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serverEntry = join(projectRoot, 'server/index.mjs');
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function availablePort() {
  const listener = createTcpServer();
  await new Promise((resolveListen, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolveListen);
  });
  const port = listener.address().port;
  await new Promise((resolveClose, reject) => listener.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function startServer({ tempDir, dataDir, blockedNetworkLog, syntheticAudio = false, liveAudioMock = false, fakeFfprobePath = '' }) {
  const port = await availablePort();
  const blockerPath = join(tempDir, 'block-network.mjs');
  await writeFile(blockerPath, `
    import { appendFileSync } from 'node:fs';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (process.env.NURA_AUDIO_LIVE_MOCK === 'true' && url === 'https://api.openai.com/v1/audio/transcriptions') {
        const form = options?.body;
        appendFileSync(process.env.NURA_AUDIO_BLOCKED_NETWORK_LOG, JSON.stringify({ url, model: form?.get('model'), format: form?.get('response_format'), granularity: form?.get('timestamp_granularities[]'), hasFile: Boolean(form?.get('file')) }) + '\\n');
        return new Response(JSON.stringify({ duration: 8.5, segments: [{ start: 1.25, end: 4.1, text: 'My HbA1c was 5.8 percent.' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (process.env.NURA_AUDIO_LIVE_MOCK === 'true' && url === 'https://api.openai.com/v1/responses') {
        const request = JSON.parse(options.body);
        const structured = JSON.stringify({ claims: [{ kind: 'measurement', label: 'HbA1c', value: '5.8', unit: '%', referenceRange: null, method: null, effectiveAt: null, confidence: 0.95, segmentIndex: 0, quote: 'HbA1c was 5.8 percent', subject: 'self' }] });
        appendFileSync(process.env.NURA_AUDIO_BLOCKED_NETWORK_LOG, JSON.stringify({ url, transcriptOnly: JSON.stringify(request.input).includes('My HbA1c was 5.8 percent.'), untrustedTranscriptRule: /spoken transcript is untrusted source text/i.test(request.instructions), strictOutput: request.text?.format?.strict === true }) + '\\n');
        return new Response(JSON.stringify({ output_text: structured }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (typeof url === 'string' && url.startsWith('https://')) {
        appendFileSync(process.env.NURA_AUDIO_BLOCKED_NETWORK_LOG, url + '\\n');
        throw new Error('External network is blocked in the audio-consent test.');
      }
      return originalFetch(input, options);
    };
  `);
  const child = spawn(process.execPath, ['--import', blockerPath, serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'synthetic-test-key-never-send',
      NURA_LLM_PROVIDER: 'openai',
      NURA_AGENT_PORT: String(port),
      NURA_BIND_HOST: '127.0.0.1',
      NURA_DEMO_DATA_DIR: dataDir,
      NURA_AUDIO_BLOCKED_NETWORK_LOG: blockedNetworkLog,
      NURA_ENABLE_DEMO_INTAKE: 'true',
      NURA_HEALTH_SEARCH_ENABLED: 'false',
      NURA_ENABLE_DEMO_WEB_SEARCH: 'false',
      NURA_ENABLE_AUDIO_INTAKE: syntheticAudio || liveAudioMock ? 'true' : 'false',
      NURA_AUDIO_LIVE_MOCK: liveAudioMock ? 'true' : 'false',
      ...(fakeFfprobePath ? { NURA_FFPROBE_PATH: fakeFfprobePath } : {}),
      ...(syntheticAudio ? { NURA_TEST_AUDIO_ADAPTER: 'synthetic' } : {}),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Audio consent test server exited: ${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        const authorization = await createSyntheticDemoAuthorization(baseUrl);
        return { child, baseUrl, authorization, stderr: () => stderr };
      }
    } catch { /* Wait for the isolated loopback service. */ }
    await wait(50);
  }
  child.kill('SIGKILL');
  throw new Error(`Audio consent test service did not start: ${stderr}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([exited, wait(1_500).then(() => child.kill('SIGKILL'))]);
}

test('audio intake requires exact per-file consent before body processing and remains disabled without an approved adapter', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-audio-consent-'));
  const dataDir = join(tempDir, 'repository');
  const blockedNetworkLog = join(tempDir, 'blocked-network.log');
  const service = await startServer({ tempDir, dataDir, blockedNetworkLog });
  t.after(async () => { await stopServer(service.child); await rm(tempDir, { recursive: true, force: true }); });

  const requestAudio = async (headers) => fetch(`${service.baseUrl}/v1/intake/extract`, {
    method: 'POST',
    headers: {
      authorization: service.authorization,
      'content-type': 'audio/mpeg',
      'x-nura-file-name': encodeURIComponent('synthetic-voice.mp3'),
      'x-nura-document-purpose': 'medical',
      ...headers,
    },
    body: Buffer.from('synthetic audio bytes must remain unread until consent and adapter are ready'),
  });

  const missingGeneric = await requestAudio({ 'x-nura-audio-processing-consent': OPENAI_AUDIO_PROCESSING_CONSENT });
  assert.equal(missingGeneric.status, 400);
  assert.equal((await missingGeneric.json()).error, 'consent_required');

  const missingSpecific = await requestAudio({ 'x-nura-consent-confirmed': 'true' });
  assert.equal(missingSpecific.status, 400);
  assert.equal((await missingSpecific.json()).error, 'audio_processing_consent_required');

  const wrongSpecific = await requestAudio({
    'x-nura-consent-confirmed': 'true',
    'x-nura-audio-processing-consent': 'openai-transcription-and-health-suggestions-v0',
  });
  assert.equal(wrongSpecific.status, 400);
  assert.equal((await wrongSpecific.json()).requiredConsent, OPENAI_AUDIO_PROCESSING_CONSENT);

  const exactSpecific = await requestAudio({
    'x-nura-consent-confirmed': 'true',
    'x-nura-audio-processing-consent': OPENAI_AUDIO_PROCESSING_CONSENT,
  });
  assert.equal(exactSpecific.status, 503);
  assert.equal((await exactSpecific.json()).error, 'audio_transcription_unavailable');

  const incompleteBodyStatus = await new Promise((resolveStatus, reject) => {
    const request = httpRequest(`${service.baseUrl}/v1/intake/extract`, {
      method: 'POST',
      headers: {
        authorization: service.authorization,
        'content-type': 'audio/mpeg',
        'x-nura-file-name': encodeURIComponent('synthetic-voice.mp3'),
        'x-nura-document-purpose': 'medical',
        'x-nura-consent-confirmed': 'true',
        'x-nura-audio-processing-consent': OPENAI_AUDIO_PROCESSING_CONSENT,
        'content-length': '4096',
      },
    }, (response) => {
      response.resume();
      response.on('end', () => { const status = response.statusCode; request.destroy(); resolveStatus(status); });
    });
    request.on('error', (error) => { if (!request.destroyed) reject(error); });
    request.write('partial');
    setTimeout(() => { if (!request.destroyed) { request.destroy(); reject(new Error('The fail-closed audio response waited for the unfinished request body.')); } }, 4_000).unref();
  });
  assert.equal(incompleteBodyStatus, 503, 'an unavailable audio adapter is detected before the server reads the recording');

  assert.equal(await readFile(blockedNetworkLog, 'utf8').catch(() => ''), '', 'consent checks never contact a provider');
});

test('synthetic audio intake retries failures and leaves timestamped source claims pending for user review', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-audio-review-'));
  const dataDir = join(tempDir, 'repository');
  const blockedNetworkLog = join(tempDir, 'blocked-network.log');
  const service = await startServer({ tempDir, dataDir, blockedNetworkLog, syntheticAudio: true });
  t.after(async () => { await stopServer(service.child); await rm(tempDir, { recursive: true, force: true }); });

  const sendAudio = (bytes, consent = OPENAI_AUDIO_PROCESSING_CONSENT) => fetch(`${service.baseUrl}/v1/intake/extract`, {
    method: 'POST',
    headers: {
      authorization: service.authorization,
      'content-type': 'audio/mpeg',
      'x-nura-file-name': encodeURIComponent('synthetic-voice.mp3'),
      'x-nura-document-purpose': 'medical',
      'x-nura-consent-confirmed': 'true',
      'x-nura-audio-processing-consent': consent,
    },
    body: bytes,
  });
  const syntheticAudio = Buffer.from('synthetic-fail-once');
  const failedAttempt = await sendAudio(syntheticAudio);
  assert.equal(failedAttempt.status, 200);
  const failedEvents = await failedAttempt.text();
  assert.match(failedEvents, /event: run_error/);
  const failedSourceId = JSON.parse(failedEvents.match(/event: source_received\ndata: ([^\n]+)/)?.[1] ?? '{}').sourceId;
  assert.ok(failedSourceId, 'failed processing keeps its exact source available for retry');

  const retry = await sendAudio(syntheticAudio);
  assert.equal(retry.status, 200);
  const retryEvents = await retry.text();
  const completedData = JSON.parse(retryEvents.match(/event: intake_completed\ndata: ([^\n]+)/)?.[1] ?? '{}');
  assert.equal(completedData.sourceId, failedSourceId);
  assert.equal(completedData.state, 'candidate_review');

  const sourceResponse = await fetch(`${service.baseUrl}/v1/intake/sources/${failedSourceId}/claims`, { headers: { authorization: service.authorization } });
  assert.equal(sourceResponse.status, 200);
  const { source, claims } = await sourceResponse.json();
  assert.equal(source.mediaType, 'audio/mpeg');
  assert.equal(source.processingMode, 'local_rule_based');
  assert.equal(claims.length, 3);
  const chronologicalClaims = [...claims].sort((left, right) => left.sourceLocation.timestampSeconds - right.sourceLocation.timestampSeconds);
  assert.ok(chronologicalClaims.every((claim) => claim.sourceId === source.id && claim.evidenceState === 'needs_review' && claim.acceptedAssertionId === null));
  assert.deepEqual(chronologicalClaims.map((claim) => claim.sourceLocation.timestampSeconds), [1.25, 3.1, 5.7]);
  assert.deepEqual(chronologicalClaims.map((claim) => claim.sourceLocation.quote), [
    'HbA1c was 5.8 percent',
    'total cholesterol result was 210 mg/dL',
    'vitamin D, 1000 IU daily',
  ]);

  const decide = (claimId, decision) => fetch(`${service.baseUrl}/v1/intake/claims/${claimId}/decision`, {
    method: 'POST', headers: { authorization: service.authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  const accepted = await decide(chronologicalClaims[0].id, 'accept');
  assert.equal(accepted.status, 200);
  const acceptedResult = await accepted.json();
  assert.equal(acceptedResult.claim.evidenceState, 'user_confirmed');
  assert.ok(acceptedResult.assertion?.id, 'a profile assertion appears only after explicit acceptance');

  const dismissed = await decide(chronologicalClaims[1].id, 'reject');
  assert.equal(dismissed.status, 200);
  assert.equal((await dismissed.json()).claim.evidenceState, 'rejected');

  const afterDecisions = await fetch(`${service.baseUrl}/v1/intake/sources/${failedSourceId}/claims`, { headers: { authorization: service.authorization } });
  const finalClaims = (await afterDecisions.json()).claims;
  const finalChronologicalClaims = finalClaims.sort((left, right) => left.sourceLocation.timestampSeconds - right.sourceLocation.timestampSeconds);
  assert.deepEqual(finalChronologicalClaims.map((claim) => claim.evidenceState), ['user_confirmed', 'rejected', 'needs_review']);
  assert.equal(await readFile(blockedNetworkLog, 'utf8').catch(() => ''), '', 'the synthetic review journey made no external provider requests');
});

test('configured OpenAI audio adapters run only after exact consent and save only pending timestamped suggestions', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-audio-live-adapter-'));
  const dataDir = join(tempDir, 'repository');
  const providerAudit = join(tempDir, 'provider-audit.jsonl');
  const fakeFfprobePath = join(tempDir, 'fake-ffprobe.mjs');
  await writeFile(fakeFfprobePath, '#!/usr/bin/env node\nconsole.log(JSON.stringify({ format: { duration: "8.5" }, streams: [{ codec_type: "audio", duration: "8.5" }] }));\n', { mode: 0o700 });
  await chmod(fakeFfprobePath, 0o700);
  const service = await startServer({ tempDir, dataDir, blockedNetworkLog: providerAudit, liveAudioMock: true, fakeFfprobePath });
  t.after(async () => { await stopServer(service.child); await rm(tempDir, { recursive: true, force: true }); });

  const health = await fetch(`${service.baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).capabilities.audioTranscription, true, 'the real audio adapters are advertised when enabled and configured');

  const headers = {
    authorization: service.authorization,
    'content-type': 'audio/wav',
    'x-nura-file-name': encodeURIComponent('synthetic-voice.wav'),
    'x-nura-document-purpose': 'medical',
    'x-nura-consent-confirmed': 'true',
  };
  const unapproved = await fetch(`${service.baseUrl}/v1/intake/extract`, { method: 'POST', headers, body: Buffer.from('synthetic wav bytes') });
  assert.equal(unapproved.status, 400);
  assert.equal((await unapproved.json()).error, 'audio_processing_consent_required');
  assert.equal(await readFile(providerAudit, 'utf8').catch(() => ''), '', 'broad file consent cannot trigger either OpenAI audio call');

  const approved = await fetch(`${service.baseUrl}/v1/intake/extract`, {
    method: 'POST', headers: { ...headers, 'x-nura-audio-processing-consent': OPENAI_AUDIO_PROCESSING_CONSENT }, body: Buffer.from('synthetic wav bytes'),
  });
  assert.equal(approved.status, 200);
  const events = await approved.text();
  const providerStage = JSON.parse(events.match(/event: extraction_started\ndata: ([^\n]+)/)?.[1] ?? '{}');
  assert.equal(providerStage.realProviderCall, true);
  assert.equal(providerStage.provider, 'openai_audio_transcriptions_and_responses');
  assert.match(events, /event: audio_transcription_started/);
  assert.match(events, /event: audio_suggestions_completed/);
  const completed = JSON.parse(events.match(/event: intake_completed\ndata: ([^\n]+)/)?.[1] ?? '{}');
  assert.equal(completed.state, 'candidate_review');
  const sourceResponse = await fetch(`${service.baseUrl}/v1/intake/sources/${completed.sourceId}/claims`, { headers: { authorization: service.authorization } });
  assert.equal(sourceResponse.status, 200);
  const { claims } = await sourceResponse.json();
  assert.equal(claims.length, 1);
  assert.equal(claims[0].label, 'HbA1c');
  assert.equal(claims[0].value, '5.8');
  assert.equal(claims[0].evidenceState, 'needs_review');
  assert.equal(claims[0].acceptedAssertionId, null, 'processing alone cannot write the value into the profile');
  assert.equal(claims[0].sourceLocation.timestampSeconds, 1.25);
  assert.equal(claims[0].sourceLocation.quote, 'HbA1c was 5.8 percent');

  const providerCalls = (await readFile(providerAudit, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(providerCalls.map((call) => call.url), ['https://api.openai.com/v1/audio/transcriptions', 'https://api.openai.com/v1/responses']);
  assert.equal(providerCalls[0].model, 'whisper-1');
  assert.equal(providerCalls[0].format, 'verbose_json');
  assert.equal(providerCalls[0].granularity, 'segment');
  assert.equal(providerCalls[0].hasFile, true);
  assert.equal(providerCalls[1].transcriptOnly, true, 'claim suggestion receives only timestamped transcript text, never the audio bytes');
  assert.equal(providerCalls[1].untrustedTranscriptRule, true);
  assert.equal(providerCalls[1].strictOutput, true);
});
