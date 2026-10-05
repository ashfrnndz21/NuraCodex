import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processIntakeBatch } from '../../src/services/intakeBatch.mjs';
import { commitReviewBatch } from '../../src/services/reviewBatch.mjs';
import { readBrowserDemoSnapshot, writeBrowserDemoSnapshot } from '../../src/state/browserDemoPersistence.mjs';

import { createSyntheticDemoAuthorization, fetchWithSyntheticDemoSession } from './demoTestSession.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serverEntry = join(projectRoot, 'server/index.mjs');
const NOTE_MARKER = 'sample dizziness after a fictional walk';
const noteText = `I sometimes notice ${NOTE_MARKER}. I am adding this note in my own words.`;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

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

async function startServer({ tempDir, dataDir, interceptedLog, externalLog }) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['--import', join(tempDir, 'synthetic-model-adapter.mjs'), serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      OPENAI_API_KEY: 'synthetic-test-key-never-send',
      NURA_LLM_PROVIDER: 'openai',
      NURA_AGENT_PORT: String(port),
      NURA_BIND_HOST: '127.0.0.1',
      NURA_DEMO_DATA_DIR: dataDir,
      NURA_SYNTHETIC_INTERCEPT_LOG: interceptedLog,
      NURA_EXTERNAL_ATTEMPT_LOG: externalLog,
      NURA_TEST_NOTE_MARKER: NOTE_MARKER,
      NURA_ENABLE_DEMO_INTAKE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  // The full repository suite starts several isolated servers in parallel.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local server exited before starting: ${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(700) });
      if (response.ok) { const authorization = await createSyntheticDemoAuthorization(baseUrl); return { child, baseUrl, output: () => output, authorization }; }
    } catch { /* Wait while the local server starts. */ }
    await sleep(100);
  }
  child.kill('SIGKILL');
  throw new Error(`Local server did not become ready: ${output}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([exited, sleep(1_500).then(() => child.kill('SIGKILL'))]);
}

function parseSse(text) {
  return [...text.matchAll(/(?:^|\n)event: ([^\n]+)\ndata: ([^\n]+)/g)].map(([, type, data]) => ({ type, data: JSON.parse(data) }));
}

const fixturePdf = (label) => Buffer.from(`%PDF-1.4\nSynthetic fictional report fixture · ${label}\n%%EOF`, 'utf8');

test('M1 synthetic intake journey batches files under one approval, keeps the note local, saves source decisions, retries and cancels safely', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'nura-m1-intake-'));
  const dataDir = join(tempDir, 'repository');
  const interceptedLog = join(tempDir, 'synthetic-adapter-requests.jsonl');
  const externalLog = join(tempDir, 'blocked-external-requests.log');
  const fixtureAdapter = `
    import { appendFileSync } from 'node:fs';
    const attempts = new Map();
    const outputFor = (filename) => {
      const common = { documentType: 'Fictional sample laboratory report', dates: [], entities: [], notes: [] };
      if (filename.toLowerCase().includes('holiday')) return { claims: [
        { kind: 'coverage_term', label: 'Annual medical limit', value: 'SGD 100,000', unit: null, referenceRange: null, method: null, effectiveAt: null, confidence: 0.9, page: 1, quote: 'Annual medical limit: SGD 100,000' },
      ], documentContext: { ...common, documentType: 'Fictional sample insurance policy' }, documentAssessment: { category: 'insurance_policy', confidence: 0.94 } };
      if (filename.toLowerCase().includes('january')) return { claims: [
        { kind: 'measurement', label: 'Total cholesterol', value: '4.2', unit: 'mmol/L', referenceRange: null, method: null, effectiveAt: '2026-01-12', confidence: 0.9, page: 1, quote: 'Total cholesterol 4.2 mmol/L on 2026-01-12' },
        { kind: 'measurement', label: 'LDL cholesterol', value: '2.8', unit: 'mmol/L', referenceRange: null, method: null, effectiveAt: '2026-01-12', confidence: 0.9, page: 1, quote: 'LDL cholesterol 2.8 mmol/L on 2026-01-12' },
      ], documentContext: common, documentAssessment: { category: 'medical_record', confidence: 0.94 } };
      if (filename.toLowerCase().includes('september')) return { claims: [
        { kind: 'measurement', label: 'Total cholesterol', value: '4.8', unit: 'mmol/L', referenceRange: null, method: null, effectiveAt: '2026-09-12', confidence: 0.9, page: 1, quote: 'Total cholesterol 4.8 mmol/L on 2026-09-12' },
        { kind: 'measurement', label: 'HDL cholesterol', value: '1.2', unit: 'mmol/L', referenceRange: null, method: null, effectiveAt: '2026-09-12', confidence: 0.8, page: 1, quote: 'HDL cholesterol 1.2 mmol/L on 2026-09-12' },
      ], documentContext: { ...common, notes: [{ kind: 'remarks', value: 'The sample report does not identify a collection time.', page: 1, quote: 'Collection time not listed' }] }, documentAssessment: { category: 'medical_record', confidence: 0.94 } };
      return { claims: [
        { kind: 'measurement', label: 'Blood pressure', value: '120/80', unit: 'mmHg', referenceRange: null, method: null, effectiveAt: '2026-08-18', confidence: 0.9, page: 1, quote: 'Blood pressure 120/80 mmHg on 2026-08-18' },
      ], documentContext: common, documentAssessment: { category: 'medical_record', confidence: 0.94 } };
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options = {}) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (typeof url === 'string' && url.startsWith('https://api.openai.com/')) {
        const request = JSON.parse(options.body);
        const file = request.input?.[0]?.content?.find((part) => part.type === 'input_file');
        const filename = file?.filename ?? 'unknown-sample.pdf';
        const attempt = (attempts.get(filename) ?? 0) + 1;
        attempts.set(filename, attempt);
        const encodedNoteIncluded = String(options.body).includes(process.env.NURA_TEST_NOTE_MARKER);
        const purposeOnly = request.text?.format?.name === 'nura_document_purpose';
        appendFileSync(process.env.NURA_SYNTHETIC_INTERCEPT_LOG, JSON.stringify({ filename, attempt, purposeOnly, noteTextIncluded: encodedNoteIncluded }) + '\\n');
        if (filename.includes('retry') && attempt === 1) return new Response(JSON.stringify({ error: { message: 'synthetic first-attempt extraction failure' } }), { status: 503 });
        if (filename.includes('cancel')) return await new Promise((resolve, reject) => {
          const signal = options.signal;
          const onAbort = () => { clearTimeout(timer); reject(Object.assign(new Error('Synthetic request cancelled.'), { name: 'AbortError' })); };
          if (signal?.aborted) { onAbort(); return; }
          signal?.addEventListener('abort', onAbort, { once: true });
          const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(new Response(JSON.stringify({ output_text: JSON.stringify(outputFor(filename)) }), { status: 200, headers: { 'content-type': 'application/json' } })); }, 10_000);
        });
        const output = purposeOnly
          ? { documentAssessment: { category: filename.toLowerCase().includes('holiday') ? 'travel_document' : 'medical_record', confidence: 0.94 } }
          : outputFor(filename);
        return new Response(JSON.stringify({ output_text: JSON.stringify(output) }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (typeof url === 'string' && url.startsWith('https://')) {
        appendFileSync(process.env.NURA_EXTERNAL_ATTEMPT_LOG, url + '\\n');
        throw new Error('External network is blocked in this synthetic test.');
      }
      return originalFetch(input, options);
    };
  `;
  await writeFile(join(tempDir, 'synthetic-model-adapter.mjs'), fixtureAdapter);

  const server = await startServer({ tempDir, dataDir, interceptedLog, externalLog });
  t.after(async () => { await stopServer(server.child); await rm(tempDir, { recursive: true, force: true }); });

  const stagedFiles = [
    { id: 'file-january', name: 'Sample January report.pdf', bytes: fixturePdf('January') },
    { id: 'file-retry', name: 'Sample retry report.pdf', bytes: fixturePdf('Retry') },
    { id: 'file-september', name: 'Sample September report.pdf', bytes: fixturePdf('September') },
    { id: 'file-cancel', name: 'Sample cancel report.pdf', bytes: fixturePdf('Cancel') },
    { id: 'file-after-cancel', name: 'Sample untouched report.pdf', bytes: fixturePdf('Untouched') },
  ];
  const draftNote = { id: 'note-local-only', text: noteText, topicId: 'sleep', topicLabel: 'Sleep', createdAt: '2026-09-25T09:00:00.000Z' };
  const approvedFileIds = new Set(stagedFiles.map((file) => file.id));
  // Mirrors the single file-batch confirmation: it names all staged files once.
  let approvalActions = 0;
  const batchConsent = (() => { approvalActions += 1; return { confirmed: true, fileIds: [...approvedFileIds] }; })();
  let interruptedSourceId = '';
  const controller = new AbortController();
  const processFile = async (asset, signal) => {
    assert.equal(batchConsent.confirmed, true);
    assert.ok(batchConsent.fileIds.includes(asset.id), 'each request is covered by the single batch approval');
    assert.ok(approvedFileIds.has(asset.id));
    const response = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/extract`, server.authorization, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-nura-file-name': encodeURIComponent(asset.name),
        'x-nura-document-purpose': 'medical',
        'x-nura-consent-confirmed': 'true',
      },
      body: asset.bytes,
      signal,
    });

    if (asset.id === 'file-cancel') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let stream = '';
      let sourceId = '';
      while (!stream.includes('event: document_purpose_check_started')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('The cancel fixture ended before the category check started.');
        stream += decoder.decode(value, { stream: true });
        const sourceEvent = parseSse(stream).find((event) => event.type === 'source_received');
        sourceId = sourceEvent?.data?.sourceId ?? sourceId;
      }
      interruptedSourceId = sourceId;
      controller.abort();
      await reader.cancel().catch(() => {});
      const cancelled = new Error('Stopped by the user after extraction started.');
      cancelled.name = 'IntakeCancelledError';
      cancelled.sourceId = sourceId;
      throw cancelled;
    }

    const events = parseSse(await response.text());
    const terminal = events.find((event) => event.type === 'intake_completed' || event.type === 'run_error' || event.type === 'intake_cancelled');
    const sourceId = terminal?.data?.sourceId ?? events.find((event) => event.type === 'source_received')?.data?.sourceId;
    if (terminal?.type !== 'intake_completed') {
      const failure = new Error(terminal?.data?.message ?? 'Synthetic file extraction failed.');
      failure.sourceId = sourceId;
      throw failure;
    }
    const sourceResponse = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/sources/${encodeURIComponent(sourceId)}/claims`, server.authorization);
    const source = await sourceResponse.json();
    return { sourceId, source: source.source, claims: source.claims };
  };

  const statuses = [];
  const firstBatch = await processIntakeBatch(stagedFiles, (asset) => processFile(asset, controller.signal), {
    signal: controller.signal,
    onStatus: (event) => statuses.push([event.assetId, event.status]),
  });
  assert.equal(approvalActions, 1, 'all staged files should use the one batch consent action');
  assert.deepEqual(firstBatch.map(({ assetId, status }) => [assetId, status]), [
    ['file-january', 'complete'], ['file-retry', 'failed'], ['file-september', 'complete'], ['file-cancel', 'cancelled'],
  ]);
  assert.deepEqual(statuses.filter(([, status]) => status === 'cancelled'), [['file-cancel', 'cancelled']]);
  assert.equal(firstBatch.find((item) => item.assetId === 'file-after-cancel'), undefined, 'files after cancellation are not started');
  const completedSources = firstBatch.filter((item) => item.status === 'complete').map((item) => item.value.source);
  assert.equal(completedSources.length, 2);
  assert.ok(completedSources.every((source) => source.origin === 'document_extraction' && source.state === 'candidate_review'));

  const holidayBytes = fixturePdf('holiday itinerary with flights, hotels, and daily activities');
  const uploadHoliday = async (confirmCategory = false) => fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/extract`, server.authorization, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-nura-file-name': encodeURIComponent('Holiday itinerary.pdf'),
      'x-nura-document-purpose': 'insurance',
      'x-nura-consent-confirmed': 'true',
      ...(confirmCategory ? { 'x-nura-document-purpose-confirmed': 'insurance' } : {}),
    },
    body: holidayBytes,
  });
  const categoryOnlyResponse = await uploadHoliday();
  const categoryOnlyEvents = parseSse(await categoryOnlyResponse.text());
  const categoryOnlyTerminal = categoryOnlyEvents.find((event) => event.type === 'intake_completed');
  const holidaySourceId = categoryOnlyTerminal?.data?.sourceId;
  assert.ok(holidaySourceId, 'the category check must create a source that the person can confirm, change, or remove');
  assert.ok(categoryOnlyEvents.some((event) => event.type === 'document_purpose_check_completed'));
  assert.equal(categoryOnlyEvents.some((event) => event.type === 'extraction_started'), false, 'a mismatch must stop before detail extraction starts');
  assert.equal(categoryOnlyTerminal.data.state, 'purpose_confirmation_required');
  const unconfirmedResponse = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/sources/${encodeURIComponent(holidaySourceId)}/claims`, server.authorization);
  const unconfirmed = await unconfirmedResponse.json();
  assert.equal(unconfirmed.source.state, 'purpose_confirmation_required');
  assert.equal(unconfirmed.source.documentPurposeCheck.kind, 'travel_document');
  assert.equal(unconfirmed.claims.length, 0, 'the category-only response must not create or save health or policy details');
  let holidayCalls = (await readFile(interceptedLog, 'utf8')).trim().split('\n').map((line) => JSON.parse(line)).filter((call) => call.filename === 'Holiday itinerary.pdf');
  assert.deepEqual(holidayCalls.map((call) => call.purposeOnly), [true], 'the mismatched file gets exactly one category-only provider call before user confirmation');

  const confirmedResponse = await uploadHoliday(true);
  const confirmedEvents = parseSse(await confirmedResponse.text());
  const confirmedTerminal = confirmedEvents.find((event) => event.type === 'intake_completed');
  assert.equal(confirmedTerminal?.data?.sourceId, holidaySourceId, 'confirmation retries the same source');
  assert.equal(confirmedTerminal?.data?.state, 'candidate_review');
  const confirmedClaimsResponse = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/sources/${encodeURIComponent(holidaySourceId)}/claims`, server.authorization);
  const confirmedClaims = await confirmedClaimsResponse.json();
  assert.deepEqual(confirmedClaims.claims.map((claim) => [claim.label, claim.value]), [['Annual medical limit', 'SGD 100,000']], 'detail extraction starts only after explicit category confirmation');
  holidayCalls = (await readFile(interceptedLog, 'utf8')).trim().split('\n').map((line) => JSON.parse(line)).filter((call) => call.filename === 'Holiday itinerary.pdf');
  assert.deepEqual(holidayCalls.map((call) => call.purposeOnly), [true, false]);

  const retryAsset = stagedFiles.find((file) => file.id === 'file-retry');
  const retryBatch = await processIntakeBatch([retryAsset], (asset) => processFile(asset, new AbortController().signal));
  assert.deepEqual(retryBatch.map(({ assetId, status }) => [assetId, status]), [['file-retry', 'complete']]);
  const retriedSource = retryBatch[0].value.source;
  assert.equal(retriedSource.state, 'candidate_review');

  assert.ok(interruptedSourceId, 'cancellation retains a source reference for safe recovery');
  const interruptedSourceResponse = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/sources/${encodeURIComponent(interruptedSourceId)}/claims`, server.authorization);
  const interruptedSource = await interruptedSourceResponse.json();
  if (interruptedSource.source.state !== 'failed') {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline && interruptedSource.source.state !== 'failed') {
      await sleep(25);
      const retryResponse = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/sources/${encodeURIComponent(interruptedSourceId)}/claims`, server.authorization);
      Object.assign(interruptedSource, await retryResponse.json());
    }
  }
  assert.equal(interruptedSource.source.state, 'failed');
  assert.equal(interruptedSource.claims.length, 0);

  const jan = firstBatch.find((item) => item.assetId === 'file-january').value;
  const september = firstBatch.find((item) => item.assetId === 'file-september').value;
  const janTotal = jan.claims.find((claim) => claim.label === 'Total cholesterol');
  const janLdl = jan.claims.find((claim) => claim.label === 'LDL cholesterol');
  const sepTotal = september.claims.find((claim) => claim.label === 'Total cholesterol');
  const sepHdl = september.claims.find((claim) => claim.label === 'HDL cholesterol');
  const retryBp = retryBatch[0].value.claims.find((claim) => claim.label === 'Blood pressure');
  assert.deepEqual([Boolean(janTotal), Boolean(janLdl), Boolean(sepTotal), Boolean(sepHdl), Boolean(retryBp)], [true, true, true, true, true], JSON.stringify({ jan: jan.claims.map((claim) => claim.label), september: september.claims.map((claim) => claim.label), retry: retryBatch[0].value.claims.map((claim) => claim.label) }));
  for (const [source, items] of [[jan.source, jan.claims], [september.source, september.claims], [retriedSource, retryBatch[0].value.claims]]) {
    assert.ok(items.every((claim) => claim.sourceId === source.id && claim.evidenceState === 'needs_review'));
    assert.ok(items.every((claim) => claim.sourceLocation.quote));
  }

  const storageValues = new Map();
  const storage = { getItem: (key) => storageValues.get(key) ?? null, setItem: (key, value) => storageValues.set(key, value) };
  const fallback = { version: 1, demoOnly: true, name: '', birthday: '', country: '', email: '', phone: '', topics: [], assets: [], intakeNotes: [], facts: [], treatments: [], treatmentEvents: [], visits: [], policyReplacements: [], visitEvents: [], links: [], feedItems: [], savedQuestions: [], agentMessages: [], registryBriefs: [] };
  writeBrowserDemoSnapshot(storage, 'nura-demo', { ...fallback, intakeNotes: [draftNote] });
  const reviewOperations = [
    { id: `accept:${janTotal.id}`, kind: 'claim', claimId: janTotal.id, decision: 'accept' },
    { id: `edit:${sepTotal.id}`, kind: 'claim', claimId: sepTotal.id, decision: 'edit', editedValue: { label: 'Total cholesterol', value: '4.7', unit: 'mmol/L', effectiveAt: '2026-09-12' } },
    { id: `reject:${sepHdl.id}`, kind: 'claim', claimId: sepHdl.id, decision: 'reject' },
    { id: `note:${draftNote.id}`, kind: 'user_note', noteId: draftNote.id },
  ];
  let failReviewOnce = true;
  const saveOne = async (operation) => {
    if (operation.id === `edit:${sepTotal.id}` && failReviewOnce) {
      failReviewOnce = false;
      throw new Error('Synthetic temporary review-save interruption.');
    }
    if (operation.kind === 'user_note') {
      const loaded = readBrowserDemoSnapshot(storage, 'nura-demo', fallback).snapshot;
      const note = loaded.intakeNotes.find((item) => item.id === operation.noteId);
      assert.ok(note, 'the original plain-text draft is still available while reviewing files');
      const fact = { id: 'fact-self-report', label: 'Sleep · your note', value: note.text, date: '2026-09-25T09:05:00.000Z', category: 'Self-reported', source: 'Written by you', reviewState: 'user_confirmed' };
      writeBrowserDemoSnapshot(storage, 'nura-demo', { ...loaded, intakeNotes: loaded.intakeNotes.filter((item) => item.id !== note.id), facts: [fact, ...loaded.facts] });
      return;
    }
    const response = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/claims/${encodeURIComponent(operation.claimId)}/decision`, server.authorization, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: operation.decision, ...(operation.editedValue ? { editedValue: operation.editedValue } : {}) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? 'The source claim could not be saved.');
    const originalClaim = [janTotal, janLdl, sepTotal, sepHdl, retryBp].find((claim) => claim.id === operation.claimId);
    assert.equal(result.claim.sourceId, originalClaim.sourceId);
    return result;
  };

  const firstSave = await commitReviewBatch(reviewOperations, saveOne);
  assert.deepEqual(firstSave.map(({ id, status }) => [id, status]), [
    [`accept:${janTotal.id}`, 'saved'], [`edit:${sepTotal.id}`, 'failed'], [`reject:${sepHdl.id}`, 'saved'], [`note:${draftNote.id}`, 'saved'],
  ]);
  const retrySave = await commitReviewBatch(reviewOperations.filter((operation) => firstSave.some((result) => result.id === operation.id && result.status === 'failed')), saveOne);
  assert.deepEqual(retrySave.map(({ id, status }) => [id, status]), [[`edit:${sepTotal.id}`, 'saved']]);

  const getClaim = async (claim) => {
    const response = await fetchWithSyntheticDemoSession(`${server.baseUrl}/v1/intake/sources/${encodeURIComponent(claim.sourceId)}/claims`, server.authorization);
    const body = await response.json();
    return body.claims.find((item) => item.id === claim.id);
  };
  assert.equal((await getClaim(janTotal)).evidenceState, 'user_confirmed');
  const savedEdit = await getClaim(sepTotal);
  assert.equal(savedEdit.evidenceState, 'user_confirmed');
  assert.equal(savedEdit.value, '4.7');
  assert.equal(savedEdit.originalExtraction.value, '4.8');
  assert.equal((await getClaim(sepHdl)).evidenceState, 'rejected');
  const savedWorkspace = readBrowserDemoSnapshot(storage, 'nura-demo', fallback).snapshot;
  assert.equal(savedWorkspace.intakeNotes.length, 0);
  assert.equal(savedWorkspace.facts[0].source, 'Written by you');
  assert.equal(savedWorkspace.facts[0].value, noteText);

  const repoText = await readFile(join(dataDir, 'repository.json'), 'utf8');
  assert.ok(!repoText.includes(noteText), 'the self-report draft remains local and is not persisted to the document service');
  assert.ok(!repoText.includes(NOTE_MARKER));
  const adapterCalls = (await readFile(interceptedLog, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(adapterCalls.length >= 5, 'the synthetic model adapter supplied document-extraction fixtures, including a failure, retry and cancellation');
  assert.ok(adapterCalls.every((call) => call.noteTextIncluded === false), 'the plain-text health description is never included in document extraction requests');
  assert.ok(interruptedSource.source.documentContext === null || interruptedSource.claims.length === 0);
  await assert.rejects(readFile(externalLog, 'utf8'), { code: 'ENOENT' }, 'all outbound external network traffic is blocked; no provider request was made');
  assert.equal(approvalActions, 1);
});
