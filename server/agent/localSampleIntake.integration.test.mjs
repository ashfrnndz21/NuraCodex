import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processIntakeBatch } from '../../src/services/intakeBatch.mjs';
import { analyzeIntakeBatch } from '../../src/services/intakeBatchAnalysis.mjs';
import { commitReviewBatch } from '../../src/services/reviewBatch.mjs';
import { createSourceRecord, DEMO_PROFILE_ID } from '../contracts.mjs';

import { createSyntheticDemoAuthorization, fetchWithSyntheticDemoSession } from './demoTestSession.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function availablePort() {
  const listener = createTcpServer();
  await new Promise((resolveListen, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolveListen); });
  const port = listener.address().port;
  await new Promise((resolveClose, reject) => listener.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function startServer(tempDir, initialRepository) {
  const port = await availablePort();
  const denyExternal = `
    import { appendFileSync } from 'node:fs';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (typeof url === 'string' && url.startsWith('https://')) {
        appendFileSync(process.env.NURA_TEST_EXTERNAL_LOG, url + '\\n');
        throw new Error('Network is blocked during local sample verification.');
      }
      return originalFetch(input, options);
    };
  `;
  const guardPath = join(tempDir, 'deny-external.mjs');
  await writeFile(guardPath, denyExternal);
  const externalLog = join(tempDir, 'external-attempts.log');
  const dataDir = join(tempDir, 'repository');
  if (initialRepository) {
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'repository.json'), JSON.stringify(initialRepository), { mode: 0o600 });
  }
  const portEnv = String(port);
  const child = spawn(process.execPath, ['--import', guardPath, 'server/index.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      OPENAI_API_KEY: 'synthetic-test-key-never-sent',
      NURA_LLM_PROVIDER: 'openai',
      NURA_AGENT_PORT: portEnv,
      NURA_BIND_HOST: '127.0.0.1',
      NURA_DEMO_DATA_DIR: dataDir,
      NURA_ENABLE_DEMO_INTAKE: 'true',
      NURA_TEST_EXTERNAL_LOG: externalLog,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local service exited before starting: ${output}`);
    try { if ((await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(500) })).ok) { const authorization = await createSyntheticDemoAuthorization(baseUrl); return { child, baseUrl, dataDir, externalLog, authorization }; } }
    catch { /* Wait for the loopback-only service to start. */ }
    await sleep(60);
  }
  child.kill('SIGKILL');
  throw new Error(`Local service did not start: ${output}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([exited, sleep(1_000).then(() => child.kill('SIGKILL'))]);
}

function parseSse(text) {
  return [...text.matchAll(/(?:^|\n)event: ([^\n]+)\ndata: ([^\n]+)/g)].map(([, type, data]) => ({ type, data: JSON.parse(data) }));
}

test('M1 bundled sample batch uses local-only mapping, supports review/save and never contacts a provider', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-local-samples-'));
  const server = await startServer(tempDir);
  t.after(async () => { await stopServer(server.child); await rm(tempDir, { recursive: true, force: true }); });
  const files = [
    { id: 'jan', name: 'PL0005-sample-lipid-profile.pdf', fixtureId: 'lipid-panel-jan-2025' },
    { id: 'apr', name: 'EXAMPLE-lipid-follow-up.pdf', fixtureId: 'lipid-panel-apr-2025' },
  ].map((file) => ({ ...file, bytes: readFile(resolve(projectRoot, 'assets/samples', file.name)) }));
  const stagedFiles = await Promise.all(files.map(async (file) => ({ ...file, bytes: await file.bytes })));
  let consentCount = 0;
  const approvals = (() => {
    consentCount += 1;
    return new Set(stagedFiles.map((file) => file.id));
  })();
  const processFile = async (file) => {
    assert.equal(approvals.has(file.id), true, 'one explicit batch approval covers both named samples');
    const response = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/extract`, server.authorization, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-nura-file-name': encodeURIComponent(file.name),
        'x-nura-document-purpose': 'medical',
        'x-nura-consent-confirmed': 'true',
        'x-nura-local-sample-fixture': file.fixtureId,
      },
      body: file.bytes,
    });
    const events = parseSse(await response.text());
    assert.equal(response.status, 200);
    assert.equal(events.find((event) => event.type === 'intake_started')?.data.processingMode, 'local_sample_fixture');
    const extractionStart = events.find((event) => event.type === 'extraction_started');
    assert.equal(extractionStart?.data.externalProviderCall, false);
    assert.equal(extractionStart?.data.realProviderCall, undefined);
    assert.equal(extractionStart?.data.provider, undefined);
    const completed = events.find((event) => event.type === 'intake_completed');
    assert.equal(completed?.data.state, 'candidate_review');
    const sourceResponse = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/sources/${completed.data.sourceId}/claims`, server.authorization);
    const sourceBody = await sourceResponse.json();
    assert.equal(sourceBody.source.processingMode, 'local_sample_fixture');
    assert.ok(sourceBody.claims.every((claim) => claim.sourceLocation.locationConfidence === 'verified_fixture'));
    return { file, source: sourceBody.source, claims: sourceBody.claims };
  };
  const results = await processIntakeBatch(stagedFiles, processFile);
  assert.equal(consentCount, 1);
  assert.deepEqual(results.map(({ assetId, status }) => [assetId, status]), [['jan', 'complete'], ['apr', 'complete']]);
  const reviews = results.map((result) => result.value);
  assert.equal(reviews[0].claims.length, 8);
  assert.equal(reviews[1].claims.length, 5);
  assert.equal(reviews[0].claims[0].effectiveAt, '2025-01-21');
  assert.equal(reviews[1].claims[0].effectiveAt, '2025-04-22');
  assert.deepEqual(analyzeIntakeBatch(reviews.map((item) => ({ sourceId: item.source.id, sourceName: item.source.displayName, claims: item.claims, documentDates: item.source.documentContext?.dates ?? [] }))), []);

  const accepted = reviews[0].claims.find((claim) => claim.label === 'Total Cholesterol');
  const edited = reviews[1].claims.find((claim) => claim.label === 'LDL cholesterol');
  const rejected = reviews[1].claims.find((claim) => claim.label === 'Non-HDL cholesterol');
  const decisions = [
    { id: `claim:${accepted.id}`, claimId: accepted.id, decision: 'accept' },
    { id: `claim:${edited.id}`, claimId: edited.id, decision: 'edit', editedValue: { label: 'LDL cholesterol', value: '104', unit: 'mg/dL', effectiveAt: '2025-04-22' } },
    { id: `claim:${rejected.id}`, claimId: rejected.id, decision: 'reject' },
  ];
  const saved = await commitReviewBatch(decisions, async (operation) => {
    const response = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/claims/${operation.claimId}/decision`, server.authorization, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: operation.decision, ...(operation.editedValue ? { editedValue: operation.editedValue } : {}) }),
    });
    assert.equal(response.ok, true);
  });
  assert.ok(saved.every((item) => item.status === 'saved'));
  const repository = JSON.parse(await readFile(join(server.dataDir, 'repository.json'), 'utf8'));
  assert.equal(repository.assertions.length, 2, 'only the explicit accept and edit create profile assertions');
  assert.ok(repository.claims.filter((claim) => claim.evidenceState === 'needs_review').length > 0, 'unreviewed claims remain pending');
  assert.equal(repository.claims.find((claim) => claim.id === rejected.id)?.evidenceState, 'rejected');
  assert.equal(await readFile(server.externalLog, 'utf8').catch(() => ''), '', 'no external request was attempted');
  assert.equal(consentCount, 1, 'both files were processed under one approval');

  const duplicateResponse = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/extract`, server.authorization, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-nura-file-name': encodeURIComponent(stagedFiles[0].name),
      'x-nura-document-purpose': 'medical',
      'x-nura-consent-confirmed': 'true',
      'x-nura-local-sample-fixture': stagedFiles[0].fixtureId,
    },
    body: stagedFiles[0].bytes,
  });
  const duplicateEvents = parseSse(await duplicateResponse.text());
  assert.equal(duplicateEvents.find((event) => event.type === 'duplicate_detected')?.data.processingMode, 'local_sample_fixture');
  assert.equal(duplicateEvents.find((event) => event.type === 'intake_completed')?.data.processingMode, 'local_sample_fixture');
  assert.equal(duplicateEvents.some((event) => event.type === 'extraction_started'), false);

  const spoofed = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/extract`, server.authorization, {
    method: 'POST',
    headers: { 'content-type': 'application/pdf', 'x-nura-file-name': encodeURIComponent(files[0].name), 'x-nura-document-purpose': 'medical', 'x-nura-consent-confirmed': 'true', 'x-nura-local-sample-fixture': files[0].fixtureId },
    body: Buffer.from('%PDF-1.4\nnot the bundled sample\n%%EOF'),
  });
  const mismatchEvents = parseSse(await spoofed.text());
  assert.equal(mismatchEvents.find((event) => event.type === 'run_error')?.data.safeCode, 'local_sample_mismatch');
  assert.equal(mismatchEvents.find((event) => event.type === 'run_error')?.data.processingMode, 'local_sample_fixture');
  const afterMismatch = JSON.parse(await readFile(join(server.dataDir, 'repository.json'), 'utf8'));
  assert.equal(afterMismatch.sources.length, 2, 'a lookalike file is rejected before source creation');
  assert.equal(await readFile(server.externalLog, 'utf8').catch(() => ''), '', 'mismatched samples never fall through to the provider');
});

test('local sample processing will not reuse an identical source saved through a different path', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-sample-source-conflict-'));
  const filename = 'PL0005-sample-lipid-profile.pdf';
  const bytes = await readFile(resolve(projectRoot, 'assets/samples', filename));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const previousSource = createSourceRecord({
    profileId: DEMO_PROFILE_ID, displayName: filename, mediaType: 'application/pdf',
    sizeBytes: bytes.length, sha256, processingMode: 'connected_ai_provider', state: 'candidate_review',
  });
  const server = await startServer(tempDir, { schemaVersion: 1, sources: [previousSource], claims: [], assertions: [], runEvents: [] });
  t.after(async () => { await stopServer(server.child); await rm(tempDir, { recursive: true, force: true }); });

  const response = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/extract`, server.authorization, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-nura-file-name': encodeURIComponent(filename),
      'x-nura-document-purpose': 'medical',
      'x-nura-consent-confirmed': 'true',
      'x-nura-local-sample-fixture': 'lipid-panel-jan-2025',
    },
    body: bytes,
  });
  const events = parseSse(await response.text());
  const failure = events.find((event) => event.type === 'run_error');
  assert.equal(failure?.data.safeCode, 'sample_processing_conflict');
  assert.match(failure?.data.message ?? '', /already saved through another review path/);
  assert.equal(events.some((event) => event.type === 'extraction_started'), false);
  assert.equal(events.some((event) => event.type === 'duplicate_detected'), false);
  const repository = JSON.parse(await readFile(join(server.dataDir, 'repository.json'), 'utf8'));
  assert.equal(repository.sources.length, 1);
  assert.equal(repository.sources[0].processingMode, 'connected_ai_provider');
  assert.equal(await readFile(server.externalLog, 'utf8').catch(() => ''), '', 'the conflict does not fall through to a provider');
});
