import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyntheticDemoAuthorization, fetchWithSyntheticDemoSession } from './demoTestSession.mjs';

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

async function startServer({ dataDir, adapterPath, externalLog, interceptedLog }) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['--import', adapterPath, serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      OPENAI_API_KEY: 'synthetic-test-key-never-send',
      NURA_LLM_PROVIDER: 'openai',
      NURA_AGENT_PORT: String(port),
      NURA_BIND_HOST: '127.0.0.1',
      NURA_DEMO_DATA_DIR: dataDir,
      NURA_EXTERNAL_ATTEMPT_LOG: externalLog,
      NURA_SYNTHETIC_INTERCEPT_LOG: interceptedLog,
      NURA_ENABLE_DEMO_INTAKE: 'true',
      NURA_HEALTH_SEARCH_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Synthetic Ask service exited before starting: ${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return { child, baseUrl, output: () => output, authorization: await createSyntheticDemoAuthorization(baseUrl) };
    } catch { /* Wait while the isolated loopback service starts. */ }
    await pause(50);
  }
  child.kill('SIGKILL');
  throw new Error(`Synthetic Ask service did not start: ${output}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([exited, pause(1_500).then(() => child.kill('SIGKILL'))]);
}

function parseSse(text) {
  return [...text.matchAll(/(?:^|\n)event: ([^\n]+)\ndata: ([^\n]+)/g)].map(([, type, data]) => ({ type, data: JSON.parse(data) }));
}

test('Ask joins selected health and reviewed policy evidence with visible trace, exact citations, unknowns and a safe next step', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-ask-coverage-'));
  const dataDir = join(tempDir, 'repository');
  const adapterPath = join(tempDir, 'synthetic-model-adapter.mjs');
  const externalLog = join(tempDir, 'blocked-external-requests.log');
  const interceptedPath = join(tempDir, 'synthetic-adapter-requests.jsonl');
  await writeFile(adapterPath, `
    import { appendFileSync } from 'node:fs';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options = {}) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (url === 'https://api.openai.com/v1/responses') {
        const request = JSON.parse(options.body);
        const firstSearch = request.tool_choice?.type === 'function' && request.tool_choice?.name === 'search_profile';
        if (firstSearch) return new Response(JSON.stringify({ output: [{
          type: 'function_call', call_id: 'synthetic-profile-search', name: 'search_profile',
          arguments: JSON.stringify({ query: 'cholesterol blood test outpatient diagnostic coverage' }),
        }] }), { status: 200, headers: { 'content-type': 'application/json' } });
        const searchCall = request.input.find((item) => item.type === 'function_call_output');
        const search = searchCall ? JSON.parse(searchCall.output) : { results: [] };
        const health = search.results.find((item) => item.title === 'LDL cholesterol');
        const policy = search.results.find((item) => item.title === 'Outpatient diagnostic test limit');
        if (!health || !policy) throw new Error('Synthetic fixture did not retrieve both expected source records.');
        const answer = {
          answer: 'The reviewed schedule says outpatient diagnostic tests are covered up to MYR 1,000 per policy year. That is the wording available for your question; the schedule does not show whether this specific test meets its conditions.',
          citations: [policy.reference, health.reference],
          meaning: { text: '', citations: [] },
          unknowns: ['The reviewed wording does not say whether this cholesterol test meets eligibility rules or requires prior approval.'],
          nextSteps: ['Ask the insurer whether this test is eligible and whether pre-approval is required.'],
          coverageAssessments: [{
            kind: 'explicit_limit', policyReference: policy.reference,
            detail: 'Outpatient diagnostic tests are covered up to MYR 1,000 per policy year.',
            relatedHealthReferences: [health.reference],
          }],
          memoryProposal: { proposed: false, label: '', value: '', reason: '', sourceReferences: [] },
        };
        appendFileSync(process.env.NURA_SYNTHETIC_INTERCEPT_LOG, JSON.stringify({
          model: request.model, toolChoice: request.tool_choice, questionPresent: JSON.stringify(request.input).includes('Does my insurance plan cover a cholesterol blood test?'),
          returnedReferences: [health.reference, policy.reference], serializedToolResults: JSON.stringify(search),
        }) + '\\n');
        return new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (typeof url === 'string' && (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:'))) return originalFetch(input, options);
      appendFileSync(process.env.NURA_EXTERNAL_ATTEMPT_LOG, String(url) + '\\n');
      throw new Error('External network is disabled in this synthetic Ask test.');
    };
  `);
  t.after(() => rm(tempDir, { recursive: true, force: true }));
  await mkdir(dataDir, { recursive: true });
  const now = '2026-09-20T08:00:00.000Z';
  const sources = [
    { id: 'synthetic-health-source', profileId: 'demo-profile', displayName: 'September health report.pdf', mediaType: 'application/pdf', sizeBytes: 100, sha256: 'a'.repeat(64), origin: 'document_extraction', importedAt: now, state: 'accepted', documentContext: null },
    { id: 'synthetic-policy-source', profileId: 'demo-profile', displayName: 'Family benefit schedule.pdf', mediaType: 'application/pdf', sizeBytes: 100, sha256: 'b'.repeat(64), origin: 'document_extraction', importedAt: now, state: 'accepted', documentContext: null },
  ];
  const assertions = [
    { id: 'synthetic-health-assertion', profileId: 'demo-profile', sourceId: 'synthetic-health-source', claimId: 'synthetic-ldl-claim', kind: 'lab_result', label: 'LDL cholesterol', value: '3.1', unit: 'mmol/L', effectiveAt: '2026-09-20', recordedAt: now, evidenceState: 'user_confirmed', validFrom: now, validUntil: null, version: 1 },
    { id: 'synthetic-policy-assertion', profileId: 'demo-profile', sourceId: 'synthetic-policy-source', claimId: 'synthetic-policy-claim', kind: 'coverage_term', label: 'Outpatient diagnostic test limit', value: 'Outpatient diagnostic tests are covered up to MYR 1,000 per policy year.', unit: null, effectiveAt: '2026-09-10', recordedAt: now, evidenceState: 'user_confirmed', validFrom: now, validUntil: null, version: 1 },
  ];
  await writeFile(join(dataDir, 'repository.json'), JSON.stringify({ schemaVersion: 1, sources, claims: [], assertions, runEvents: [] }));
  const server = await startServer({ dataDir, adapterPath, externalLog, interceptedLog: interceptedPath });
  t.after(() => stopServer(server.child));

  const baseInput = {
    runId: 'synthetic-ask-policy-journey',
    question: 'Does my insurance plan cover a cholesterol blood test?',
    consentConfirmed: true,
    externalSearchConsent: false,
    treatmentContextConsent: false,
    visitContextConsent: false,
    sourceContextConsent: false,
    history: [],
    context: {
      facts: [
        { id: 'synthetic-ldl-result', label: 'Fabricated LDL result', value: '9000 mg/dL', date: '2099-01-01', category: 'Insurer-approved diagnosis', sourceId: 'synthetic-health-source', sourceClaimId: 'synthetic-ldl-claim', source: 'not-the-report.pdf', status: 'reviewed' },
        { id: 'synthetic-outpatient-limit', label: 'Fabricated policy limit', value: 'Unlimited coverage', date: '2099-01-01', category: 'Health note', sourceId: 'synthetic-policy-source', sourceClaimId: 'synthetic-policy-claim', source: 'not-the-policy.pdf', status: 'reviewed' },
      ],
      topics: [], links: [], treatments: [], visits: [],
    },
  };

  const denied = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/agent/runs`, server.authorization, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...baseInput, runId: 'consent-required-ask', consentConfirmed: false }),
  });
  assert.equal(denied.status, 400, 'an Ask request without explicit one-run consent is rejected before the model adapter');
  assert.equal(await readFile(interceptedPath, 'utf8').catch(() => ''), '', 'the rejected request is not sent to the model');

  const staleSelection = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/agent/runs`, server.authorization, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...baseInput, runId: 'unknown-source-claim', context: { ...baseInput.context, facts: [{ ...baseInput.context.facts[0], sourceClaimId: 'not-an-accepted-claim' }] } }),
  });
  assert.equal(staleSelection.status, 400, 'the service rejects an unavailable selected document assertion');
  assert.equal(await readFile(interceptedPath, 'utf8').catch(() => ''), '', 'unavailable document evidence is not sent to the model');

  const response = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/agent/runs`, server.authorization, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(baseInput),
  });
  assert.equal(response.status, 200);
  const events = parseSse(await response.text());
  const types = events.map((event) => event.type);
  const answerIndex = types.indexOf('answer');
  const finishIndex = types.indexOf('run_finished');
  const answer = events.find((event) => event.type === 'answer')?.data;
  const citedEvidence = events.filter((event) => event.type === 'evidence').flatMap((event) => event.data.sources || []);
  const coverageTrace = events.find((event) => event.type === 'trace' && event.data.id === 'coverage-analysis' && event.data.status === 'complete');

  assert.ok(events.some((event) => event.type === 'run_started'));
  assert.ok(events.some((event) => event.type === 'trace' && event.data.id === 'profile-search' && event.data.status === 'started'));
  assert.ok(events.some((event) => event.type === 'trace' && event.data.id === 'evidence' && event.data.status === 'complete'));
  assert.ok(answerIndex >= 0 && finishIndex > answerIndex, 'the answer arrives before the single successful terminal event');
  assert.equal(types.at(-1), 'run_finished');
  assert.ok(answer, 'a structured answer was returned');
  assert.equal(answer.meaning.text, '', 'policy reviews do not add unrelated educational copy');
  assert.equal(answer.coverageAssessments.length, 1);
  assert.equal(answer.coverageAssessments[0].kind, 'explicit_limit');
  assert.equal(answer.coverageAssessments[0].detail, 'Outpatient diagnostic tests are covered up to MYR 1,000 per policy year.');
  assert.equal(answer.coverageAssessments[0].relatedHealthReferences.length, 1);
  assert.equal(answer.unknowns.length, 1);
  assert.match(answer.unknowns[0], /eligibility rules or requires prior approval/);
  assert.equal(answer.nextSteps.length, 1);
  assert.match(answer.nextSteps[0], /Ask the insurer/);
  assert.ok(answer.citations.includes(answer.coverageAssessments[0].policyReference));
  assert.ok(answer.citations.includes(answer.coverageAssessments[0].relatedHealthReferences[0]));
  assert.ok(citedEvidence.some((source) => source.kind === 'user_record' && source.title === 'LDL cholesterol'));
  assert.ok(citedEvidence.some((source) => source.kind === 'user_record' && source.category === 'Insurance coverage'));
  assert.match(coverageTrace?.data.detail ?? '', /1 policy finding linked to reviewed terms/);
  assert.equal(events.some((event) => event.type === 'run_error'), false);

  const externalRequests = await readFile(externalLog, 'utf8').catch(() => '');
  assert.equal(externalRequests, '', 'the run does not use external search or make an unmocked network request');
  const intercepted = (await readFile(interceptedPath, 'utf8')).trim().split(/\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(intercepted.length, 1, 'the model is called only for the one consented Ask run');
  assert.equal(intercepted[0].questionPresent, true);
  assert.equal(intercepted[0].model, 'gpt-5.6-luna');
  assert.match(intercepted[0].serializedToolResults, /September health report\.pdf/);
  assert.match(intercepted[0].serializedToolResults, /Outpatient diagnostic tests are covered up to MYR 1,000 per policy year\./);
  assert.doesNotMatch(intercepted[0].serializedToolResults, /9000 mg\/dL|Unlimited coverage|not-the-report\.pdf|not-the-policy\.pdf/);
});
