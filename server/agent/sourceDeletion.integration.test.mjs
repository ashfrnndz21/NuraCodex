import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewIdentityInstructions } from '../../src/services/previewIdentity.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serverEntry = join(projectRoot, 'server/index.mjs');
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));

async function availablePort() {
  const listener = await import('node:net').then(({ createServer }) => createServer());
  await new Promise((resolveListen, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolveListen); });
  const port = listener.address().port;
  await new Promise((resolveClose, reject) => listener.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function startServer(dataDir) {
  const port = await availablePort();
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env, NODE_ENV: 'test', OPENAI_API_KEY: '', NURA_LLM_PROVIDER: 'openai',
      NURA_AGENT_PORT: String(port), NURA_BIND_HOST: '127.0.0.1', NURA_DEMO_DATA_DIR: dataDir,
      NURA_ALLOWED_ORIGINS: 'http://localhost:8094', NURA_ENABLE_DEMO_INTAKE: 'true', NURA_HEALTH_SEARCH_ENABLED: 'false',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Source-deletion test service exited: ${stderr}`);
    try {
      if ((await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(500) })).ok) return { child, baseUrl };
    } catch { /* wait for the local test service */ }
    await pause(40);
  }
  child.kill('SIGKILL');
  throw new Error(`Source-deletion test service did not start: ${stderr}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([exited, pause(1_500).then(() => child.kill('SIGKILL'))]);
}

async function signIn(baseUrl) {
  const response = await fetch(`${baseUrl}/v1/demo/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'email', destination: previewIdentityInstructions.email, code: previewIdentityInstructions.code }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  return { authorization: `Bearer ${body.accessToken}` };
}

async function addReviewedSource(baseUrl, authorization, noteId, text) {
  const created = await fetch(`${baseUrl}/v1/intake/self-report`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization },
    body: JSON.stringify({ consentForThisNote: true, noteId, text }),
  });
  assert.equal(created.status, 200);
  const source = await created.json();
  const claim = source.claims[0];
  assert.ok(claim);
  const accepted = await fetch(`${baseUrl}/v1/intake/claims/${claim.id}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization },
    body: JSON.stringify({ decision: 'accept' }),
  });
  assert.equal(accepted.status, 200);
  return source.source;
}

test('one authorized source removal clears its persisted source, claims and assertions, preserves another source, and survives reload', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nura-source-delete-e2e-'));
  const dataDir = join(root, 'repository');
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'repository.json'), JSON.stringify({
    schemaVersion: 1,
    sources: [{ id: 'foreign-source', profileId: 'another-person', displayName: 'private.pdf', mediaType: 'application/pdf', sizeBytes: 1, sha256: '0'.repeat(64), state: 'accepted', importedAt: '2026-10-01T00:00:00.000Z', storage: 'device_original_only' }],
    claims: [], assertions: [], runEvents: [], privacyConsentSettings: [], privacyConsentEvents: [],
  }));
  let service = await startServer(dataDir);
  t.after(async () => { await stopServer(service.child); await rm(root, { recursive: true, force: true }); });

  const firstSession = await signIn(service.baseUrl);
  const crossProfileDelete = await fetch(`${service.baseUrl}/v1/intake/sources/foreign-source`, { method: 'DELETE', headers: firstSession });
  assert.equal(crossProfileDelete.status, 404, 'a valid session for one profile cannot delete another profile’s source');
  assert.equal(JSON.parse(await readFile(join(dataDir, 'repository.json'), 'utf8')).sources.some((source) => source.id === 'foreign-source'), true);
  const target = await addReviewedSource(service.baseUrl, firstSession.authorization, 'source-a-note', 'My fictional glucose was 5.2 mmol/L on 2026-10-01.');
  const retained = await addReviewedSource(service.baseUrl, firstSession.authorization, 'source-b-note', 'My fictional cholesterol was 4.1 mmol/L on 2026-10-02.');
  const targetClaims = await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}/claims`, { headers: firstSession });
  assert.equal(targetClaims.status, 200);
  const targetBody = await targetClaims.json();
  assert.equal(targetBody.claims.length, 1);
  assert.ok(targetBody.claims[0].acceptedAssertionId);

  const unauthenticated = await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}`, { method: 'DELETE' });
  assert.equal(unauthenticated.status, 401);
  await fetch(`${service.baseUrl}/v1/demo/session`, { method: 'DELETE', headers: firstSession });
  const staleDelete = await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}`, { method: 'DELETE', headers: firstSession });
  assert.equal(staleDelete.status, 401, 'a signed-out session cannot delete its former profile data');

  const active = await signIn(service.baseUrl);
  assert.equal((await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}/claims`, { headers: active })).status, 200, 'the denied attempt did not delete the source');
  const removed = await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}`, { method: 'DELETE', headers: active });
  assert.equal(removed.status, 200);
  const removedBody = await removed.json();
  assert.deepEqual(removedBody.removed, { source: 1, claims: 1, assertions: 1, activityEvents: 2 });
  assert.deepEqual(removedBody.claimIds, [targetBody.claims[0].id]);
  assert.deepEqual(removedBody.assertionIds, [targetBody.claims[0].acceptedAssertionId]);
  assert.equal(removedBody.alreadyRemoved, false);
  const retry = await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}`, { method: 'DELETE', headers: active });
  assert.equal(retry.status, 200);
  const retryBody = await retry.json();
  assert.equal(retryBody.alreadyRemoved, true, 'an authenticated retry is an idempotent no-op');
  assert.deepEqual(retryBody.claimIds, removedBody.claimIds, 'retries retain the identifiers needed to finish app-side cleanup');
  assert.deepEqual(retryBody.assertionIds, removedBody.assertionIds);
  assert.deepEqual(retryBody.removed, { source: 0, claims: 0, assertions: 0, activityEvents: 0 });
  assert.equal((await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}/claims`, { headers: active })).status, 404);
  assert.equal((await fetch(`${service.baseUrl}/v1/intake/sources/${retained.id}/claims`, { headers: active })).status, 200);

  await stopServer(service.child);
  service = await startServer(dataDir);
  const afterReload = await signIn(service.baseUrl);
  assert.equal((await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}/claims`, { headers: afterReload })).status, 404);
  assert.equal((await fetch(`${service.baseUrl}/v1/intake/sources/${retained.id}/claims`, { headers: afterReload })).status, 200);
  const postRestartRetry = await fetch(`${service.baseUrl}/v1/intake/sources/${target.id}`, { method: 'DELETE', headers: afterReload });
  assert.equal(postRestartRetry.status, 200);
  const postRestartRetryBody = await postRestartRetry.json();
  assert.equal(postRestartRetryBody.alreadyRemoved, true);
  assert.deepEqual(postRestartRetryBody.claimIds, removedBody.claimIds, 'the local deletion receipt survives a service restart');
  assert.deepEqual(postRestartRetryBody.assertionIds, removedBody.assertionIds);
  const persisted = JSON.parse(await readFile(join(dataDir, 'repository.json'), 'utf8'));
  assert.equal(persisted.sources.some((source) => source.id === target.id), false);
  assert.equal(persisted.claims.some((claim) => claim.sourceId === target.id), false);
  assert.equal(persisted.assertions.some((assertion) => assertion.sourceId === target.id), false);
  assert.equal(persisted.sources.some((source) => source.id === retained.id), true);
  assert.equal(persisted.claims.some((claim) => claim.sourceId === retained.id), true);
  assert.equal(persisted.assertions.some((assertion) => assertion.sourceId === retained.id), true);
});
