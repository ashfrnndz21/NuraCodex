#!/usr/bin/env node
/**
 * M1 browser rehearsal for an ordinary file upload.
 * Uses a disposable browser profile and a synthetic in-memory provider shim.
 * It never reads dotenv files, inherits credentials, or makes third-party calls.
 */
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';

const root = process.cwd();
const tempRoot = await mkdtemp(join(tmpdir(), 'nura-m1-connected-'));
const wrongCategoryScreenshotPath = join(tmpdir(), 'nura-insurance-purpose-pause.png');
const policyDossierScreenshotPath = join(tmpdir(), 'nura-insurance-policy-dossier.png');
const policyDossierDetailsScreenshotPath = join(tmpdir(), 'nura-insurance-policy-dossier-details.png');
const dataDir = join(tempRoot, 'synthetic-repository');
const browserProfile = join(tempRoot, 'chrome-profile');
const providerLogPath = join(tempRoot, 'synthetic-provider.jsonl');
const askLogPath = join(tempRoot, 'synthetic-ask.jsonl');
const blockedEgressPath = join(tempRoot, 'blocked-egress.log');
const askEnabled = process.argv.includes('--ask');
const childProcesses = [];
const outputs = new Map();
const checks = [];
const failures = [];
const networkOrigins = new Set();
const networkFailures = [];
const runResponses = [];
const browserExceptions = [];
const pendingCommands = new Map();
const eventWaiters = new Map();
let browser;
let sessionId;
let commandId = 0;
let appOrigin;
let serviceOrigin;
let fileChooserEvent;

function log(message) { process.stdout.write(message + '\n'); }
function record(name, passed, detail) {
  const result = { name, passed, detail: detail || '' };
  checks.push(result);
  if (!passed) failures.push(result);
  log((passed ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function trim(value, limit) { return value.slice(-limit); }

function safeChildEnv(extra) {
  return {
    PATH: process.env.PATH || '/usr/bin' + delimiter + '/bin',
    HOME: process.env.HOME || tmpdir(),
    TMPDIR: process.env.TMPDIR || tmpdir(),
    LANG: process.env.LANG || 'en_US.UTF-8',
    NODE_ENV: 'development',
    EXPO_NO_DOTENV: '1',
    EXPO_OFFLINE: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_NO_WEB_SETUP: '1',
    CI: '1',
    ...extra,
  };
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function launch(label, command, args, env) {
  const proc = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const recordValue = { proc, label, stdout: '', stderr: '' };
  outputs.set(proc, recordValue);
  childProcesses.push(recordValue);
  proc.stdout.on('data', (chunk) => { recordValue.stdout = trim(recordValue.stdout + chunk.toString(), 24000); });
  proc.stderr.on('data', (chunk) => { recordValue.stderr = trim(recordValue.stderr + chunk.toString(), 24000); });
  proc.once('exit', (code, signal) => { recordValue.exit = { code, signal }; });
  return recordValue;
}

function tail(value) { return String(value || '').slice(-1800); }

async function waitFor(check, message, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 30000);
  let lastError;
  while (Date.now() < deadline) {
    for (const child of childProcesses) {
      if (child.exit) throw new Error(child.label + ' exited early (' + JSON.stringify(child.exit) + '). ' + tail(child.stderr));
    }
    try {
      const value = await check();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(150);
  }
  throw new Error(message + (lastError ? ' (' + lastError.message + ')' : ''));
}

async function serviceReady() {
  try {
    const response = await fetch(serviceOrigin + '/healthz', { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return false;
    const value = await response.json();
    return value.ok === true && value.provider?.configured === true;
  } catch { return false; }
}

async function browserJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error('Chrome debug endpoint returned ' + response.status + '.');
  return response.json();
}

async function connectCdp(wsUrl) {
  if (typeof WebSocket !== 'function') throw new Error('Node must provide its built-in WebSocket API.');
  browser = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome DevTools connection timed out.')), 10000);
    browser.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    browser.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Could not connect to Chrome DevTools.')); }, { once: true });
  });
  browser.addEventListener('message', (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.method === 'Page.fileChooserOpened') fileChooserEvent = data.params;
    if (data.method === 'Network.requestWillBeSent') {
      try { networkOrigins.add(new URL(data.params.request.url).origin); } catch { /* local or data URL */ }
    }
    if (data.method === 'Network.responseReceived' && String(data.params.response?.url || '').includes('/v1/agent/runs')) {
      runResponses.push({ requestId: data.params.requestId, status: data.params.response.status });
    }
    if (data.method === 'Network.loadingFailed') networkFailures.push(data.params.errorText || 'network failure');
    if (data.method === 'Runtime.exceptionThrown') browserExceptions.push(String(data.params.exceptionDetails?.text || 'page exception').slice(0, 240));
    if (data.method && eventWaiters.has(data.method)) {
      const queue = eventWaiters.get(data.method);
      const waiter = queue.shift();
      if (!queue.length) eventWaiters.delete(data.method);
      waiter(data.params);
    }
    if (!data.id || !pendingCommands.has(data.id)) return;
    const pending = pendingCommands.get(data.id);
    pendingCommands.delete(data.id);
    if (data.error) pending.reject(new Error(data.error.message));
    else pending.resolve(data.result);
  });
}

function cdp(method, params) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error('Chrome protocol command timed out: ' + method));
    }, 15000);
    pendingCommands.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    browser.send(JSON.stringify({ id, method, params: params || {}, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(expression, timeoutMs) {
  const result = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    timeout: timeoutMs || 20000,
  });
  if (result.exceptionDetails) throw new Error('Page evaluation failed: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
  return result.result?.value;
}
async function bodyText() { return (await evaluate('document.body?.innerText || ""')) || ''; }

async function waitText(text, timeoutMs) {
  return waitFor(async () => {
    const value = await bodyText();
    return value.includes(text) ? value : false;
  }, 'Timed out waiting for visible text: ' + text, timeoutMs || 30000);
}

async function waitPath(expected) {
  return waitFor(async () => {
    const value = await evaluate('location.pathname + location.search');
    return typeof expected === 'function' ? (expected(value) ? value : false) : (value === expected ? value : false);
  }, 'Timed out waiting for route: ' + String(expected), 45000);
}

async function clickVisible(options) {
  const descriptor = options.text || options.aria;
  const exact = Boolean(options.exact);
  const node = await waitFor(async () => evaluate('(() => {' +
    'const candidates = [...document.querySelectorAll("button,[role=button],[tabindex=\\"0\\"]")].filter((el) => {' +
    'const rect = el.getBoundingClientRect(); const style = getComputedStyle(el);' +
    'if (!rect.width || !rect.height || style.visibility === "hidden" || style.display === "none") return false;' +
    'const label = [el.getAttribute("aria-label") || "", el.innerText || el.textContent || ""].join(" ").replace(/\\\\s+/g, " ").trim();' +
    'const wanted = ' + JSON.stringify(descriptor) + '; return ' + (exact ? 'label === wanted' : 'label.includes(wanted)') + ';' +
    '}).sort((a,b) => ((a.getAttribute("aria-label") || a.innerText || a.textContent || "").length) - ((b.getAttribute("aria-label") || b.innerText || b.textContent || "").length));' +
    'const el = candidates[0]; if (!el) return null; el.scrollIntoView({block:"center",inline:"center",behavior:"instant"});' +
    'const rect=el.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,label:el.getAttribute("aria-label")||el.innerText||el.textContent};' +
    '})()'), 'Could not find control ' + descriptor + '. Page: ' + (await bodyText()).slice(-1200), 20000);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: node.x, y: node.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: node.x, y: node.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: node.x, y: node.y, button: 'left', clickCount: 1 });
  await delay(150);
  return String(node.label || descriptor).replace(/\s+/g, ' ').trim();
}

async function fillInput(aria, value) {
  const coordinates = await waitFor(async () => evaluate('(() => {' +
    'const el=[...document.querySelectorAll("input,textarea")].find((item)=>item.getAttribute("aria-label")===' + JSON.stringify(aria) + ');' +
    'if(!el)return null;el.scrollIntoView({block:"center",behavior:"instant"});const r=el.getBoundingClientRect();' +
    'return {x:r.left+r.width/2,y:r.top+r.height/2};})()'), 'Could not find input ' + aria, 15000);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: coordinates.x, y: coordinates.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coordinates.x, y: coordinates.y, button: 'left', clickCount: 1 });
  const replacement = await evaluate('(() => {' +
    'const el=[...document.querySelectorAll("input,textarea")].find((item)=>item.getAttribute("aria-label")===' + JSON.stringify(aria) + ');' +
    'if(!el)return null;const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;' +
    'const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;if(!setter)return null;setter.call(el,' + JSON.stringify(value) + ');' +
    'el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:' + JSON.stringify(value) + '}));' +
    'el.dispatchEvent(new Event("change",{bubbles:true}));return el.value;})()');
  assert(replacement === value, 'Input ' + aria + ' did not accept the synthetic value.');
  await delay(100);
  assert(await evaluate('(() => [...document.querySelectorAll("input,textarea")].find((item)=>item.getAttribute("aria-label")===' + JSON.stringify(aria) + ')?.value || null)()') === value, 'Input ' + aria + ' did not retain the synthetic value.');
}

async function navigate(url) {
  await cdp('Page.navigate', { url });
  await waitFor(async () => {
    const state = await evaluate('document.readyState');
    return state === 'complete' || state === 'interactive';
  }, 'Page navigation timed out.', 30000);
  await delay(350);
}

async function pickSyntheticFiles(paths) {
  fileChooserEvent = null;
  await clickVisible({ aria: 'Choose files' });
  const chooser = await waitFor(() => fileChooserEvent || false, 'The app file chooser did not open.', 10000);
  assert(typeof chooser.backendNodeId === 'number', 'Chrome did not expose the app file input to the test.');
  await cdp('DOM.setFileInputFiles', { files: paths, backendNodeId: chooser.backendNodeId });
  for (const path of paths) {
    const name = path.split('/').pop();
    await waitText(name, 20000);
  }
}

async function syntheticProviderSource() {
  const implementation = function syntheticProvider(Buffer) {
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async function (input, options) {
      const url = typeof input === 'string' ? input : input && input.url;
      if (url === 'https://api.openai.com/v1/responses') {
        const request = JSON.parse(options && options.body || '{}');
        const content = (request.input || []).flatMap((item) => item.content || []);
        const file = content.find((part) => part.type === 'input_file');
        if (!file && process.env.NURA_FAKE_ASK_ENABLED === 'true') {
          const { appendFileSync } = await import('node:fs');
          const logAsk = (entry) => appendFileSync(process.env.NURA_FAKE_ASK_LOG, JSON.stringify(entry) + '\n', { mode: 0o600 });
          const isProfileSearch = request.tool_choice?.type === 'function' && request.tool_choice?.name === 'search_profile';
          if (isProfileSearch) {
            logAsk({ stage: 'profile_search_requested' });
            return new Response(JSON.stringify({ output: [{
              type: 'function_call', call_id: 'ordinary-upload-ask-search', name: 'search_profile',
              arguments: JSON.stringify({ query: 'Room and board limit blood pressure' }),
            }] }), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          const searchCall = (request.input || []).find((item) => item.type === 'function_call_output');
          let results = [];
          try { results = JSON.parse(searchCall?.output || '{}').results || []; } catch { /* return a bounded synthetic provider error below */ }
          const isPolicy = (item) => /^(insurance coverage|coverage_term|coverage term)$/i.test(String(item?.category || ''));
          const policy = results.find((item) => isPolicy(item) && /room and board limit/i.test(item.title || ''))
            || results.find((item) => isPolicy(item));
          const health = results.find((item) => !isPolicy(item) && /blood pressure/i.test(item.title || ''));
          if (!policy || !health || !policy.reference || !health.reference) {
            logAsk({ stage: 'missing_selected_evidence', policyFound: Boolean(policy), healthFound: Boolean(health), results: results.map((item) => ({ kind: item.kind, category: item.category, title: item.title, reference: item.reference })) });
            return new Response(JSON.stringify({ error: { message: 'The selected synthetic policy and health records were not both available to Ask.' } }), { status: 422, headers: { 'content-type': 'application/json' } });
          }
          const answer = {
            answer: 'Your reviewed policy lists ' + policy.title + ': ' + policy.detail + '. Your saved health record lists ' + health.title + ': ' + health.detail + '. The selected policy wording does not establish whether this reading affects that room-and-board limit.',
            citations: [policy.reference, health.reference],
            meaning: { text: '', citations: [] },
            unknowns: ['The policy excerpt does not explain how the room-and-board limit relates to this blood pressure reading.'],
            nextSteps: ['Ask the insurer which inpatient room charges the stated daily limit applies to.'],
            coverageAssessments: [{ kind: 'explicit_limit', policyReference: policy.reference, detail: policy.detail, relatedHealthReferences: [] }],
            memoryProposal: { proposed: false, label: '', value: '', reason: '', sourceReferences: [] },
          };
          logAsk({ stage: 'grounded_response_returned', titles: [policy.title, health.title], references: [policy.reference, health.reference] });
          return new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (!file) return new Response(JSON.stringify({ error: { message: 'Unexpected synthetic request without an uploaded file.' } }), { status: 400, headers: { 'content-type': 'application/json' } });
        const filename = file && file.filename || 'missing-filename.pdf';
        const encoded = file && file.file_data || '';
        const base64 = encoded.slice(encoded.indexOf(',') + 1);
        const text = Buffer.from(base64, 'base64').toString('utf8');
        const contentMatches = text.includes('NURA SYNTHETIC FIXTURE ONLY');
        const purposeOnly = request.text?.format?.name === 'nura_document_purpose';
        const attempts = (globalThis.__nuraSyntheticAttempts || new Map());
        globalThis.__nuraSyntheticAttempts = attempts;
        const attemptKey = `${filename}:${purposeOnly ? 'purpose' : 'details'}`;
        const attempt = (attempts.get(attemptKey) || 0) + 1;
        attempts.set(attemptKey, attempt);
        const { appendFileSync } = await import('node:fs');
        const logPath = process.env.NURA_FAKE_PROVIDER_LOG;
        const logEvent = (outcome) => appendFileSync(logPath, JSON.stringify({ filename, attempt, purposeOnly, contentMatches, outcome }) + '\n', { mode: 0o600 });
        if (!contentMatches) {
          logEvent('rejected-unexpected-payload');
          return new Response(JSON.stringify({ error: { message: 'Synthetic fixture content mismatch.' } }), { status: 400 });
        }
        if (purposeOnly) {
          logEvent('category-only-check');
          const category = filename === 'holiday-itinerary.pdf' ? 'travel_document' : filename === 'ordinary-failed-policy.pdf' ? 'insurance_policy' : 'medical_record';
          return new Response(JSON.stringify({ output_text: JSON.stringify({ documentAssessment: { category, confidence: 0.98 } }) }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (filename === 'ordinary-retry-report.pdf' && attempt === 1) {
          logEvent('synthetic-service-failure');
          return new Response(JSON.stringify({ error: { message: 'Synthetic temporary service interruption.' } }), { status: 503 });
        }
        if (filename === 'ordinary-failed-policy.pdf' && attempt === 1) {
          logEvent('synthetic-service-failure');
          return new Response(JSON.stringify({ error: { message: 'Synthetic policy-reading service interruption.' } }), { status: 503 });
        }
        if (filename === 'ordinary-cancel-report.pdf' && attempt === 1) {
          logEvent('delayed-until-user-stop');
          return await new Promise((resolve, reject) => {
            const signal = options && options.signal;
            let settled = false;
            const finish = (error, value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (signal) signal.removeEventListener('abort', onAbort);
              if (error) reject(error);
              else resolve(value);
            };
            const onAbort = () => {
              logEvent('aborted-after-stop');
              finish(Object.assign(new Error('Synthetic request stopped by the app.'), { name: 'AbortError' }));
            };
            if (signal && signal.aborted) { onAbort(); return; }
            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            const timer = setTimeout(() => {
              logEvent('unexpected-timeout');
              finish(null, new Response(JSON.stringify({ output_text: JSON.stringify(answerFor(filename)) }), { status: 200, headers: { 'content-type': 'application/json' } }));
            }, 60000);
          });
        }
        logEvent('synthetic-success');
        return new Response(JSON.stringify({ output_text: JSON.stringify(answerFor(filename)) }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (typeof url === 'string' && url.startsWith('https://')) {
        const { appendFileSync } = await import('node:fs');
        appendFileSync(process.env.NURA_BLOCKED_EGRESS_LOG, url + '\n', { mode: 0o600 });
        throw new Error('External network is disabled in the synthetic browser rehearsal.');
      }
      return originalFetch(input, options);
    };
    function answerFor(filename) {
      if (filename === 'ordinary-failed-policy.pdf') {
        return {
          claims: [{
            kind: 'coverage_term', label: 'Room and board limit', value: 'SGD 300 per day', unit: null,
            referenceRange: null, method: null, effectiveAt: null, confidence: 0.96,
            page: 1, quote: 'Room and board limit: SGD 300 per day',
          }],
          documentContext: { documentType: 'Synthetic policy schedule', dates: [], entities: [], notes: [] },
          documentAssessment: { category: 'insurance_policy', confidence: 0.98 },
        };
      }
      const fixtures = {
        'ordinary-retry-report.pdf': { value: '118/76', date: '2025-02-18' },
        'ordinary-cancel-report.pdf': { value: '121/79', date: '2025-03-02' },
        'ordinary-unstarted-report.pdf': { value: '117/74', date: null, reportDate: '2025-03-10' },
        'ordinary-conflict-a-report.pdf': { value: '124/82', date: '2025-04-15' },
        'ordinary-conflict-b-report.pdf': { value: '129/84', date: '2025-04-15' },
      };
      const details = fixtures[filename] || fixtures['ordinary-retry-report.pdf'];
      const quote = details.date
        ? 'Blood pressure ' + details.value + ' mmHg on ' + details.date
        : 'Blood pressure ' + details.value + ' mmHg. Report issued ' + details.reportDate;
      return {
        claims: [{
          kind: 'measurement', label: 'Blood pressure', value: details.value, unit: 'mmHg',
          referenceRange: null, method: null, effectiveAt: details.date, confidence: 0.94,
          page: 1, quote,
        }],
        documentContext: {
          documentType: 'Synthetic laboratory report',
          dates: details.reportDate ? [{ kind: 'report_date', value: details.reportDate, page: 1, quote: 'Report issued ' + details.reportDate }] : [],
          entities: [], notes: [],
        },
        documentAssessment: { category: 'medical_record', confidence: 0.98 },
      };
    }
  };
  return 'const { Buffer } = await import("node:buffer");\nawait (' + implementation.toString() + ')(Buffer);\n';
}

async function readLines(path) {
  try {
    const content = await readFile(path, 'utf8');
    return content.trim() ? content.trim().split('\n').map((line) => JSON.parse(line)) : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readRepository() {
  try { return JSON.parse(await readFile(join(dataDir, 'repository.json'), 'utf8')); }
  catch (error) { if (error && error.code === 'ENOENT') return null; throw error; }
}

async function runOrdinaryUploadAskJourney() {
  // Insurance keeps the Ask action disabled while source-linked policy terms
  // are being reconciled. Wait for that read-only preparation to finish before
  // clicking; a visible button is not necessarily enabled yet.
  const policyAskLabel = await waitFor(async () => evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="button"],button')]
      .find((el) => /^Check .+ against selected health details$/.test(el.getAttribute('aria-label') || '') && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    return button?.getAttribute('aria-label') || '';
  })()`), 'The policy-scoped Ask action did not become ready after source review.', 30000);
  await clickVisible({ aria: policyAskLabel });
  await waitPath((path) => path.startsWith('/ask?') && path.includes('policySourceIds='));
  await waitText('Review this policy against only the health details you choose for this run.');
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Choose what Nura can use.');
  const healthFactLabel = await evaluate("([...document.querySelectorAll('[role=\\\"checkbox\\\"][aria-label]')].map((el) => el.getAttribute('aria-label') || '').find((label) => /^Share Blood pressure:/i.test(label)) || '')");
  assert(healthFactLabel, 'The ordinary upload-to-Ask run cannot select its source-linked blood pressure fact.');
  const checkboxSnapshot = () => evaluate(`(() => [...document.querySelectorAll('[role=\"checkbox\"][aria-label]')].map((el) => ({ label: el.getAttribute('aria-label'), rowText: el.innerText || '' })))()`);
  const checkboxStateBefore = await checkboxSnapshot();
  const initiallySelected = checkboxStateBefore.filter((row) => /^Share (Blood pressure|Weight|Height):/.test(row.label) && /^✓/.test(row.rowText.trim())).map((row) => row.label);
  assert(initiallySelected.length === 0, 'A policy review preselected health details: ' + initiallySelected.join(', '));
  const factClickResult = await evaluate(`(() => { const item = [...document.querySelectorAll('[role=\"checkbox\"]')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(healthFactLabel)}); item?.click(); return Boolean(item); })()`);
  assert(factClickResult, 'The exact health fact checkbox could not be activated.');
  await waitFor(async () => (await checkboxSnapshot()).some((row) => row.label === healthFactLabel && /^✓/.test(row.rowText.trim())), 'The selected blood pressure record did not enter its checked state.');
  const checkboxStateAfter = await checkboxSnapshot();
  const selectedHealthLabels = checkboxStateAfter.filter((row) => /^Share (Blood pressure|Weight|Height):/.test(row.label) && /^✓/.test(row.rowText.trim())).map((row) => row.label);
  assert(selectedHealthLabels.length === 1 && selectedHealthLabels[0] === healthFactLabel, 'The policy review must share only the health fact the user selected; got ' + selectedHealthLabels.join(', '));
  const continueClicked = await evaluate(`(() => { const item = [...document.querySelectorAll('button,[role=\"button\"],[tabindex=\"0\"]')].find((el) => (el.innerText || el.textContent || '').includes('CONTINUE WITH SELECTED DETAILS')); item?.click(); return Boolean(item); })()`);
  assert(continueClicked, 'The selected-details consent could not be continued.');
  await waitText('Your reviewed policy lists Room and board limit', 30_000);
  await clickVisible({ aria: 'Show more answer and source detail' });
  await waitText('does not establish whether this reading affects');
  await clickVisible({ aria: 'Show 1 reviewed policy terms' });
  await waitText('ordinary-failed-policy.pdf');
  const answer = await bodyText();
  assert(answer.includes('SGD 300 per day') && answer.includes('Blood pressure') && answer.includes('118/76'), 'Ask did not connect the ordinary policy PDF to the accepted ordinary health PDF.');
  assert(answer.includes('does not establish whether this reading affects') && answer.includes('Ask the insurer which inpatient room charges'), 'Ask did not preserve the evidence boundary and insurer follow-up.');
  const policySourceVisible = answer.includes('ordinary-failed-policy.pdf');
  const healthSourceVisible = answer.includes('ordinary-retry-report.pdf');
  record('One fresh ordinary-upload session continues through policy-scoped Ask with citations to both original PDFs', policySourceVisible && healthSourceVisible, `policy source visible: ${policySourceVisible}; health source visible: ${healthSourceVisible}`);
  await navigate(`${appOrigin}/ask`);
  await waitText('Your reviewed policy lists Room and board limit', 30_000);
  await clickVisible({ aria: 'Show 1 reviewed policy terms' });
  await waitText('ordinary-failed-policy.pdf');
  await waitText('ordinary-retry-report.pdf');
  record('Ordinary-upload Ask answer and both source citations survive app route re-entry', true);
  await navigate(`${appOrigin}/insurance`);
  await waitText('Coverage details');
}

async function startLocalServices() {
  const backendPort = await availablePort();
  const webPort = await availablePort();
  const debugPort = await availablePort();
  appOrigin = 'http://localhost:' + webPort;
  serviceOrigin = 'http://127.0.0.1:' + backendPort;
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const preloadPath = join(tempRoot, 'synthetic-provider-preload.mjs');
  await writeFile(preloadPath, await syntheticProviderSource(), { mode: 0o600 });

  const serviceEnv = safeChildEnv({
    OPENAI_API_KEY: 'synthetic-test-key-never-send',
    NURA_LLM_PROVIDER: 'openai',
    NURA_AGENT_PORT: String(backendPort),
    NURA_BIND_HOST: '127.0.0.1',
    NURA_ALLOWED_ORIGINS: appOrigin,
    NURA_DEMO_DATA_DIR: dataDir,
    NURA_ENABLE_DEMO_INTAKE: 'true',
    NURA_FAKE_PROVIDER_LOG: providerLogPath,
    NURA_FAKE_ASK_ENABLED: String(askEnabled),
    NURA_FAKE_ASK_LOG: askLogPath,
    NURA_BLOCKED_EGRESS_LOG: blockedEgressPath,
  });
  launch('synthetic-only Nura service', process.execPath, ['--import', preloadPath, 'server/index.mjs'], serviceEnv);
  await waitFor(serviceReady, 'The isolated local service did not start with only the synthetic provider configured.', 30000);
  record('Local service is configured for connected upload with a synthetic-only provider shim', true, 'No credential or dotenv file is read');

  launch('Expo web preview', process.execPath, ['node_modules/expo/bin/cli', 'start', '--web', '--port', String(webPort), '--localhost'], safeChildEnv({
    EXPO_PUBLIC_NURA_AGENT_URL: serviceOrigin,
    EXPO_PUBLIC_SAMPLE_PREVIEW: 'false',
    NURA_AGENT_PORT: String(backendPort),
    BROWSER: 'none',
  }));
  await waitFor(async () => {
    try { const response = await fetch(appOrigin, { signal: AbortSignal.timeout(2000) }); return response.ok; }
    catch { return false; }
  }, 'The isolated Expo web preview did not become ready.', 150000);
  record('Compiled Expo web preview is ready on a temporary local origin', true);

  const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  await stat(chromePath);
  launch('chrome', chromePath, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-sync', '--disable-extensions', '--disable-translate', '--metrics-recording-only',
    '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--remote-allow-origins=*',
    '--remote-debugging-port=' + debugPort, '--user-data-dir=' + browserProfile,
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1',
    'about:blank',
  ], safeChildEnv({}));
  const debugBase = 'http://127.0.0.1:' + debugPort;
  await waitFor(() => browserJson(debugBase + '/json/version'), 'Disposable Chrome did not start.', 30000);
  const created = await browserJson(debugBase + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' });
  await connectCdp(created.webSocketDebuggerUrl);
  await cdp('Page.enable');
  await cdp('Page.setInterceptFileChooserDialog', { enabled: true });
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('DOM.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  return backendPort;
}

async function onboardToIntake() {
  await navigate(appOrigin);
  await waitPath('/sign-in');
  await waitText('PRIVATE BY DESIGN');
  await clickVisible({ text: 'CONTINUE' });
  await waitText('Enter your access code.');
  await fillInput('Six-digit preview code', '720720');
  await clickVisible({ text: 'CONTINUE' });
  await waitPath('/');
  await waitText('START MY PROFILE');
  await clickVisible({ text: 'START MY PROFILE' });
  await waitText('CONTINUE TO HEALTH AREAS');
  await fillInput('Profile display name', 'Casey Synthetic');
  const enteredName = await evaluate("document.querySelector('[aria-label=\\\"Profile display name\\\"]')?.value || ''");
  assert(enteredName === 'Casey Synthetic', `The synthetic profile name was not entered; rendered input value was ${JSON.stringify(enteredName)}.`);
  await clickVisible({ aria: 'Select your country' }).catch(async () => {
    await clickVisible({ aria: 'Country: Malaysia. Change country' });
  });
  await waitText('Choose your country');
  // Text appears as soon as the native-style sheet mounts; let its slide-in settle before tapping a row.
  await delay(400);
  await fillInput('Search countries', 'Malaysia');
  await clickVisible({ text: 'Malaysia' });
  let latestProfileFields = {};
  const completedProfile = await waitFor(async () => {
    const fields = await evaluate("({ name: document.querySelector('[aria-label=\\\"Profile display name\\\"]')?.value || '', country: document.querySelector('[aria-label^=\\\"Country: \\\"]')?.getAttribute('aria-label') || '' })");
    latestProfileFields = fields || {};
    return fields?.name === 'Casey Synthetic' && fields.country === 'Country: Malaysia. Change country' ? fields : false;
  }, 'The required synthetic profile name or selected country was not retained. Current form state: ' + JSON.stringify(latestProfileFields), 10000);
  log('Rendered profile fields after country selection: ' + JSON.stringify(completedProfile));
  await fillInput('Date of birth, required', '1990-05-12');
  await fillInput('Height in centimetres, required', '165');
  await fillInput('Weight in kilograms, required', '58');
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  await waitText('ADD RECORDS OR A NOTE');
  await clickVisible({ text: 'ADD RECORDS OR A NOTE' });
  await waitPath('/setup');
  await clickVisible({ aria: 'Continue to health records' });
  const route = await waitPath('/intake?firstRun=true');
  const sampleShortcutLabels = await evaluate(`([...document.querySelectorAll('[role="button"]')].map((el) => el.getAttribute('aria-label') || '').filter((label) => /sample report|sample policy/i.test(label)))`);
  assert(Array.isArray(sampleShortcutLabels) && sampleShortcutLabels.length === 0, 'A sample shortcut button appeared in the clean first-run intake without being explicitly enabled.');
  record('Synthetic first-run setup reaches health record intake with no topics selected', true, route);
  record('Clean first-run intake hides fictional sample shortcuts unless explicitly enabled', true);
}

async function runRehearsal() {
  await startLocalServices();
  const fixtureContents = {
    'ordinary-retry-report.pdf': '%PDF-1.4\nNURA SYNTHETIC FIXTURE ONLY\nBlood pressure 118/76 mmHg on 2025-02-18\n%%EOF\n',
    'ordinary-cancel-report.pdf': '%PDF-1.4\nNURA SYNTHETIC FIXTURE ONLY\nBlood pressure 121/79 mmHg on 2025-03-02\n%%EOF\n',
    'ordinary-unstarted-report.pdf': '%PDF-1.4\nNURA SYNTHETIC FIXTURE ONLY\nBlood pressure 117/74 mmHg\nReport issued 2025-03-10. This issue date is not a result date.\n%%EOF\n',
    'ordinary-conflict-a-report.pdf': '%PDF-1.4\nNURA SYNTHETIC FIXTURE ONLY\nBlood pressure 124/82 mmHg on 2025-04-15\n%%EOF\n',
    'ordinary-conflict-b-report.pdf': '%PDF-1.4\nNURA SYNTHETIC FIXTURE ONLY\nBlood pressure 129/84 mmHg on 2025-04-15\n%%EOF\n',
  };
  const filePaths = [];
  for (const [name, contents] of Object.entries(fixtureContents)) {
    const path = join(tempRoot, name);
    await writeFile(path, contents, { mode: 0o600 });
    filePaths.push(path);
  }
  const insuranceFixturePath = join(tempRoot, 'ordinary-failed-policy.pdf');
  await writeFile(insuranceFixturePath, '%PDF-1.4\nNURA SYNTHETIC FIXTURE ONLY\nRoom and board limit: SGD 300 per day\n%%EOF\n', { mode: 0o600 });
  const holidayFixturePath = join(tempRoot, 'holiday-itinerary.pdf');
  await writeFile(holidayFixturePath, '%PDF-1.4\nNURA SYNTHETIC FIXTURE ONLY\nHoliday itinerary: Kuala Lumpur to Tokyo\nHotel reservation and sightseeing schedule\n%%EOF\n', { mode: 0o600 });
  record('Health, policy, and wrong-category holiday PDFs contain synthetic text and no personal identifiers', true);

  await onboardToIntake();
  await pickSyntheticFiles(filePaths);
  await waitText('Review these records');
  const stagedFilesBody = await bodyText();
  record('Ordinary PDFs are staged through the app file chooser', ['ordinary-retry-report.pdf', 'ordinary-cancel-report.pdf', 'ordinary-unstarted-report.pdf', 'ordinary-conflict-a-report.pdf', 'ordinary-conflict-b-report.pdf'].every((name) => stagedFilesBody.includes(name)));

  await clickVisible({ text: 'Review these records' });
  await waitPath((value) => value.startsWith('/review'));
  await clickVisible({ aria: 'Review 5 files with Nura' });
  await waitText('Read these health files?');
  const firstConsent = await bodyText();
  assert(['ordinary-retry-report.pdf', 'ordinary-cancel-report.pdf', 'ordinary-unstarted-report.pdf', 'ordinary-conflict-a-report.pdf', 'ordinary-conflict-b-report.pdf'].every((name) => firstConsent.includes(name)), 'Consent did not name every staged synthetic PDF.');
  assert(firstConsent.includes('category-only check first') && firstConsent.includes('If it is uncertain or seems different, detail reading pauses') && firstConsent.includes('Each file gets its own review.'), 'Consent did not explain category-first processing and the mismatch pause.');
  assert(!firstConsent.includes('No AI provider is called for these samples.'), 'Ordinary files were incorrectly described as local samples.');
  record('One explicit consent names all ordinary PDFs and identifies connected-service processing', true);

  await clickVisible({ text: 'Approve and review selected files' });
  await waitText('Needs another try', 60000);
  await waitFor(async () => (await readLines(providerLogPath)).some((item) => item.filename === 'ordinary-cancel-report.pdf' && item.attempt === 1 && item.outcome === 'delayed-until-user-stop'), 'The deterministic delayed synthetic extraction did not start.', 60000);
  await waitText('STOP', 15000);
  const beforeStop = await bodyText();
  assert(beforeStop.includes('ordinary-retry-report.pdf') && beforeStop.includes('Needs another try'), 'The first failed file was not retained as retryable before cancellation.');
  record('Synthetic service failure is visible and the original PDF remains staged for retry', true);

  await clickVisible({ aria: 'Stop file review' });
  await waitText('Reading stopped at your request', 30000);
  await waitText('Stopped', 30000);
  const afterStop = await bodyText();
  assert(afterStop.includes('ordinary-unstarted-report.pdf') && afterStop.includes('Ready'), 'The file after the cancelled request did not remain unstarted and ready.');
  assert(afterStop.includes('ordinary-conflict-a-report.pdf') && afterStop.includes('ordinary-conflict-b-report.pdf'), 'Conflict fixtures did not remain staged after Stop.');
  await waitFor(async () => (await readLines(providerLogPath)).some((item) => item.filename === 'ordinary-cancel-report.pdf' && item.attempt === 1 && item.outcome === 'aborted-after-stop'), 'The synthetic provider shim did not observe the app cancellation signal.', 30000);
  const firstAttempts = await readLines(providerLogPath);
  assert(!firstAttempts.some((item) => ['ordinary-unstarted-report.pdf', 'ordinary-conflict-a-report.pdf', 'ordinary-conflict-b-report.pdf'].includes(item.filename)), 'A file after cancellation unexpectedly reached extraction.');
  record('Stop aborts the active synthetic request and leaves the next file unstarted', true);

  await clickVisible({ aria: 'Review 5 files with Nura' });
  await waitText('Read these health files?');
  const retryConsent = await bodyText();
  assert(['ordinary-retry-report.pdf', 'ordinary-cancel-report.pdf', 'ordinary-unstarted-report.pdf', 'ordinary-conflict-a-report.pdf', 'ordinary-conflict-b-report.pdf'].every((name) => retryConsent.includes(name)), 'Retry did not present a fresh consent sheet naming all still-unprocessed files.');
  await clickVisible({ text: 'Approve and review selected files' });
  await waitText('Blood pressure', 60000);
  await waitText('117/74', 60000);
  await waitText('129/84', 60000);
  await waitFor(async () => {
    const text = await bodyText();
    return text.includes('Document reading complete') && text.includes('117/74');
  }, 'The second approved batch did not complete with the synthetic candidate results.', 60000);
  await waitFor(async () => {
    const text = await bodyText();
    const activeStop = await evaluate('Boolean(document.querySelector("[aria-label=\\\"Stop file review\\\"]"))');
    return text.includes('Files ready to review') && !activeStop ? text : false;
  }, 'Finished file processing did not settle into a review state.', 15000);
  const settledActivity = await bodyText();
  assert(!settledActivity.includes('Nura is reading 5 files') && !settledActivity.includes('LIVE FILE CHECKS') && (settledActivity.match(/FILE REVIEW ACTIVITY/g) || []).length === 1, 'Completed processing still looks active or repeats the activity panel.');
  record('Processing settles into one static source-linked activity summary', true);

  await clickVisible({ aria: 'Open ordinary-retry-report.pdf' });
  await waitText('118/76', 15000);
  await waitText('Needs review', 15000);
  const reviewBody = await bodyText();
  assert(reviewBody.includes('Needs review'), 'Connected extraction candidates were not visibly marked as pending review.');
  const pendingLabel = await evaluate('([...document.querySelectorAll("[role=button]")].map((el)=>el.getAttribute("aria-label")||"").find((label)=>label.includes("118/76")&&label.includes("Needs review")))||""');
  assert(Boolean(pendingLabel), 'The app did not expose the successful extraction as a pending candidate.');
  record('Successful ordinary extraction appears as a source-linked candidate requiring review', true);

  const repository = await waitFor(readRepository, 'The local synthetic repository was not persisted.', 10000);
  const retrySource = repository.sources.find((item) => item.displayName === 'ordinary-retry-report.pdf');
  const cancelSource = repository.sources.find((item) => item.displayName === 'ordinary-cancel-report.pdf');
  const unstartedSource = repository.sources.find((item) => item.displayName === 'ordinary-unstarted-report.pdf');
  const conflictSourceA = repository.sources.find((item) => item.displayName === 'ordinary-conflict-a-report.pdf');
  const conflictSourceB = repository.sources.find((item) => item.displayName === 'ordinary-conflict-b-report.pdf');
  assert(retrySource && cancelSource && unstartedSource && conflictSourceA && conflictSourceB, 'Expected all five synthetic report sources.');
  assert([retrySource, cancelSource, unstartedSource, conflictSourceA, conflictSourceB].every((item) => item.processingMode === 'connected_ai_provider'), 'Ordinary file processing was not recorded as connected-service mode.');
  assert(repository.claims.length === 5 && repository.claims.every((claim) => claim.evidenceState === 'needs_review'), 'One or more extracted candidates were accepted or missing.');
  assert(repository.assertions.length === 0, 'A candidate was written to accepted profile memory without user approval.');
  assert(repository.claims.every((claim) => repository.sources.some((source) => source.id === claim.sourceId)), 'An extracted candidate lost its source link.');
  record('Service repository contains five source-linked pending candidates and zero accepted assertions', true);

  await waitPath((value) => value.startsWith('/review'));
  await clickVisible({ aria: 'Open ordinary-retry-report.pdf' });
  await waitText('118/76', 15000);
  await waitText('Different values for the same date', 45000);
  await waitText('Different values · date needs checking', 45000);
  const crossSourceReview = await bodyText();
  assert(crossSourceReview.includes('Blood pressure · 124/82 mmhg / 129/84 mmhg · Result date 2025-04-15'), 'The same-date conflicting values were not shown together with their shared result date.');
  assert(crossSourceReview.includes('ordinary-conflict-a-report.pdf') && crossSourceReview.includes('ordinary-conflict-b-report.pdf'), 'The conflict review did not preserve links to both original reports.');
  assert(crossSourceReview.includes('Check each value against its report before keeping it.'), 'The conflict was not explained as two source-backed values requiring separate review.');
  assert(crossSourceReview.includes('One result has no date. Check both reports before deciding whether these are separate results.'), 'A differing value with a missing event date was not flagged for date review.');
  record('Cross-file review flags same-date differences and date-uncertain values without merging suggestions', true);

  await clickVisible({ aria: 'Open ordinary-unstarted-report.pdf' });
  await waitText('117/74', 15000);
  const missingDateClaimLabel = await evaluate('([...document.querySelectorAll("[role=button]")].map((el)=>el.getAttribute("aria-label")||"").find((label)=>label.includes("117/74")&&label.includes("Needs review")))||""');
  assert(missingDateClaimLabel, 'Could not identify the synthetic claim whose event date was omitted.');
  await clickVisible({ aria: missingDateClaimLabel });
  const missingDateReview = await bodyText();
  assert(missingDateReview.includes('Not stated in report'), 'The event date was not shown as unknown.');
  assert(missingDateReview.includes('ABOUT THIS REPORT') && missingDateReview.includes('DETAILS +') && !missingDateReview.includes('2025-03-10'), 'Report metadata was not kept collapsed in the initial claim review.');
  await clickVisible({ aria: 'Show report details' });
  const expandedMissingDateReview = await bodyText();
  assert(expandedMissingDateReview.includes('Not stated in report') && expandedMissingDateReview.includes('Report date') && expandedMissingDateReview.includes('2025-03-10'), 'The unknown result date and distinct report date were not shown separately on request.');
  const sourceWithUnknownDate = repository.sources.find((item) => item.id === unstartedSource.id);
  const unknownDateClaim = repository.claims.find((claim) => claim.sourceId === unstartedSource.id);
  assert(unknownDateClaim?.effectiveAt === null, 'The server filled the missing event date from another source date.');
  assert(sourceWithUnknownDate?.documentContext?.dates?.some((item) => item.kind === 'report_date' && item.value === '2025-03-10'), 'The report date was not retained as separate document context.');
  record('Missing event date remains unknown while the distinct report date stays source context', true);

  await clickVisible({ aria: 'Open ordinary-retry-report.pdf' });
  await waitText('118/76', 15000);
  const acceptedClaimLabel = await evaluate('([...document.querySelectorAll("[role=button]")].map((el)=>el.getAttribute("aria-label")||"").find((label)=>label.includes("118/76")&&label.includes("Needs review")))||""');
  assert(acceptedClaimLabel, 'Could not identify the pending 118/76 claim in the ordinary report review.');
  await clickVisible({ aria: acceptedClaimLabel });
  await clickVisible({ aria: 'Include: Blood pressure' });
  assert((await bodyText()).includes('Marked to add when you save this review.'), 'The 118/76 suggestion was not staged for acceptance.');

  await clickVisible({ aria: 'Open ordinary-cancel-report.pdf' });
  await waitText('121/79', 15000);
  const dismissedClaimLabel = await evaluate('([...document.querySelectorAll("[role=button]")].map((el)=>el.getAttribute("aria-label")||"").find((label)=>label.includes("121/79")&&label.includes("Needs review")))||""');
  assert(dismissedClaimLabel, 'Could not identify the pending 121/79 claim in the cancelled-then-retried report.');
  await clickVisible({ aria: dismissedClaimLabel });
  await clickVisible({ aria: 'Dismiss Blood pressure' });
  assert((await bodyText()).includes('Marked to dismiss when you save this review.'), 'The 121/79 suggestion was not staged for dismissal.');

  await clickVisible({ aria: 'Open ordinary-unstarted-report.pdf' });
  await waitText('117/74', 15000);
  const pendingClaimLabel = await evaluate('([...document.querySelectorAll("[role=button]")].map((el)=>el.getAttribute("aria-label")||"").find((label)=>label.includes("117/74")&&label.includes("Needs review")))||""');
  assert(pendingClaimLabel, 'The untouched 117/74 suggestion did not remain pending.');

  await clickVisible({ aria: 'Open ordinary-conflict-a-report.pdf' });
  await waitText('124/82', 15000);
  const conflictClaimALabel = await evaluate('([...document.querySelectorAll("[role=button]")].map((el)=>el.getAttribute("aria-label")||"").find((label)=>label.includes("124/82")&&label.includes("Needs review")))||""');
  assert(conflictClaimALabel, 'The first same-date conflict suggestion did not remain independently pending.');
  await clickVisible({ aria: 'Open ordinary-conflict-b-report.pdf' });
  await waitText('129/84', 15000);
  const conflictClaimBLabel = await evaluate('([...document.querySelectorAll("[role=button]")].map((el)=>el.getAttribute("aria-label")||"").find((label)=>label.includes("129/84")&&label.includes("Needs review")))||""');
  assert(conflictClaimBLabel, 'The second same-date conflict suggestion did not remain independently pending.');
  const queueBeforeSave = await bodyText();
  assert(queueBeforeSave.includes('2 ITEMS READY TO SAVE') && queueBeforeSave.includes('Only the choices you select will be saved. Suggestions left undecided stay pending.'), 'The review queue does not show two staged choices and leave untouched suggestions pending.');
  record('Review stages one accept and one dismissal while both conflict results and the undated result remain pending', true);

  await clickVisible({ aria: 'Save 2 reviewed items' });
  await waitText('2 reviewed items saved to your health record.', 30000);
  await waitText('3 other suggestions remain pending and was not added.', 15000);
  record('One explicit review save accepts and dismisses only the staged suggestions', true);

  const savedRepository = await waitFor(async () => {
    const current = await readRepository();
    const statesByName = Object.fromEntries(current.claims.map((claim) => [current.sources.find((source) => source.id === claim.sourceId)?.displayName, claim.evidenceState]));
    return statesByName['ordinary-retry-report.pdf'] === 'user_confirmed'
      && statesByName['ordinary-cancel-report.pdf'] === 'rejected'
      && statesByName['ordinary-unstarted-report.pdf'] === 'needs_review'
      && statesByName['ordinary-conflict-a-report.pdf'] === 'needs_review'
      && statesByName['ordinary-conflict-b-report.pdf'] === 'needs_review'
      ? current : false;
  }, 'The repository did not persist one accepted, one dismissed and three pending candidates.', 15000);
  assert(savedRepository.assertions.length === 1, 'The explicit review save did not create exactly one accepted source assertion.');
  const acceptedAssertion = savedRepository.assertions[0];
  const acceptedSource = savedRepository.sources.find((source) => source.displayName === 'ordinary-retry-report.pdf');
  assert(acceptedSource && acceptedAssertion.sourceId === acceptedSource.id, 'The accepted assertion lost its original report source.');
  record('Repository persists exactly one accepted assertion with its source; dismissal and untouched claim remain distinct', true);

  await clickVisible({ text: 'Continue profile setup' });
  await waitPath('/setup');
  const setupWithPendingReviews = await bodyText();
  assert(setupWithPendingReviews.includes('Health records') && setupWithPendingReviews.includes('Files ready to review'), 'Setup did not keep unresolved health suggestions in the records step.');
  record('Profile setup keeps the records step active while three suggestions remain undecided', true);
  await clickVisible({ text: 'Review health records' });
  await waitPath('/review?purpose=medical&firstRun=true');
  const reviewUrl = await evaluate('location.href');
  await navigate(reviewUrl);
  await waitPath('/review?purpose=medical&firstRun=true');
  await waitText('ordinary-retry-report.pdf', 15000);
  await clickVisible({ text: 'Open ordinary-retry-report.pdf' });
  await waitText('118/76', 15000);
  const reloadedReview = await bodyText();
  assert(reloadedReview.includes('In your record') && reloadedReview.includes('ordinary-retry-report.pdf'), 'The accepted source-linked result did not survive a full review-page reload.');
  record('Accepted source-linked review survives reload while undecided suggestions keep setup at records', true);

  await waitText('Continue setup · 3 left for later', 15000);
  const deferNotice = await bodyText();
  assert(deferNotice.includes('will not be added to your profile until you approve them'), 'The continue action did not explain that pending suggestions stay out of the profile.');
  await clickVisible({ text: 'Continue setup · 3 left for later' });
  await waitPath('/setup');
  const deferredSetup = await bodyText();
  assert(deferredSetup.includes('LEFT FOR LATER') && deferredSetup.includes('Source suggestions remain for later'), 'Deferring suggestions did not preserve a visible pending state.');
  await clickVisible({ text: 'Continue to medicines' });
  await waitPath('/treatment?firstRun=true');
  await waitText('I take no current medicines');
  await clickVisible({ text: 'I take no current medicines' });
  await waitPath('/setup');
  await clickVisible({ text: 'Continue to insurance' });
  await waitPath('/insurance?firstRun=true');
  await clickVisible({ text: 'Add a policy document' });
  await waitPath('/intake?purpose=insurance&firstRun=true');
  await pickSyntheticFiles([insuranceFixturePath]);
  await waitText('Review these records');
  await clickVisible({ text: 'Review these records' });
  await waitPath((path) => path.startsWith('/review?purpose=insurance'));
  await clickVisible({ aria: 'Review this file with Nura' });
  await waitText('Read these policy files?');
  const policyConsent = await bodyText();
  assert(policyConsent.includes('ordinary-failed-policy.pdf') && policyConsent.includes('category-only check first') && policyConsent.includes('detail reading pauses'), 'Policy consent did not identify the selected file and explain the category-first processing pause.');
  await clickVisible({ text: 'Approve and review selected files' });
  await waitText('Some files need another try');
  const failedPolicyReview = await bodyText();
  assert(failedPolicyReview.includes('ordinary-failed-policy.pdf') && failedPolicyReview.includes('Could not finish; you can try again') && failedPolicyReview.includes('Continue profile setup'), 'An unreadable policy did not show a retryable failure and a route back into setup.');
  record('Unreadable insurance file shows its failure and leaves a clear route back to setup', true);
  await clickVisible({ text: 'Continue profile setup' });
  await waitPath('/setup');
  const failedPolicySetup = await bodyText();
  assert(failedPolicySetup.includes('Insurance') && failedPolicySetup.includes('Leave policy file for later'), 'Setup did not offer to defer the unprocessed policy without marking it reviewed.');
  await clickVisible({ text: 'Leave policy file for later' });
  await waitText('Policy source saved for later');
  await waitPath('/setup');
  await waitText('FINISH SETUP');
  const finalReview = await bodyText();
  assert(finalReview.includes('Pending source review') && finalReview.includes('not part of your profile') && finalReview.includes('Pending policy review') && finalReview.includes('No policy terms were added'), 'Final review did not disclose deferred, unapproved health and policy sources.');
  await clickVisible({ text: 'FINISH SETUP' });
  await waitPath((path) => path.includes('home'));
  const homeAfterSetup = await bodyText();
  assert(homeAfterSetup.includes('Source reviews to finish') && homeAfterSetup.includes('Health records') && homeAfterSetup.includes('Unreviewed suggestions remain') && homeAfterSetup.includes('Insurance') && homeAfterSetup.includes('Policy terms remain unreviewed'), 'Home did not provide return paths to deferred health and policy reviews.');
  const homeUrl = await evaluate('location.href');
  await navigate(homeUrl);
  await waitPath((path) => path.includes('home'));
  await waitText('Source reviews to finish');
  record('Fresh setup advances through steps 4–6; deferred status and Home return reminder survive refresh', true);

  const deferredRepository = await readRepository();
  assert(!deferredRepository.claims.some((claim) => deferredRepository.sources.find((source) => source.id === claim.sourceId)?.displayName === 'ordinary-failed-policy.pdf'), 'A failed policy extraction created a policy claim before retry.');
  record('Failed policy stays source-only and creates no terms before retry', true);

  await clickVisible({ text: 'Review pending health records' });
  await waitPath('/review?purpose=medical');
  await waitText('ordinary-unstarted-report.pdf');
  await clickVisible({ text: 'Open ordinary-unstarted-report.pdf' });
  await waitText('Needs review');
  const reopenedDeferredReview = await bodyText();
  assert(reopenedDeferredReview.includes('Blood pressure') && reopenedDeferredReview.includes('Needs review'), 'Home did not reopen the still-pending source suggestions.');
  await clickVisible({ text: 'Go back' });
  await waitPath((path) => path.includes('home'));
  record('The Home reminder reopens the deferred source queue without changing its claim status', true);

  await clickVisible({ aria: 'Review pending insurance' });
  await waitPath('/review?purpose=insurance');
  await waitText('ordinary-failed-policy.pdf');
  const reopenedPolicy = await bodyText();
  assert(reopenedPolicy.includes('Ready') || reopenedPolicy.includes('Needs another try'), 'The deferred policy source could not be reopened from Home.');
  record('The Home reminder reopens the deferred failed policy source for a later retry', true);
  await clickVisible({ aria: 'Review this file with Nura' });
  await waitText('Read these policy files?');
  const policyRetryConsent = await bodyText();
  assert(policyRetryConsent.includes('ordinary-failed-policy.pdf') && policyRetryConsent.includes('Suggestions stay pending until you choose what to save.'), 'Retry consent did not identify the policy source and preserve user control over saving.');
  await clickVisible({ text: 'Approve and review selected files' });
  await waitText('Room and board limit');
  await waitText('SGD 300 per day');
  await waitText('Files ready to review');
  await clickVisible({ text: 'Review details' });
  await clickVisible({ aria: 'View source wording for Room and board limit, page 1' });
  const pendingPolicyTerm = await bodyText();
  assert(pendingPolicyTerm.includes('Room and board limit: SGD 300 per day') && pendingPolicyTerm.includes('Needs review'), 'The retried policy did not produce an exact-quote term that remains pending approval.');
  record('Retry after service recovery shows the quoted policy term as unapproved evidence', true);
  await clickVisible({ aria: 'Include policy term: Room and board limit' });
  await waitText('Included in save');
  await clickVisible({ text: 'Save reviewed items' });
  await waitText('1 reviewed item saved to your Insurance Registry.');
  await clickVisible({ text: 'Open Insurance Registry' });
  await waitPath('/insurance');
  await waitText('Room and board limit');
  const savedPolicyRegistry = await bodyText();
  const dossierHeadingIndex = savedPolicyRegistry.indexOf('Policy dossier');
  const overviewHeadingIndex = savedPolicyRegistry.indexOf('Coverage details');
  assert(savedPolicyRegistry.includes('SGD 300 per day') && savedPolicyRegistry.includes('VIEW SOURCE QUOTE') && savedPolicyRegistry.includes('Review original'), 'The accepted policy term did not appear in the reference-matched dossier with its evidence and original-source actions.');
  assert(dossierHeadingIndex >= 0 && overviewHeadingIndex > dossierHeadingIndex && savedPolicyRegistry.includes('Policy summary') && savedPolicyRegistry.includes('Explicit exclusions') && savedPolicyRegistry.includes('Missing details'), 'The Insurance Registry dossier must show policy summary, coverage, exclusions and missing details in the requested order.');
  const dossierVisible = await evaluate(`(() => { const dossier = document.querySelector('[data-testid="policy-dossier"]'); dossier?.scrollIntoView({ block: 'start', behavior: 'instant' }); return Boolean(dossier); })()`);
  assert(dossierVisible, 'Could not locate the rendered policy dossier for visual inspection.');
  await delay(250);
  const dossierScreenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(policyDossierScreenshotPath, Buffer.from(dossierScreenshot.data, 'base64'), { mode: 0o600 });
  record('Captured the selected Policy Dossier layout from the rendered mobile registry', true, policyDossierScreenshotPath);
  const dossierDetailsVisible = await evaluate(`(() => { const target = [...document.querySelectorAll('*')].find((node) => node.children.length === 0 && node.textContent?.trim() === 'All approved policy details'); if (!target) return false; target.scrollIntoView({ block: 'end', behavior: 'instant' }); return true; })()`);
  assert(dossierDetailsVisible, 'Could not locate the lower policy dossier details for visual inspection.');
  await delay(150);
  const dossierDetailsScreenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(policyDossierDetailsScreenshotPath, Buffer.from(dossierDetailsScreenshot.data, 'base64'), { mode: 0o600 });
  record('Captured the lower missing-detail and approved-term sections from the rendered mobile dossier', true, policyDossierDetailsScreenshotPath);
  record('Insurance Registry renders the reference-matched dossier with policy summary, coverage, exclusions, missing fields and source actions', true);
  if (askEnabled) await runOrdinaryUploadAskJourney();
  await navigate(homeUrl);
  await waitPath((path) => path.includes('home'));

  const afterSetupRepository = await readRepository();
  const afterSetupStates = Object.fromEntries(afterSetupRepository.claims.map((claim) => [afterSetupRepository.sources.find((source) => source.id === claim.sourceId)?.displayName, claim.evidenceState]));
  assert(afterSetupStates['ordinary-retry-report.pdf'] === 'user_confirmed'
    && afterSetupStates['ordinary-cancel-report.pdf'] === 'rejected'
    && afterSetupStates['ordinary-unstarted-report.pdf'] === 'needs_review'
    && afterSetupStates['ordinary-conflict-a-report.pdf'] === 'needs_review'
    && afterSetupStates['ordinary-conflict-b-report.pdf'] === 'needs_review', 'Deferring suggestions changed their source review decisions.');
  const savedPolicyClaim = afterSetupRepository.claims.find((claim) => afterSetupRepository.sources.find((source) => source.id === claim.sourceId)?.displayName === 'ordinary-failed-policy.pdf');
  assert(savedPolicyClaim?.kind === 'coverage_term' && savedPolicyClaim.evidenceState === 'user_confirmed' && savedPolicyClaim.sourceLocation?.quote === 'Room and board limit: SGD 300 per day', 'The retried policy term was not saved as an approved, source-quoted coverage claim.');
  assert(afterSetupRepository.assertions.length === 2, 'Health and policy review did not create exactly two user-approved assertions.');
  record('Deferral preserves health decisions; only the explicitly approved policy quote becomes an Insurance Registry claim', true);

  const attempts = await readLines(providerLogPath);
  const retryAttempts = attempts.filter((item) => item.filename === 'ordinary-retry-report.pdf' && !item.purposeOnly);
  const cancelAttempts = attempts.filter((item) => item.filename === 'ordinary-cancel-report.pdf' && !item.purposeOnly);
  const untouchedAttempts = attempts.filter((item) => item.filename === 'ordinary-unstarted-report.pdf' && !item.purposeOnly);
  const conflictAAttempts = attempts.filter((item) => item.filename === 'ordinary-conflict-a-report.pdf' && !item.purposeOnly);
  const conflictBAttempts = attempts.filter((item) => item.filename === 'ordinary-conflict-b-report.pdf' && !item.purposeOnly);
  const policyAttempts = attempts.filter((item) => item.filename === 'ordinary-failed-policy.pdf' && !item.purposeOnly);
  assert(retryAttempts.map((item) => item.outcome).join(',') === 'synthetic-service-failure,synthetic-success', 'The failed file did not retry successfully after fresh consent.');
  assert(cancelAttempts.some((item) => item.outcome === 'aborted-after-stop') && cancelAttempts.some((item) => item.attempt === 2 && item.outcome === 'synthetic-success'), 'The cancelled file was not safely retried after fresh consent.');
  assert(untouchedAttempts.length === 1 && untouchedAttempts[0].outcome === 'synthetic-success', 'The previously unstarted file was not processed exactly once after fresh consent.');
  assert(conflictAAttempts.length === 1 && conflictAAttempts[0].outcome === 'synthetic-success', 'The first conflict fixture was not processed exactly once.');
  assert(conflictBAttempts.length === 1 && conflictBAttempts[0].outcome === 'synthetic-success', 'The second conflict fixture was not processed exactly once.');
  assert(policyAttempts.map((item) => item.outcome).join(',') === 'synthetic-service-failure,synthetic-success', 'The failed policy did not succeed exactly once after its user-approved retry.');
  for (const filename of [...Object.keys(fixtureContents), 'ordinary-failed-policy.pdf']) {
    const fileCalls = attempts.filter((item) => item.filename === filename);
    const categoryCheckIndex = fileCalls.findIndex((item) => item.purposeOnly && item.outcome === 'category-only-check');
    const firstDetailIndex = fileCalls.findIndex((item) => !item.purposeOnly);
    // A successful category assessment remains valid for this unchanged source
    // across a retry. The invariant is that no detail request starts before it.
    assert(categoryCheckIndex >= 0 && (firstDetailIndex < 0 || categoryCheckIndex < firstDetailIndex), `${filename} must pass a category-only check before any detail-extraction request`);
  }
  assert(attempts.every((item) => item.contentMatches), 'The fake provider received bytes other than the expected deterministic synthetic PDFs.');
  record('In-memory provider trace proves category-first checks, fail/retry, stop/retry, and no skipped or extra requests', true, attempts.length + ' synthetic requests; no PDF bytes were written to logs');

  if (askEnabled) {
    const askEvents = await readLines(askLogPath);
    assert(askEvents.length === 2 && askEvents[0].stage === 'profile_search_requested' && askEvents[1].stage === 'grounded_response_returned', 'The ordinary-upload Ask path did not perform one synthetic retrieval and one grounded response.');
    assert(askEvents[1].titles.includes('Room and board limit') && askEvents[1].titles.includes('Blood pressure'), 'The synthetic Ask response did not use the exact uploaded policy and health evidence.');
    assert((await readFile(blockedEgressPath, 'utf8').catch(() => '')).trim() === '', 'The connected ordinary-upload Ask rehearsal attempted external network egress.');
    record('Ordinary-upload Ask uses two synthetic model steps and zero external provider requests', true);
  }

  await navigate(`${appOrigin}/intake?purpose=insurance`);
  await waitPath('/intake?purpose=insurance');
  await pickSyntheticFiles([holidayFixturePath]);
  await clickVisible({ text: 'Review this intake' });
  await waitPath((value) => value.startsWith('/review?purpose=insurance'));
  await clickVisible({ aria: 'Review this file with Nura' });
  await waitText('Read these policy files?');
  const holidayConsent = await bodyText();
  assert(holidayConsent.includes('holiday-itinerary.pdf') && holidayConsent.includes('category-only check first') && holidayConsent.includes('detail reading pauses'), 'The wrong-category upload consent did not explain the two-stage check.');
  await clickVisible({ text: 'Approve and review selected files' });
  await waitText('Check this file category', 30_000);
  await waitText('travel document');
  const pausedReview = await bodyText();
  assert(pausedReview.includes('No details have been extracted or added.') && pausedReview.includes('Continue as insurance policy') && pausedReview.includes('Remove wrong file'), 'The wrong travel document did not pause with clear confirm-or-remove choices and no extracted details.');
  const warningVisible = await evaluate(`(() => { const heading = [...document.querySelectorAll('*')].find((el) => el.children.length === 0 && el.textContent?.trim() === 'Check this file category'); heading?.scrollIntoView({ block: 'start', behavior: 'instant' }); return Boolean(heading); })()`);
  assert(warningVisible, 'Could not locate the rendered category warning for visual capture.');
  await delay(250);
  const wrongCategoryScreenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(wrongCategoryScreenshotPath, Buffer.from(wrongCategoryScreenshot.data, 'base64'), { mode: 0o600 });
  record('Captured the rendered mobile wrong-category screen for visual inspection', true, wrongCategoryScreenshotPath);
  const holidayBeforeRemoval = await readRepository();
  const holidaySource = holidayBeforeRemoval.sources.find((source) => source.displayName === 'holiday-itinerary.pdf');
  assert(holidaySource?.state === 'purpose_confirmation_required' && !holidayBeforeRemoval.claims.some((claim) => claim.sourceId === holidaySource.id), 'The paused holiday source must have no extracted or saved claims.');
  const holidayAttempts = (await readLines(providerLogPath)).filter((item) => item.filename === 'holiday-itinerary.pdf');
  assert(JSON.stringify(holidayAttempts.map((item) => [item.purposeOnly, item.outcome])) === JSON.stringify([[true, 'category-only-check']]), 'The holiday document must receive only the category pass until the user confirms.');
  await waitText('Files ready to review', 15000);
  await clickVisible({ text: 'Remove wrong file' });
  await waitText('Remove this file and its local extraction from Nura?');
  await clickVisible({ text: 'Remove file' });
  await waitText('The file and any extracted details have been removed from this device and the local review service.');
  const holidayAfterRemoval = await readRepository();
  assert(!holidayAfterRemoval.sources.some((source) => source.displayName === 'holiday-itinerary.pdf') && !holidayAfterRemoval.claims.some((claim) => claim.sourceId === holidaySource.id), 'Removing the wrong-category file must remove its local source and leave no claims.');
  record('Wrong insurance document is classified, paused before details, and removable from the review screen', true, 'travel_document detected; zero detail calls before removal');

  const allowedOrigins = new Set([appOrigin, serviceOrigin]);
  const externalOrigins = [...networkOrigins].filter((origin) => !allowedOrigins.has(origin));
  assert(externalOrigins.length === 0, 'The browser attempted an unexpected external origin: ' + externalOrigins.join(', '));
  assert(networkFailures.every((failure) => failure.toLowerCase().includes('abort') || failure.toLowerCase().includes('canceled') || failure.toLowerCase().includes('cancelled')), 'Unexpected browser network failure was observed: ' + networkFailures.join(', '));
  assert(browserExceptions.length === 0, 'Browser exceptions were observed: ' + browserExceptions.join(' | '));
  const blocked = await readLines(blockedEgressPath);
  assert(blocked.length === 0, 'A third-party request escaped the synthetic provider interception.');
  record('No browser exception or third-party HTTP request occurred', true, [...networkOrigins].join(', '));
}

async function cleanup() {
  if (browser && browser.readyState === WebSocket.OPEN) { try { browser.close(); } catch { /* best effort */ } }
  for (const child of childProcesses.slice().reverse()) {
    if (!child.proc.killed && !child.exit) {
      child.proc.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => child.proc.once('exit', resolve)), delay(2500)]);
      if (!child.exit) child.proc.kill('SIGKILL');
    }
  }
  await rm(tempRoot, { recursive: true, force: true });
}

try {
  log('Starting isolated ordinary-upload browser rehearsal.');
  log('All profile and report data are synthetic. No dotenv file or API credential is read or inherited.');
  await runRehearsal();
} catch (error) {
  failures.push({ name: 'Rehearsal stopped safely', detail: error instanceof Error ? error.message : String(error) });
  log('FAIL Rehearsal stopped safely — ' + (error instanceof Error ? error.message : String(error)));
  try { log('Current route: ' + await evaluate('location.pathname + location.search') + '\nVisible page text: ' + (await bodyText()).slice(-4500)); } catch { /* browser may not be connected */ }
  if (askEnabled) log('Synthetic Ask trace: ' + JSON.stringify(await readLines(askLogPath)));
  if (askEnabled) log('Blocked provider egress trace: ' + JSON.stringify(await readLines(blockedEgressPath)));
  if (askEnabled) {
    const responses = [];
    for (const response of runResponses.slice(-3)) {
      try {
        const body = await cdp('Network.getResponseBody', { requestId: response.requestId });
        const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body;
        const messages = [...text.matchAll(/data:\s*(\{[^\n]+\})/g)].map((match) => {
          try { const parsed = JSON.parse(match[1]); return parsed.type === 'run_error' ? parsed.message : parsed.type; } catch { return 'unreadable-event'; }
        });
        responses.push({ status: response.status, messages });
      } catch (error) { responses.push({ status: response.status, bodyUnavailable: error instanceof Error ? error.message : String(error) }); }
    }
    log('Ask run transport diagnostics: ' + JSON.stringify(responses));
  }
  for (const child of childProcesses) log('\n[' + child.label + ' stdout]\n' + tail(child.stdout) + '\n[' + child.label + ' stderr]\n' + tail(child.stderr));
} finally {
  await cleanup();
}

log('\nM1 connected-upload rehearsal ' + (failures.length ? 'FAIL' : 'PASS') + ': ' + (checks.length - failures.length) + ' passed, ' + failures.length + ' failed.');
if (failures.length) process.exitCode = 1;
