import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewIdentityInstructions } from '../../src/services/previewIdentity.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serverEntry = join(projectRoot, 'server/index.mjs');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

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

async function startServer(dataDir) {
  const port = await availablePort();
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OPENAI_API_KEY: '',
      NURA_LLM_PROVIDER: 'openai',
      NURA_AGENT_PORT: String(port),
      NURA_BIND_HOST: '127.0.0.1',
      NURA_DEMO_DATA_DIR: dataDir,
      NURA_ALLOWED_ORIGINS: 'http://localhost:8094',
      NURA_ENABLE_DEMO_INTAKE: 'true',
      NURA_HEALTH_SEARCH_ENABLED: 'false',
      NURA_ENABLE_DEMO_WEB_SEARCH: 'false',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Local privacy test service exited: ' + stderr);
    try {
      const response = await fetch(baseUrl + '/healthz', { signal: AbortSignal.timeout(500) });
      if (response.ok) return { child, baseUrl, stderr: () => stderr };
    } catch { /* wait for the isolated local server */ }
    await pause(40);
  }
  child.kill('SIGKILL');
  throw new Error('Local privacy test service did not start: ' + stderr);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([exited, pause(1_500).then(() => child.kill('SIGKILL'))]);
}

const sampleSignIn = () => ({
  channel: 'email',
  destination: previewIdentityInstructions.email,
  code: previewIdentityInstructions.code,
});

test('privacy choices are durable, purpose-scoped and enforced before AI or search processing', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-privacy-boundary-'));
  const dataDir = join(tempDir, 'repository');
  const server = await startServer(dataDir);
  t.after(async () => {
    await stopServer(server.child);
    await rm(tempDir, { recursive: true, force: true });
  });

  assert.equal((await fetch(server.baseUrl + '/v1/privacy/consent-preferences')).status, 401, 'preference routes require a verified preview session');
  const signIn = await fetch(server.baseUrl + '/v1/demo/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sampleSignIn()),
  });
  assert.equal(signIn.status, 201);
  const { accessToken } = await signIn.json();
  const authorization = `Bearer ${accessToken}`;
  const authHeaders = { authorization };

  const initial = await fetch(server.baseUrl + '/v1/privacy/consent-preferences', { headers: authHeaders });
  assert.equal(initial.status, 200);
  const initialState = await initial.json();
  assert.equal(initialState.settings.aiProcessing, true);
  assert.equal(initialState.settings.publicHealthSearch, true);
  assert.deepEqual(initialState.events, [], 'default choices create no fabricated consent history');

  const searchOff = await fetch(server.baseUrl + '/v1/privacy/consent-preferences', {
    method: 'PUT',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ aiProcessing: true, publicHealthSearch: false }),
  });
  assert.equal(searchOff.status, 200);
  const searchState = await searchOff.json();
  assert.equal(searchState.settings.aiProcessing, true, 'withdrawing search leaves Ask enabled');
  assert.equal(searchState.settings.publicHealthSearch, false);
  assert.equal('profileId' in searchState.events[0], false, 'the API does not expose internal profile identifiers');

  const feed = await fetch(server.baseUrl + '/v1/health/feed', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ consentConfirmed: true, topics: [{ id: 'cholesterol', label: 'Cholesterol' }] }),
  });
  assert.equal(feed.status, 409, 'a withdrawn search purpose is denied before feed work starts');
  assert.equal((await feed.json()).error, 'consent_withdrawn');

  const searchAsk = await fetch(server.baseUrl + '/v1/agent/runs', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Explain this synthetic record.', consentConfirmed: true, externalSearchConsent: true }),
  });
  assert.equal(searchAsk.status, 409, 'Ask cannot smuggle a withdrawn web search into another run');
  assert.equal((await searchAsk.json()).purpose, 'public_health_search');
  const localAsk = await fetch(server.baseUrl + '/v1/agent/runs', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Explain this synthetic record.', consentConfirmed: true, externalSearchConsent: false }),
  });
  assert.equal(localAsk.status, 503, 'Ask without external search remains available while its provider is unconfigured');

  const aiOff = await fetch(server.baseUrl + '/v1/privacy/consent-preferences', {
    method: 'PUT',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ aiProcessing: false, publicHealthSearch: false }),
  });
  assert.equal(aiOff.status, 200);
  const withdrawnState = await aiOff.json();
  assert.equal(withdrawnState.events.length, 2, 'each explicit settings change records a purpose-scoped audit event');

  const searchOnlyOn = await fetch(server.baseUrl + '/v1/privacy/consent-preferences', {
    method: 'PUT',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ aiProcessing: false, publicHealthSearch: true, consentConfirmed: true, policyVersion: initialState.policyVersion }),
  });
  assert.equal(searchOnlyOn.status, 200, 'public search can be enabled without re-enabling AI processing');
  const searchOnlyState = await searchOnlyOn.json();
  assert.equal(searchOnlyState.settings.aiProcessing, false);
  assert.equal(searchOnlyState.settings.publicHealthSearch, true);
  const feedWithoutAi = await fetch(server.baseUrl + '/v1/health/feed', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ consentConfirmed: true, topics: [{ id: 'cholesterol', label: 'Cholesterol' }] }),
  });
  assert.equal(feedWithoutAi.status, 503, 'the feed reached its disabled local search provider instead of being blocked by the separate AI preference');
  assert.equal((await feedWithoutAi.json()).error, 'search_disabled');

  const deniedAsk = await fetch(server.baseUrl + '/v1/agent/runs', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Explain this synthetic record.', consentConfirmed: true, externalSearchConsent: false }),
  });
  assert.equal(deniedAsk.status, 409, 'withdrawal stops Ask before provider work');
  assert.equal((await deniedAsk.json()).purpose, 'ai_processing');
  const deniedUpload = await fetch(server.baseUrl + '/v1/intake/extract', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/pdf', 'x-nura-document-purpose': 'medical' },
  });
  assert.equal(deniedUpload.status, 409, 'withdrawal stops regular file reading before upload bytes are consumed');

  const staleReenable = await fetch(server.baseUrl + '/v1/privacy/consent-preferences', {
    method: 'PUT',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ aiProcessing: true, publicHealthSearch: false }),
  });
  assert.equal(staleReenable.status, 409, 'reenabling requires a deliberate confirmation');
  const reenabled = await fetch(server.baseUrl + '/v1/privacy/consent-preferences', {
    method: 'PUT',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ aiProcessing: true, publicHealthSearch: false, consentConfirmed: true, policyVersion: initialState.policyVersion }),
  });
  assert.equal(reenabled.status, 200, 'the current policy can be explicitly reconfirmed');

  const turnAiOffAgain = await fetch(server.baseUrl + '/v1/privacy/consent-preferences', {
    method: 'PUT',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ aiProcessing: false, publicHealthSearch: false }),
  });
  assert.equal(turnAiOffAgain.status, 200);
  const sampleBytes = await readFile(join(projectRoot, 'assets/samples/PL0005-sample-lipid-profile.pdf'));
  const localFixture = await fetch(server.baseUrl + '/v1/intake/extract', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/pdf',
      'x-nura-file-name': 'PL0005-sample-lipid-profile.pdf',
      'x-nura-consent-confirmed': 'true',
      'x-nura-document-purpose': 'medical',
      'x-nura-local-sample-fixture': 'lipid-panel-jan-2025',
      accept: 'text/event-stream',
    },
    body: sampleBytes,
  });
  assert.equal(localFixture.status, 200, 'the exact built-in fictional sample remains usable without an AI provider');
  const sampleEvents = await localFixture.text();
  assert.match(sampleEvents, /claims_ready_for_review/);
  assert.match(sampleEvents, /intake_completed/);

  const after = await fetch(server.baseUrl + '/v1/privacy/consent-preferences', { headers: authHeaders });
  const persisted = await after.json();
  assert.equal(persisted.settings.aiProcessing, false, 'the withdrawn choice remains persisted after local sample work');
  assert.equal(persisted.events.length, 6, 'the audit log retains all explicit purpose changes, including public-search-only consent');
});
