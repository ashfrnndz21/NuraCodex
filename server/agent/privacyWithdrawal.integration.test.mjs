import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyntheticDemoAuthorization, fetchWithSyntheticDemoSession } from './demoTestSession.mjs';

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

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await pause(15);
  }
  throw new Error(message);
}

async function startServer(tempDir) {
  const port = await availablePort();
  const dataDir = join(tempDir, 'repository');
  const providerLog = join(tempDir, 'provider-events.jsonl');
  const releaseFile = join(tempDir, 'release-provider-response');
  const mockPath = join(tempDir, 'synthetic-provider.mjs');
  await writeFile(mockPath, `
    import { appendFileSync, existsSync } from 'node:fs';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options = {}) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (url === 'https://api.openai.com/v1/responses') {
        const signal = options.signal;
        appendFileSync(process.env.NURA_WITHDRAWAL_PROVIDER_LOG, JSON.stringify({ event: 'started', signalPresent: Boolean(signal) }) + '\\n');
        signal?.addEventListener('abort', () => appendFileSync(process.env.NURA_WITHDRAWAL_PROVIDER_LOG, JSON.stringify({ event: 'aborted' }) + '\\n'), { once: true });
        while (!existsSync(process.env.NURA_WITHDRAWAL_RELEASE_FILE)) await new Promise((resolve) => setTimeout(resolve, 10));
        appendFileSync(process.env.NURA_WITHDRAWAL_PROVIDER_LOG, JSON.stringify({ event: 'late_response_after_abort', signalAborted: Boolean(signal?.aborted) }) + '\\n');
        const output = {
          claims: [{ kind: 'measurement', label: 'Total cholesterol', value: '7.1', unit: 'mmol/L', referenceRange: null, method: null, effectiveAt: '2026-10-05', confidence: 0.95, page: 1, quote: 'Total cholesterol 7.1 mmol/L' }],
          documentContext: { documentType: 'Synthetic test report', dates: [], entities: [], notes: [] },
        };
        // Deliberately ignore the aborted signal and return a late result to
        // prove the application boundary still suppresses it and rejects commit.
        return new Response(JSON.stringify({ output_text: JSON.stringify(output) }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (typeof url === 'string' && url.startsWith('https://')) throw new Error('Unexpected external network request in withdrawal test.');
      return originalFetch(input, options);
    };
  `);
  const child = spawn(process.execPath, ['--import', mockPath, serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'synthetic-test-key-never-send',
      NURA_LLM_PROVIDER: 'openai',
      NURA_AGENT_PORT: String(port),
      NURA_BIND_HOST: '127.0.0.1',
      NURA_DEMO_DATA_DIR: dataDir,
      NURA_WITHDRAWAL_PROVIDER_LOG: providerLog,
      NURA_WITHDRAWAL_RELEASE_FILE: releaseFile,
      NURA_ENABLE_DEMO_INTAKE: 'true',
      NURA_ALLOWED_ORIGINS: 'http://localhost:8094',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Withdrawal test service exited: ${stderr}`);
    try {
      if ((await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(500) })).ok) {
        const authorization = await createSyntheticDemoAuthorization(baseUrl);
        return { child, baseUrl, authorization, dataDir, providerLog, releaseFile };
      }
    } catch { /* Wait for the isolated loopback-only service. */ }
    await pause(40);
  }
  child.kill('SIGKILL');
  throw new Error(`Withdrawal test service did not start: ${stderr}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([exited, pause(1_500).then(() => child.kill('SIGKILL'))]);
}

function providerEvents(providerLog) {
  return readFile(providerLog, 'utf8').then((text) => text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))).catch(() => []);
}

test('withdrawing processing consent aborts active extraction and blocks late stream, commit, and retry', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-withdrawal-'));
  const server = await startServer(tempDir);
  t.after(async () => {
    await writeFile(server.releaseFile, 'release').catch(() => {});
    await stopServer(server.child);
    await rm(tempDir, { recursive: true, force: true });
  });

  const upload = fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/extract`, server.authorization, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-nura-file-name': encodeURIComponent('synthetic-withdrawal-report.pdf'),
      'x-nura-document-purpose': 'medical',
      'x-nura-consent-confirmed': 'true',
      accept: 'text/event-stream',
    },
    body: Buffer.from('%PDF-1.4\nSynthetic test report · fictional value\n%%EOF'),
  });
  await waitFor(async () => (await providerEvents(server.providerLog)).some((event) => event.event === 'started'), 'The synthetic extraction did not reach the provider boundary.');

  const withdrawal = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/privacy/consent-preferences`, server.authorization, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ aiProcessing: false, publicHealthSearch: true }),
  });
  assert.equal(withdrawal.status, 200);
  await waitFor(async () => (await providerEvents(server.providerLog)).some((event) => event.event === 'aborted'), 'Consent withdrawal did not abort the active provider signal.');

  await writeFile(server.releaseFile, 'release');
  const response = await upload;
  assert.equal(response.status, 200);
  const stream = await response.text();
  assert.doesNotMatch(stream, /claims_ready_for_review|extraction_completed|intake_completed/, 'a provider that returns after abort cannot stream extracted results');

  const repository = JSON.parse(await readFile(join(server.dataDir, 'repository.json'), 'utf8'));
  assert.deepEqual(repository.claims, [], 'late extracted claims are not committed to the local profile');
  assert.deepEqual(repository.assertions, [], 'late extraction creates no accepted assertion');
  assert.equal(repository.sources[0]?.state, 'failed', 'the interrupted source does not remain available as successfully extracted');
  assert.ok((await providerEvents(server.providerLog)).some((event) => event.event === 'late_response_after_abort' && event.signalAborted), 'the fixture returned a late result despite observing abort');

  const retry = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/extract`, server.authorization, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-nura-file-name': encodeURIComponent('synthetic-withdrawal-retry.pdf'),
      'x-nura-document-purpose': 'medical',
      'x-nura-consent-confirmed': 'true',
    },
    body: Buffer.from('%PDF-1.4\nSynthetic retry\n%%EOF'),
  });
  assert.equal(retry.status, 409, 'future provider-backed file processing remains denied after withdrawal');
  assert.equal((await retry.json()).error, 'consent_withdrawn');
  assert.equal((await providerEvents(server.providerLog)).filter((event) => event.event === 'started').length, 1, 'the denied retry never reaches the provider');
});
