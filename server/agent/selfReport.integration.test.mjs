import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serverEntry = join(projectRoot, 'server/index.mjs');
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));

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

async function startLocalServer({ dataDir, tempDir, callsFile }) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['--import', join(tempDir, 'provider-fetch-guard.mjs'), serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      OPENAI_API_KEY: 'synthetic-test-key-never-send',
      NURA_LLM_PROVIDER: 'openai',
      NURA_AGENT_PORT: String(port),
      NURA_BIND_HOST: '127.0.0.1',
      NURA_DEMO_DATA_DIR: dataDir,
      NURA_PROVIDER_CALL_LOG: callsFile,
      NURA_ENABLE_DEMO_INTAKE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  // The full repository suite runs independent test files in parallel; allow
  // the isolated server more startup time when the host is under load.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local Nura test server exited before starting: ${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(700) });
      if (response.ok) return { child, baseUrl, output: () => output };
    } catch { /* The loopback server is still starting. */ }
    await pause(100);
  }
  child.kill('SIGKILL');
  throw new Error(`Local Nura test server did not become ready: ${output}`);
}

async function stopLocalServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([exited, pause(1_500).then(() => child.kill('SIGKILL'))]);
}

async function readJson(response) {
  return response.json();
}

test('POST self-report stays local, requires per-note consent, and persists only source-linked review snippets', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-self-report-route-'));
  const dataDir = join(tempDir, 'repository');
  const callsFile = join(tempDir, 'provider-calls.log');
  const rawNote = 'My sample blood pressure is 120/80 mmHg on 2026-09-20. I sometimes notice sample dizziness after a fictional walk. The sample report mentioned a family detail that I have not clarified.';
  const deniedNote = 'Rejected fictional test text must not reach storage.';
  await writeFile(join(tempDir, 'provider-fetch-guard.mjs'), `
    import { appendFileSync } from 'node:fs';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, ...rest) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (typeof url === 'string' && url.startsWith('https://api.openai.com/')) {
        appendFileSync(process.env.NURA_PROVIDER_CALL_LOG, url + '\\n');
        throw new Error('Network call blocked by self-report integration test');
      }
      return originalFetch(input, ...rest);
    };
  `);

  const server = await startLocalServer({ dataDir, tempDir, callsFile });
  t.after(async () => { await stopLocalServer(server.child); await rm(tempDir, { recursive: true, force: true }); });

  const denied = await fetch(`${server.baseUrl}/v1/intake/self-report`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ consentForThisNote: false, syntheticDemoConfirmed: true, noteId: 'note-consent-denied', text: deniedNote }),
  });
  assert.equal(denied.status, 400);
  assert.match((await readJson(denied)).message, /Approve this one description/);

  const accepted = await fetch(`${server.baseUrl}/v1/intake/self-report`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      consentForThisNote: true, syntheticDemoConfirmed: true, noteId: 'note-synthetic-01',
      text: rawNote, topic: { id: 'blood-pressure', label: 'Blood pressure' },
    }),
  });
  assert.equal(accepted.status, 200, server.output());
  const response = await readJson(accepted);
  assert.equal(response.mode, 'local_demo_synthetic_only');
  assert.equal(response.source.origin, 'user_entered');
  assert.equal(response.source.state, 'candidate_review');
  assert.equal(response.claims.length, 2);
  assert.ok(response.claims.every((claim) => claim.sourceId === response.source.id));
  assert.ok(response.claims.every((claim) => claim.evidenceState === 'needs_review'));
  assert.ok(response.claims.every((claim) => claim.sourceLocation.quote && rawNote.includes(claim.sourceLocation.quote)));

  const reopened = await fetch(`${server.baseUrl}/v1/intake/sources/${encodeURIComponent(response.source.id)}/claims`);
  assert.equal(reopened.status, 200);
  const reopenedBody = await readJson(reopened);
  assert.equal(reopenedBody.source.id, response.source.id);
  assert.equal(reopenedBody.claims.length, 2);
  assert.ok(reopenedBody.claims.every((claim) => claim.evidenceState === 'needs_review'));

  const repositoryText = await readFile(join(dataDir, 'repository.json'), 'utf8');
  const repository = JSON.parse(repositoryText);
  assert.equal(repository.sources.length, 1, 'the rejected note must not have created a source');
  assert.equal(repository.claims.length, 2);
  assert.ok(!repositoryText.includes(rawNote), 'the complete description must not be persisted');
  assert.ok(!repositoryText.includes(deniedNote), 'a note rejected for missing consent must not be persisted');
  assert.ok(repositoryText.includes('unresolved_self_report'), 'the source keeps an explicit unresolved-passage marker');
  assert.ok(repository.sources[0].documentContext.notes.some((note) => note.kind === 'unresolved_self_report' && note.quote && rawNote.includes(note.quote)));
  assert.ok(repository.runEvents.every((event) => !JSON.stringify(event).includes(rawNote)), 'persisted events must not contain the description');

  await assert.rejects(readFile(callsFile, 'utf8'), { code: 'ENOENT' }, 'the route must not attempt an OpenAI request even when a test key is configured');
});

test('POST self-report returns a generic failure and leaves no note behind when repository storage is unavailable', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-self-report-failure-'));
  const blockedDataPath = join(tempDir, 'data-is-a-file');
  const marker = 'synthetic-storage-fixture';
  const callsFile = join(tempDir, 'provider-calls.log');
  const failedNote = 'Fictional phrase that must never survive a failed local write.';
  await writeFile(blockedDataPath, marker);
  await writeFile(join(tempDir, 'provider-fetch-guard.mjs'), `
    import { appendFileSync } from 'node:fs';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, ...rest) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (typeof url === 'string' && url.startsWith('https://api.openai.com/')) {
        appendFileSync(process.env.NURA_PROVIDER_CALL_LOG, url + '\\n');
        throw new Error('Network call blocked by self-report integration test');
      }
      return originalFetch(input, ...rest);
    };
  `);

  const server = await startLocalServer({ dataDir: blockedDataPath, tempDir, callsFile });
  t.after(async () => { await stopLocalServer(server.child); await rm(tempDir, { recursive: true, force: true }); });
  const failed = await fetch(`${server.baseUrl}/v1/intake/self-report`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ consentForThisNote: true, syntheticDemoConfirmed: true, noteId: 'note-storage-failure', text: failedNote }),
  });
  assert.equal(failed.status, 500);
  const failureBody = await readJson(failed);
  assert.equal(failureBody.message, 'This description could not be organized. Your saved profile was not changed.');
  assert.ok(!JSON.stringify(failureBody).includes(failedNote), 'server errors must not echo the submitted description');
  assert.equal(await readFile(blockedDataPath, 'utf8'), marker);
  assert.deepEqual((await readdir(tempDir)).filter((name) => name.endsWith('.tmp')), []);
  await assert.rejects(readFile(callsFile, 'utf8'), { code: 'ENOENT' }, 'failed local storage must not trigger a provider request');
});
