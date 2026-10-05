import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewIdentityInstructions } from '../../src/services/previewIdentity.mjs';
import { DEMO_PROFILE_ID } from '../contracts.mjs';

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
      NURA_TEST_DEMO_SESSION_TTL_MS: '2500',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const baseUrl = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Local session test service exited: ' + stderr);
    try {
      const response = await fetch(baseUrl + '/healthz', { signal: AbortSignal.timeout(500) });
      if (response.ok) return { child, baseUrl, stderr: () => stderr };
    } catch { /* wait for the isolated local server */ }
    await pause(40);
  }
  child.kill('SIGKILL');
  throw new Error('Local session test service did not start: ' + stderr);
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

test('local API requires an expiring synthetic server session and denies replay after sign-out', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-session-boundary-'));
  const server = await startServer(join(tempDir, 'repository'));
  t.after(async () => {
    await stopServer(server.child);
    await rm(tempDir, { recursive: true, force: true });
  });

  assert.equal((await fetch(server.baseUrl + '/healthz')).status, 200, 'health stays public');
  assert.equal((await fetch(server.baseUrl + '/v1/demo/session')).status, 401, 'session validation requires a token');
  const deniedWrite = await fetch(server.baseUrl + '/v1/intake/self-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      consentForThisNote: true,
      noteId: 'unauthenticated-note',
      text: 'Synthetic note must not be stored.',
    }),
  });
  assert.equal(deniedWrite.status, 401, 'a protected write is denied before processing');
  const withAuthorization = (authorization, headers = {}) => authorization ? { ...headers, authorization } : headers;
  const protectedRequests = [
    (authorization) => fetch(server.baseUrl + '/v1/intake/sources/synthetic-source/claims', { headers: withAuthorization(authorization) }),
    (authorization) => fetch(server.baseUrl + '/v1/health/feed', { method: 'POST', headers: withAuthorization(authorization, { 'content-type': 'application/json' }), body: '{}' }),
    (authorization) => fetch(server.baseUrl + '/v1/intake/extract', { method: 'POST', headers: withAuthorization(authorization, { 'content-type': 'application/pdf', 'x-nura-consent-confirmed': 'true' }), body: 'synthetic' }),
    (authorization) => fetch(server.baseUrl + '/v1/demo/profile', { method: 'DELETE', headers: withAuthorization(authorization) }),
    (authorization) => fetch(server.baseUrl + '/v1/intake/claims/synthetic-claim/decision', { method: 'POST', headers: withAuthorization(authorization, { 'content-type': 'application/json' }), body: '{}' }),
    (authorization) => fetch(server.baseUrl + '/v1/intake/claims/synthetic-claim/correction', { method: 'POST', headers: withAuthorization(authorization, { 'content-type': 'application/json' }), body: '{}' }),
    (authorization) => fetch(server.baseUrl + '/v1/intake/claims/synthetic-claim/retraction', { method: 'POST', headers: withAuthorization(authorization, { 'content-type': 'application/json' }), body: '{}' }),
    (authorization) => fetch(server.baseUrl + '/v1/agent/runs', { method: 'POST', headers: withAuthorization(authorization, { 'content-type': 'application/json' }), body: '{}' }),
  ];
  for (const authorization of [undefined, `Bearer ${'A'.repeat(48)}`]) {
    const results = await Promise.all(protectedRequests.map((request) => request(authorization)));
    assert.deepEqual(results.map((response) => response.status), Array(protectedRequests.length).fill(401), authorization ? 'every protected route rejects an unissued bearer token' : 'every protected route family rejects missing credentials');
  }
  const fabricatedToken = await fetch(server.baseUrl + '/v1/demo/session', { headers: { authorization: `Bearer ${'A'.repeat(48)}` } });
  assert.equal(fabricatedToken.status, 401, 'a well-formed but unissued token is denied');

  const invalid = await fetch(server.baseUrl + '/v1/demo/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...sampleSignIn(), code: '000000' }),
  });
  assert.equal(invalid.status, 401, 'a wrong preview code is denied');

  const issued = await fetch(server.baseUrl + '/v1/demo/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sampleSignIn()),
  });
  assert.equal(issued.status, 201);
  const issuedBody = await issued.json();
  assert.equal(issuedBody.mode, 'synthetic_demo_session');
  assert.match(issuedBody.accessToken, /^[A-Za-z0-9_-]{40,256}$/);
  assert.equal(Date.parse(issuedBody.expiresAt) > Date.now(), true);
  const auth = { authorization: 'Bearer ' + issuedBody.accessToken };

  assert.equal((await fetch(server.baseUrl + '/v1/demo/session', { headers: auth })).status, 200);
  const accepted = await fetch(server.baseUrl + '/v1/intake/self-report', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      consentForThisNote: true,
      noteId: 'authorized-note',
      text: 'My fictional blood pressure was 120/80 mmHg on 2026-09-20.',
      topic: { id: 'blood-pressure', label: 'Blood pressure' },
      profileId: 'synthetic-foreign-profile',
    }),
  });
  assert.equal(accepted.status, 400, 'the request cannot select a profile by adding a client-controlled profile ID');
  const acceptedRetry = await fetch(server.baseUrl + '/v1/intake/self-report', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      consentForThisNote: true,
      noteId: 'authorized-note',
      text: 'My fictional blood pressure was 120/80 mmHg on 2026-09-20.',
      topic: { id: 'blood-pressure', label: 'Blood pressure' },
    }),
  });
  assert.equal(acceptedRetry.status, 200);
  const acceptedBody = await acceptedRetry.json();
  assert.equal(acceptedBody.source.profileId, DEMO_PROFILE_ID, 'the server selects the synthetic profile');

  const preflight = await fetch(server.baseUrl + '/v1/intake/self-report', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:8094',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /authorization/i);

  const revoked = await fetch(server.baseUrl + '/v1/demo/session', { method: 'DELETE', headers: auth });
  assert.deepEqual(await revoked.json(), { revoked: true, mode: 'synthetic_demo_session' });
  assert.equal((await fetch(server.baseUrl + '/v1/demo/session', { headers: auth })).status, 401);
  assert.equal((await fetch(server.baseUrl + '/v1/intake/sources/' + encodeURIComponent(acceptedBody.source.id) + '/claims', { headers: auth })).status, 401);

  const expiring = await fetch(server.baseUrl + '/v1/demo/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sampleSignIn()),
  });
  assert.equal(expiring.status, 201);
  const expiringBody = await expiring.json();
  const expiringAuth = { authorization: 'Bearer ' + expiringBody.accessToken };
  assert.equal((await fetch(server.baseUrl + '/v1/demo/session', { headers: expiringAuth })).status, 200, 'a newly issued session is accepted');
  await pause(Math.max(0, Date.parse(expiringBody.expiresAt) - Date.now() + 30));
  assert.equal((await fetch(server.baseUrl + '/v1/demo/session', { headers: expiringAuth })).status, 401, 'the HTTP session boundary rejects an expired session');
  assert.equal((await fetch(server.baseUrl + '/v1/demo/profile', { method: 'DELETE', headers: expiringAuth })).status, 401, 'an expired session cannot access protected profile data');
});
