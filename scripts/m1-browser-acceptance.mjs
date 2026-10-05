#!/usr/bin/env node
/**
 * Isolated M1 browser rehearsal, with an optional --ask synthetic-model journey.
 * Uses Node's built-in WebSocket and a disposable headless Chrome profile.
 * No app preview data or .env file is read; Ask mode intercepts and blocks all external requests.
 */
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';

const root = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'nura-m1-browser-'));
const repositoryDir = join(temporaryRoot, 'synthetic-repository');
const chromeProfile = join(temporaryRoot, 'chrome-profile');
const askEnabled = process.argv.includes('--ask');
const syntheticModelAdapterPath = join(temporaryRoot, 'synthetic-ask-model.mjs');
const syntheticModelLogPath = join(temporaryRoot, 'synthetic-ask-model.jsonl');
const blockedModelNetworkLogPath = join(temporaryRoot, 'blocked-model-network.jsonl');
const childProcesses = [];
const failures = [];
const passed = [];
const outputLimit = 45_000;
const outputs = new Map();
let keepArtifacts = process.argv.includes('--keep');
let browser;
let sessionId;
let sequence = 0;
let pending = new Map();
const cdpTrace = [];
const cdpTargetEvents = [];
const cdpTraceLimit = 24;
let browserTransport = { state: 'not connected', close: null, error: null };
let chromeProcessExit = null;
let requestOrigins = new Set();
let requestURLs = [];
let requestById = new Map();
let requestState = new Map();
let browserNetworkFailures = [];
let browserExceptions = [];
let appOrigin;
let serviceOrigin;

function log(text) { process.stdout.write(`${text}\n`); }
function record(name, ok = true, detail = '') {
  const entry = { name, detail };
  (ok ? passed : failures).push(entry);
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function trimOutput(value) { return value.slice(-outputLimit); }

function pushBounded(list, entry) {
  list.push(entry);
  if (list.length > cdpTraceLimit) list.shift();
}

function chromeProcessState() {
  const child = childProcesses.find((item) => item.label === 'chrome');
  return child ? { pid: child.proc.pid ?? null, killed: child.proc.killed, exit: child.exit ?? chromeProcessExit } : null;
}

function cdpDiagnostic(timedOut) {
  return {
    socketReadyState: browser?.readyState ?? null,
    transport: browserTransport,
    chrome: chromeProcessState(),
    timedOut: { id: timedOut.id, method: timedOut.method, context: timedOut.context || null, ageMs: Date.now() - timedOut.sentAt },
    pending: [...pending.values()].map((command) => ({ id: command.id, method: command.method, context: command.context || null, ageMs: Date.now() - command.sentAt })),
    recentCommands: cdpTrace.slice(-12).map(({ id, method, context, status, sentAt, finishedAt, error }) => ({ id, method, context: context || null, status, elapsedMs: finishedAt ? finishedAt - sentAt : Date.now() - sentAt, ...(error ? { error } : {}) })),
    recentTargetEvents: cdpTargetEvents.slice(-6),
  };
}

function settlePendingCdp(error) {
  for (const [id, command] of pending) {
    clearTimeout(command.timer);
    pending.delete(id);
    command.status = 'transport-error';
    command.error = error.message;
    command.finishedAt = Date.now();
    pushBounded(cdpTrace, command);
    command.reject(error);
  }
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function safeChildEnv(extra) {
  // Deliberately do not inherit provider credentials or Expo dotenv behavior.
  const env = {
    PATH: process.env.PATH || `/usr/bin${delimiter}/bin`,
    HOME: process.env.HOME || tmpdir(),
    TMPDIR: process.env.TMPDIR || tmpdir(),
    LANG: process.env.LANG || 'en_US.UTF-8',
    NODE_ENV: 'development',
    EXPO_NO_DOTENV: '1',
    EXPO_OFFLINE: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_NO_WEB_SETUP: '1',
    OPENAI_API_KEY: '',
    NURA_HEALTH_SEARCH_ENABLED: 'false',
    NURA_ENABLE_DEMO_WEB_SEARCH: 'false',
    NURA_ENABLE_DEMO_INTAKE: 'true',
    ...extra,
  };
  return env;
}

function launch(label, command, args, env) {
  const proc = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const existing = { proc, label, stdout: '', stderr: '' };
  outputs.set(proc, existing);
  childProcesses.push(existing);
  proc.stdout.on('data', (chunk) => { existing.stdout = trimOutput(existing.stdout + chunk.toString()); });
  proc.stderr.on('data', (chunk) => { existing.stderr = trimOutput(existing.stderr + chunk.toString()); });
  proc.once('exit', (code, signal) => {
    existing.exit = { code, signal };
    if (label === 'chrome') {
      chromeProcessExit = { code, signal, at: Date.now() };
      browserTransport = { ...browserTransport, state: 'chrome process exited', chromeExit: chromeProcessExit };
      settlePendingCdp(new Error(`Chrome exited (${JSON.stringify(existing.exit)}).`));
    }
  });
  return existing;
}

function tail(value, n = 2500) { return String(value || '').slice(-n); }

async function waitFor(check, message, timeoutMs = 75_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    for (const child of childProcesses) {
      if (child.exit) {
        throw new Error(`${child.label} exited early (${JSON.stringify(child.exit)}). ${tail(child.stderr)}`);
      }
    }
    try {
      const value = await check();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(250);
  }
  throw new Error(`${message}${lastError ? ` (${lastError.message})` : ''}`);
}

async function serviceReady(url, expectedProviderConfigured = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) return false;
  const body = await response.json();
  return body.ok === true && body.provider?.configured === expectedProviderConfigured;
}

async function browserJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error(`Chrome debug endpoint returned ${response.status}.`);
  return response.json();
}

async function connectCdp(wsUrl) {
  if (typeof WebSocket !== 'function') throw new Error('Node must provide its built-in WebSocket API to run this script.');
  browser = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome DevTools connection timed out.')), 10_000);
    browser.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    browser.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Could not connect to Chrome DevTools.')); }, { once: true });
  });
  browserTransport = { state: 'open', openedAt: Date.now(), close: null, error: null };
  browser.addEventListener('error', (event) => {
    const detail = String(event?.message || event?.type || 'WebSocket error');
    browserTransport = { ...browserTransport, state: 'error', error: detail, at: Date.now() };
    settlePendingCdp(new Error(`Chrome DevTools WebSocket error: ${detail}`));
  });
  browser.addEventListener('close', (event) => {
    const detail = { code: event?.code ?? null, reason: String(event?.reason ?? ''), clean: event?.wasClean ?? null, at: Date.now() };
    browserTransport = { ...browserTransport, state: 'closed', close: detail };
    settlePendingCdp(new Error(`Chrome DevTools WebSocket closed: ${JSON.stringify(detail)}`));
  });
  browser.addEventListener('message', (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.method === 'Network.requestWillBeSent') {
      const url = data.params?.request?.url;
      if (url) {
        requestById.set(data.params.requestId, url);
        requestState.set(data.params.requestId, { url, state: 'started', status: null });
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            requestOrigins.add(parsed.origin);
            requestURLs.push(parsed.href);
          }
        } catch { /* data: and extension URLs are not network origins */ }
      }
    }
    if (data.method === 'Network.responseReceived') {
      const state = requestState.get(data.params?.requestId);
      if (state) state.status = data.params?.response?.status ?? null;
    }
    if (data.method === 'Network.loadingFailed') {
      const state = requestState.get(data.params?.requestId);
      if (state) state.state = `failed: ${data.params?.errorText || 'network failure'}`;
      browserNetworkFailures.push({ url: requestById.get(data.params?.requestId) || 'unknown', error: data.params?.errorText || 'network failure' });
    }
    if (data.method === 'Network.loadingFinished') {
      const state = requestState.get(data.params?.requestId);
      if (state) state.state = 'finished';
    }
    if (data.method === 'Runtime.exceptionThrown') {
      browserExceptions.push(String(data.params?.exceptionDetails?.exception?.description || data.params?.exceptionDetails?.text || 'page exception').slice(0, 400));
    }
    if (data.method === 'Target.targetCrashed' || data.method === 'Inspector.targetCrashed' || data.method === 'Target.targetDestroyed') {
      const targetEvent = {
        event: data.method,
        at: Date.now(),
        targetId: data.params?.targetId ?? null,
        status: data.params?.status ?? null,
        errorCode: data.params?.errorCode ?? null,
      };
      pushBounded(cdpTargetEvents, targetEvent);
      settlePendingCdp(new Error(`Chrome target event: ${JSON.stringify(targetEvent)}`));
    }
    if (!data.id || !pending.has(data.id)) return;
    const command = pending.get(data.id);
    pending.delete(data.id);
    clearTimeout(command.timer);
    command.finishedAt = Date.now();
    command.status = data.error ? 'protocol-error' : 'acknowledged';
    if (data.error) command.error = String(data.error.message || 'Chrome protocol error').slice(0, 240);
    pushBounded(cdpTrace, command);
    if (data.error) command.reject(new Error(`Chrome protocol command failed: ${command.method}: ${command.error}`));
    else command.resolve(data.result);
  });
}

function cdp(method, params = {}, context = '') {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const command = { id, method, context, sentAt: Date.now(), status: 'pending', resolve, reject, timer: null };
    command.timer = setTimeout(() => {
      pending.delete(id);
      command.status = 'timeout';
      command.finishedAt = Date.now();
      pushBounded(cdpTrace, command);
      reject(new Error(`Chrome protocol command timed out: ${method}${context ? ` (${context})` : ''}; state=${JSON.stringify(cdpDiagnostic(command))}`));
    }, 30_000);
    pending.set(id, command);
    try {
      browser.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    } catch (error) {
      pending.delete(id);
      clearTimeout(command.timer);
      command.status = 'send-error';
      command.error = String(error?.message || error).slice(0, 240);
      command.finishedAt = Date.now();
      pushBounded(cdpTrace, command);
      reject(new Error(`Could not send Chrome protocol command ${method}${context ? ` (${context})` : ''}: ${command.error}; state=${JSON.stringify(cdpDiagnostic(command))}`));
    }
  });
}

async function evaluate(expression, { timeoutMs = 20_000 } = {}) {
  const result = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    timeout: timeoutMs,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`Page evaluation failed: ${text}`);
  }
  return result.result?.value;
}

async function bodyText() {
  return (await evaluate('document.body?.innerText || ""')) || '';
}

async function profileContextCount() {
  const match = (await bodyText()).match(/\b(\d{2})\s+CONTEXT SIGNALS/);
  return match ? Number(match[1]) : 0;
}

async function returnToAreaChoicesFromIntake(detail) {
  await waitText(detail);
  await clickVisible({ text: 'Back' });
  await waitPath('/');
  await waitText('CONTEXT FOR THIS AREA');
}

async function inspectMedicineQuickPick(name) {
  await waitPath((path) => path.startsWith('/treatment?'));
  await waitText('What are you taking?');
  const prefilledName = await evaluate("document.querySelector('[aria-label=\\\"MEDICINE OR TREATMENT\\\"]')?.value || ''");
  assert(prefilledName === name, `${name} did not prefill the treatment form; saw ${prefilledName || 'empty'}.`);
  await clickVisible({ aria: 'Close' });
  await clickVisible({ aria: 'Back' });
  await waitPath('/');
  await waitText('CONTEXT FOR THIS AREA');
}

async function inspectMedicineAreaAction() {
  await waitPath((path) => path.startsWith('/treatment'));
  await waitText('YOUR TREATMENT REGISTRY');
  await clickVisible({ text: 'Add medicine or treatment' });
  await waitText('What are you taking?');
  await clickVisible({ aria: 'Close' });
  await clickVisible({ aria: 'Back' });
  await waitPath('/');
  await waitText('CONTEXT FOR THIS AREA');
}

async function waitText(text, timeoutMs = 30_000) {
  return waitFor(async () => {
    const body = await bodyText();
    return body.includes(text) ? body : false;
  }, `Timed out waiting for visible text: ${text}`, timeoutMs);
}

async function waitPath(expected, timeoutMs = 30_000) {
  return waitFor(async () => {
    const value = await evaluate('location.pathname + location.search');
    return typeof expected === 'function' ? expected(value) ? value : false : value === expected ? value : false;
  }, `Timed out waiting for route: ${String(expected)}`, timeoutMs);
}

async function clickVisible({ text, aria, exact = false, timeoutMs = 20_000 }) {
  const descriptor = text || aria;
  const node = await waitFor(async () => evaluate(`(() => {
    const candidates = [...document.querySelectorAll('button,[role="button"],[role="checkbox"],[tabindex="0"]')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') return false;
        const label = [el.getAttribute('aria-label') || '', el.innerText || el.textContent || ''].join(' ').replace(/\\s+/g, ' ').trim();
        const wanted = ${JSON.stringify(descriptor)};
        return ${exact ? `label === wanted` : `label.includes(wanted)`};
      })
      .sort((a, b) => ((a.getAttribute('aria-label') || a.innerText || a.textContent || '').length) - ((b.getAttribute('aria-label') || b.innerText || b.textContent || '').length));
    const el = candidates[0];
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, label: el.getAttribute('aria-label') || el.innerText || el.textContent };
  })()`), `Could not find an interactive control: ${descriptor}\nPage text: ${(await bodyText()).slice(-1200)}`, timeoutMs);
  const action = String(node.label || descriptor).replace(/\s+/g, ' ').trim();
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: node.x, y: node.y }, `clickVisible ${JSON.stringify(action)} · move`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: node.x, y: node.y, button: 'left', clickCount: 1 }, `clickVisible ${JSON.stringify(action)} · press`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: node.x, y: node.y, button: 'left', clickCount: 1 }, `clickVisible ${JSON.stringify(action)} · release`);
  // Let the selected sheet, nested choices, and their accessibility state settle
  // before the next coordinate-based browser tap.
  await delay(420);
  return String(node.label || descriptor).replace(/\s+/g, ' ').trim();
}

async function expandAllTopicsIfCollapsed() {
  const collapsed = await evaluate(`([...document.querySelectorAll('button,[role="button"]')].some((el) => el.getAttribute('aria-label') === 'Expand all reading topics' || (el.innerText || el.textContent || '').trim() === 'Expand all'))`);
  if (collapsed) await clickVisible({ aria: 'Expand all reading topics' });
}

async function stageAllPendingClaims(kind, excludedLabels = []) {
  const actionPrefix = kind === 'policy' ? 'Include policy term: ' : 'Include: ';
  let staged = 0;
  while (staged < 50) {
    const pendingLabel = await evaluate(`([...document.querySelectorAll('[role=\"button\"]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.includes('Needs review.') && label.includes('source quote and review actions') && !${JSON.stringify(excludedLabels)}.some((excluded) => label.startsWith(excluded))) || '')`);
    if (!pendingLabel) return staged;
    if (pendingLabel.includes('Show source quote and review actions')) await clickVisible({ aria: pendingLabel });
    const claimLabel = pendingLabel.split(', ')[0];
    const actionLabel = `${actionPrefix}${claimLabel}`;
    const actionExists = await evaluate(`[...document.querySelectorAll('[role=\"button\"]')].some((el) => el.getAttribute('aria-label') === ${JSON.stringify(actionLabel)})`);
    if (!actionExists) throw new Error(`Could not find the ${kind} include action for ${pendingLabel}.`);
    await waitFor(async () => evaluate(`(() => { const el = [...document.querySelectorAll('[role=\"button\"]')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(actionLabel)}); return Boolean(el && el.getAttribute('aria-disabled') !== 'true'); })()`), `The ${kind} include action is still processing: ${claimLabel}.`, 15_000);
    const actionBeforeClick = await evaluate(`(() => { const el = [...document.querySelectorAll('[role=\"button\"]')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(actionLabel)}); return el ? { disabled: el.getAttribute('aria-disabled'), text: el.innerText } : null; })()`);
    await clickVisible({ aria: actionLabel });
    try {
      await waitFor(async () => {
        const remainsPending = await evaluate(`[...document.querySelectorAll('[role=\"button\"]')].some((el) => {
          const label = el.getAttribute('aria-label') || '';
          return label.startsWith(${JSON.stringify(claimLabel + ', ')}) && label.includes('Needs review.') && label.includes('source quote and review actions');
        })`);
        return !remainsPending;
      }, `The ${kind} suggestion did not leave the pending state: ${claimLabel}.`, 8_000);
    } catch (error) {
      const stateAfterClick = await evaluate(`(() => ({ action: [...document.querySelectorAll('[role=\"button\"]')].find((el) => (el.getAttribute('aria-label') || '').includes(${JSON.stringify(claimLabel)}))?.getAttribute('aria-label') || null, disabled: [...document.querySelectorAll('[role=\"button\"]')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(actionLabel)})?.getAttribute('aria-disabled') || null, errors: [...document.querySelectorAll('[role=\"alert\"]')].map((el) => el.innerText) }))()`);
      throw new Error(`${error instanceof Error ? error.message : String(error)} Before click ${JSON.stringify(actionBeforeClick)}; after click ${JSON.stringify(stateAfterClick)}.`);
    }
    staged += 1;
  }
  throw new Error(`Too many pending ${kind} suggestions to review in the acceptance journey.`);
}

async function fillInput({ aria, placeholder, value, exact = true, timeoutMs = 15_000 }) {
  const selector = aria ? '[aria-label]' : '[placeholder]';
  const key = aria || placeholder;
  const data = await waitFor(async () => evaluate(`(() => {
    const wanted = ${JSON.stringify(key)};
    const els = [...document.querySelectorAll('input,textarea')].filter((el) => {
      const found = el.getAttribute(${JSON.stringify(aria ? 'aria-label' : 'placeholder')}) || '';
      return ${exact ? 'found === wanted' : 'found.includes(wanted)'};
    });
    const el = els[0];
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, tag: el.tagName, label: el.getAttribute('aria-label') || el.getAttribute('placeholder') };
  })()`), `Could not find input ${selector}=${key}`, timeoutMs);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: data.x, y: data.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: data.x, y: data.y, button: 'left', clickCount: 1 });
  const attribute = aria ? 'aria-label' : 'placeholder';
  const expression = `(() => {
    const el = [...document.querySelectorAll('input,textarea')].find((item) => item.getAttribute(${JSON.stringify(attribute)}) === ${JSON.stringify(key)});
    if (!el) return null;
    const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) return null;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`;
  const immediateValue = await evaluate(expression);
  assert(immediateValue === value, `Input ${key} did not accept the requested replacement.`);
  await delay(120);
  const committedValue = await evaluate(`(() => [...document.querySelectorAll('input,textarea')].find((item) => item.getAttribute(${JSON.stringify(attribute)}) === ${JSON.stringify(key)})?.value || null)()`);
  assert(committedValue === value, `Input ${key} did not retain the replacement after React updated.`);
}

async function setViewport(width, height = 844) {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: true,
    screenWidth: width, screenHeight: height,
  });
  await delay(180);
}

async function navigate(url) {
  await cdp('Page.navigate', { url });
  await waitFor(async () => evaluate('document.readyState').then((v) => v === 'complete' || v === 'interactive'), 'Page navigation timed out.');
  await delay(450);
}

async function installSyntheticModelAdapter() {
  const adapterSource = String.raw`import { appendFileSync } from 'node:fs';
const originalFetch = globalThis.fetch;
const append = (entry) => appendFileSync(process.env.NURA_SYNTHETIC_ASK_LOG, JSON.stringify(entry) + '\n');
const blocked = (entry) => appendFileSync(process.env.NURA_BLOCKED_MODEL_NETWORK_LOG, JSON.stringify(entry) + '\n');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
globalThis.fetch = async (input, options = {}) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (url === 'https://api.openai.com/v1/responses') {
    const request = JSON.parse(options.body || '{}');
    const isProfileSearch = request.tool_choice?.type === 'function' && request.tool_choice?.name === 'search_profile';
    if (isProfileSearch) {
      append({ stage: 'profile_search_requested', model: request.model, transcript: JSON.stringify(request.input ?? []) });
      return new Response(JSON.stringify({ output: [{
        type: 'function_call', call_id: 'synthetic-browser-search', name: 'search_profile',
        arguments: JSON.stringify({ query: 'LDL cholesterol Annual medical limit' }),
      }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const searchCall = request.input.find((item) => item.type === 'function_call_output');
    const search = searchCall ? JSON.parse(searchCall.output) : { results: [] };
    const results = Array.isArray(search.results) ? search.results : [];
    const isPolicy = (item) => /^(insurance coverage|coverage_term|coverage term)$/i.test(String(item?.category || ''));
    const policy = results.find((item) => isPolicy(item) && /annual medical limit/i.test(item.title || ''))
      || results.find((item) => isPolicy(item));
    const health = results.find((item) => item?.kind === 'user_record' && !isPolicy(item) && /ldl cholesterol/i.test(item.title || ''))
      || results.find((item) => item?.kind === 'user_record' && !isPolicy(item));
    const requestTranscript = JSON.stringify(request.input ?? []);
    if (/source-only Medical Registry summary/i.test(requestTranscript)) {
      if (!health) throw new Error('The Registry summary run did not retrieve a selected, source-linked health record.');
      const answer = {
        answer: 'The linked Cholesterol records include ' + health.title + ' recorded as ' + health.detail + '. This summary reflects only the retrieved source; check the dated record and original report for the full context.',
        citations: [health.reference],
        meaning: { text: '', citations: [] },
        unknowns: ['This summary covers the linked records retrieved for this topic; it does not assess overall health.'],
        nextSteps: [],
        memoryProposal: { proposed: false, label: '', value: '', reason: '', sourceReferences: [] },
      };
      append({ stage: 'registry_summary_returned', title: health.title, reference: health.reference });
      await delay(300);
      return new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(request.instructions || '').includes('User-selected public reading item (metadata')) {
      if (!health) throw new Error('The selected-source Ask run did not retrieve its topic-matched saved health detail.');
      const title = String(request.instructions.match(/\nTitle: ([^\n]+)/)?.[1] || 'Selected health video');
      const topic = String(request.instructions.match(/\nTopic: ([^\n]+)/)?.[1] || 'your selected health topic');
      const answer = {
        answer: 'This video introduces how LDL and HDL differ within a ' + topic.toLowerCase() + ' panel. Your saved ' + health.title + ' gives you a concrete detail to keep in mind as you watch.',
        citations: [health.reference],
        meaning: { text: '', citations: [] },
        unknowns: [],
        nextSteps: [
          'How does this video explain LDL and HDL?',
          'What should I notice about my saved ' + health.title + ' while I watch?',
        ],
        memoryProposal: { proposed: false, label: '', value: '', reason: '', sourceReferences: [] },
      };
      append({ stage: 'selected_reading_answer_returned', title, topic, citedHealthRecord: health.title, followUps: answer.nextSteps });
      await delay(1200);
      return new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (!policy || !health) {
      append({ stage: 'missing_selected_evidence', titles: results.map((item) => item.title).filter(Boolean) });
      throw new Error('The selected policy and health sources were not both available to this Ask run.');
    }
    const answer = {
      answer: 'The reviewed policy lists this annual medical limit: ' + policy.detail + '. Your saved report records ' + health.title + ' at ' + health.detail + '. The reviewed wording does not say whether this blood test meets the policy conditions.',
      citations: [policy.reference, health.reference],
      meaning: { text: '', citations: [] },
      unknowns: ['The reviewed terms do not say whether this cholesterol blood test is eligible or requires prior approval.'],
      nextSteps: ['Ask the insurer whether this test is eligible and whether prior approval is required.'],
      coverageAssessments: [{ kind: 'explicit_limit', policyReference: policy.reference, detail: policy.detail, relatedHealthReferences: [] }],
      memoryProposal: { proposed: false, label: '', value: '', reason: '', sourceReferences: [] },
    };
    append({ stage: 'grounded_response_returned', titles: [policy.title, health.title], references: [policy.reference, health.reference], policyQuotePresent: Boolean(policy.detail) });
    await delay(1200);
    return new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (typeof url === 'string' && (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:'))) return originalFetch(input, options);
  blocked({ destination: String(url || 'unknown') });
  throw new Error('External network is disabled in the synthetic Ask browser rehearsal.');
};`;
  await writeFile(syntheticModelAdapterPath, adapterSource, { mode: 0o600 });
}

async function runAskBrowserJourney() {
  assert(askEnabled, 'The Ask browser journey must run only in explicit synthetic-Ask mode.');
  await navigate(`${appOrigin}/ask`);
  await waitText('Let’s look at the whole picture.');
  const composerQuestion = 'What changed in my saved health history?';
  await fillInput({ aria: 'Your question for Nura', value: composerQuestion });
  const composerVisual = await evaluate(`(() => {
    const input = document.querySelector('[aria-label="Your question for Nura"]');
    if (!input) return null;
    const rect = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    const hit = document.elementFromPoint(rect.left + Math.min(rect.width / 2, 30), rect.top + rect.height / 2);
    return { value: input.value, visible: rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.opacity !== '0', color: style.color, hitIsInput: hit === input || input.contains(hit) };
  })()`);
  assert(composerVisual?.value === composerQuestion && composerVisual.visible && composerVisual.hitIsInput && composerVisual.color === 'rgb(255, 249, 243)', 'Ask text is not visibly readable while typing.');
  record('Ask composer keeps typed text visible with readable contrast');
  await navigate(`${appOrigin}/insurance`);
  await waitText('POLICY AT A GLANCE');
  const initialPolicyText = await bodyText();
  assert(initialPolicyText.includes('Example policy · 2025'), 'The source-backed 2025 sample policy is not saved before the independent comparison journey.');
  const expandInitialTermsLabel = await evaluate(`([...document.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.startsWith('Show all ') && label.endsWith(' approved policy terms')) || '')`);
  if (expandInitialTermsLabel) await clickVisible({ aria: expandInitialTermsLabel });
  await waitText('SGD 50,000 per insured person');
  await clickVisible({ text: 'Add a policy document' });
  await waitPath((value) => value.startsWith('/intake?purpose=insurance'));
  await waitText('Add a second sample policy');
  await clickVisible({ aria: 'Add independent sample policy' });
  await waitText('Independent example policy · 2024');
  await waitText('Separate policy · ready to review');
  await clickVisible({ aria: 'Review independent sample policy' });
  await waitPath((value) => value.startsWith('/review?purpose=insurance'));
  await waitText('Review this file with Nura');
  await clickVisible({ text: 'Review this file with Nura' });
  await waitText('Read these policy files?');
  const independentPolicyConsent = await bodyText();
  assert(independentPolicyConsent.includes('Nura-Independent-Policy-2024.pdf') && independentPolicyConsent.includes('Example files are checked on this device.'), 'The second policy consent does not name the file or its local-only processing.');
  await clickVisible({ text: 'Approve and review examples' });
  await waitText('Policy terms ready to review', 90_000);
  await waitText('SGD 35,000 per insured person', 15_000);
  const includedIndependentTerms = await stageAllPendingClaims('policy');
  assert(includedIndependentTerms > 1, 'The independent sample policy did not provide multiple reviewable terms.');
  await clickVisible({ text: 'Save reviewed items' });
  await waitText('saved to your Insurance Registry', 30_000);
  await clickVisible({ text: 'Open Insurance Registry' });
  await waitPath('/insurance');
  await waitText('Independent example policy · 2024');
  const independentPolicyText = await bodyText();
  assert(independentPolicyText.includes('Source file ·') && independentPolicyText.includes('Example policy · 2025') && independentPolicyText.includes('Independent example policy · 2024'), 'The registry does not show both separate source-backed policies.');
  const replacementCountBeforeIndependentCompare = await evaluate(`JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}').policyReplacements?.length || 0`);
  await clickVisible({ aria: 'Compare this policy with another saved policy' });
  await waitText('Choose another saved policy');
  const independentPolicyChoiceLabel = await evaluate(`([...document.querySelectorAll('[role="button"][aria-label]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.startsWith('Compare Independent example policy · 2024 with Example policy · 2025')) || '')`);
  assert(independentPolicyChoiceLabel, 'The independent policy was not offered as a separate comparison choice.');
  await clickVisible({ aria: independentPolicyChoiceLabel });
  await waitText('SIDE-BY-SIDE · NO REPLACEMENT LINK');
  const independentComparisonText = await bodyText();
  assert(independentComparisonText.includes('SAVED VALUES DIFFER') && independentComparisonText.includes('SGD 50,000 per insured person') && independentComparisonText.includes('SGD 35,000 per insured person'), 'The independent comparison does not show both approved values and their difference.');
  assert(independentComparisonText.includes('A term missing from a summary is unknown, not an exclusion.') && independentComparisonText.includes('does not say which policy is active'), 'The comparison does not explain the limits of its conclusions.');
  const annualLimitQuoteLabels = await evaluate(`[...document.querySelectorAll('[role="button"][aria-label]')].map((el) => el.getAttribute('aria-label') || '').filter((label) => label.startsWith('VIEW SOURCE QUOTE for Annual medical limit from '))`);
  assert(annualLimitQuoteLabels.length === 2, `Both values do not open their exact source quotes: ${JSON.stringify(annualLimitQuoteLabels)}`);
  await evaluate(`document.querySelector('[data-testid="independent-policy-comparison"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }); true`);
  if (process.env.M1_POLICY_COMPARISON_SCREENSHOT_PATH) {
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_POLICY_COMPARISON_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
  }
  const replacementCountAfterIndependentCompare = await evaluate(`JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}').policyReplacements?.length || 0`);
  assert(replacementCountAfterIndependentCompare === replacementCountBeforeIndependentCompare, 'Comparing two policies created a replacement relationship.');
  record('Uploaded and reviewed policies compare approved values with both source quotes and no implied replacement');
  await evaluate(`(() => { [...document.querySelectorAll('[aria-label]')].find((el) => el.getAttribute('aria-label') === 'Ask Nura to compare these separate policies with selected health details')?.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
  await clickVisible({ aria: 'Ask Nura to compare these separate policies with selected health details' });
  await waitPath((value) => value.startsWith('/ask') && value.includes('policySourceIds='));
  await waitText('Compare the two linked policies. Add only the health details you choose for this run.');
  await waitText('Ask service connected');
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Choose what Nura can use.');
  const twoPolicyConsent = await bodyText();
  assert(twoPolicyConsent.includes('Terms from these two policy documents') && twoPolicyConsent.includes('22 items') && twoPolicyConsent.includes('Text from the two linked policy sources') && twoPolicyConsent.includes('2 sources · saved text only'), 'The two-policy Ask consent does not name both policy sources and their reviewed terms.');
  assert(twoPolicyConsent.includes('No health fact is selected by default.') && twoPolicyConsent.includes('Name, contact details and original files') && twoPolicyConsent.includes('Not shared'), 'The two-policy consent does not keep personal health facts opt-in and originals private.');
  record('Comparing policies with Ask presents two-source consent and keeps health details unselected');
  await clickVisible({ text: 'Not now' });
  assert((await readFile(syntheticModelLogPath, 'utf8').catch(() => '')).trim() === '', 'Canceling two-policy Ask consent unexpectedly invoked the model.');
  record('Canceling two-policy Ask consent sends no policy or health context');
  await navigate(`${appOrigin}/insurance`);
  await waitText('POLICY AT A GLANCE');
  const insurerReplyAction = await evaluate(`([...document.querySelectorAll('[role="button"][aria-label]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.startsWith('Record an insurer reply for ')) || '')`);
  assert(insurerReplyAction, 'An approved source-linked policy term does not offer insurer-reply capture.');
  const insurerReplyTermLabel = insurerReplyAction.slice('Record an insurer reply for '.length);
  await clickVisible({ aria: insurerReplyAction });
  const insurerReplyInputLabel = await evaluate(`([...document.querySelectorAll('textarea[aria-label]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label === ${JSON.stringify(`Your note about the insurer reply for ${insurerReplyTermLabel}`)}) || '')`);
  assert(insurerReplyInputLabel, `The insurer reply form did not open for ${insurerReplyTermLabel}.`);
  const insurerReply = 'The insurer said the published 2025 schedule applies; they will send written confirmation.';
  await fillInput({ aria: insurerReplyInputLabel, value: insurerReply });
  await clickVisible({ text: 'SAVE MY NOTE' });
  await waitText(insurerReply);
  await waitText('USER-REPORTED · NOT POLICY WORDING');
  const savedInsurerReply = await evaluate(`(() => { const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}'); const reply = snapshot.policyClarifications?.[0]; const term = snapshot.facts?.find((fact) => fact.id === reply?.sourceFactId); return { reply, term: term && { label: term.label, value: term.value, sourceId: term.sourceId, sourceClaimId: term.sourceClaimId } }; })()`);
  assert(savedInsurerReply?.reply?.status === 'user_reported' && savedInsurerReply.reply.response === insurerReply && savedInsurerReply.reply.termLabel === insurerReplyTermLabel, `The saved insurer response lost its user-reported status or policy-term linkage: ${JSON.stringify(savedInsurerReply)}`);
  assert(savedInsurerReply.term?.sourceId === savedInsurerReply.reply.sourceId && savedInsurerReply.term?.sourceClaimId === savedInsurerReply.reply.sourceClaimId, 'The insurer response is not linked to the exact accepted policy claim.');
  assert((await readFile(syntheticModelLogPath, 'utf8').catch(() => '')).trim() === '', 'Recording an insurer reply unexpectedly called the AI model.');
  await navigate(`${appOrigin}/insurance`);
  await waitText(insurerReply);
  await clickVisible({ text: 'EDIT NOTE' });
  const editedInsurerReply = 'The insurer confirmed the 2025 schedule applies and emailed the rate table.';
  await fillInput({ aria: `Edit your user-reported note for ${insurerReplyTermLabel}`, value: editedInsurerReply });
  await clickVisible({ text: 'SAVE EDIT' });
  await waitText(editedInsurerReply);
  await navigate(`${appOrigin}/insurance`);
  await waitText(editedInsurerReply);
  const editedReplyState = await evaluate(`JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}').policyClarifications?.[0] || null`);
  assert(editedReplyState?.response === editedInsurerReply && editedReplyState?.sourceFactId === savedInsurerReply.reply.sourceFactId && editedReplyState?.status === 'user_reported', 'Editing the insurer reply did not persist its text while retaining the original source link.');
  await clickVisible({ text: 'REMOVE NOTE' });
  await waitText('Remove this user-reported note? The policy record will stay unchanged.');
  await clickVisible({ text: 'REMOVE', exact: true });
  await waitFor(async () => evaluate(`(JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}').policyClarifications || []).length === 0`), 'The insurer reply was not removed from the local record.');
  const policyAfterReplyRemoval = await evaluate(`(() => { const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}'); const replyTerm = snapshot.facts?.find((fact) => fact.id === ${JSON.stringify(savedInsurerReply.reply.sourceFactId)}); return { hasPolicy: snapshot.facts?.some((fact) => fact.sourceId === ${JSON.stringify(savedInsurerReply.reply.sourceId)} && /insurance coverage/i.test(fact.category || '')), term: replyTerm && { label: replyTerm.label, value: replyTerm.value } }; })()`);
  assert(policyAfterReplyRemoval?.hasPolicy && policyAfterReplyRemoval.term?.label === savedInsurerReply.term.label && policyAfterReplyRemoval.term?.value === savedInsurerReply.term.value, 'Removing the user-reported insurer note changed or removed accepted policy wording.');
  record('Insurer replies save and edit as user-reported notes, survive reload with exact policy-claim linkage, stay out of AI, and delete without changing policy wording');
  await clickVisible({ aria: 'Check Example policy · 2025 against selected health details' });
  await waitPath((value) => value.startsWith('/ask') && value.includes('policySourceIds='));
  await waitText('Review this policy against only the health details you choose for this run.');
  await waitText('Ask service connected');
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Choose what Nura can use.');
  const consent = await bodyText();
  assert(consent.includes('Terms from this policy document') && consent.includes('11 items') && consent.includes('Text from this policy source') && consent.includes('1 source · saved text only'), 'The Ask consent sheet does not identify the reviewed policy terms and linked source text.');
  assert(consent.includes('No health fact is selected by default.'), 'The policy Ask flow does not disclose that health details start unselected.');
  assert(consent.includes('Name, contact details and original files') && consent.includes('Not shared'), 'The Ask consent sheet does not state that identity details and original files stay out.');
  const selectedHealthFactLabel = await evaluate("[...document.querySelectorAll('[role=\\\"checkbox\\\"][aria-label]')].map((el) => el.getAttribute('aria-label') || '').find((label) => /^Share LDL cholesterol:/i.test(label)) || ''");
  assert(selectedHealthFactLabel, 'The Ask consent sheet does not expose an accessible LDL fact selection.');
  const healthFactCheckboxState = () => evaluate(`(() => { const item = [...document.querySelectorAll('[role="checkbox"]')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(selectedHealthFactLabel)}); return item?.getAttribute('aria-checked') === 'true' || item?.innerText.includes('✓') === true; })()`);
  const healthFactInitiallyChecked = await healthFactCheckboxState();
  assert(healthFactInitiallyChecked === false, 'A health fact was already selected before the user chose it.');
  record('Insurance-to-Ask opens a policy-scoped, one-run consent sheet with health details unselected');
  await clickVisible({ aria: selectedHealthFactLabel });
  await waitFor(healthFactCheckboxState, 'The selected LDL health fact did not enter its checked state.');
  await clickVisible({ text: 'Not now' });
  assert((await readFile(syntheticModelLogPath, 'utf8').catch(() => '')).trim() === '', 'Canceling Ask consent unexpectedly invoked the model.');
  record('Canceling Ask consent sends no policy or health context');
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Choose what Nura can use.');
  await clickVisible({ aria: selectedHealthFactLabel });
  await waitFor(healthFactCheckboxState, 'The selected LDL health fact did not enter its checked state on the confirmed run.');
  await clickVisible({ text: 'CONTINUE WITH SELECTED DETAILS' });
  await waitText('Live activity · only actions and evidence', 10_000);
  await waitText('Finding policy and health evidence', 10_000);
  const processingOrbVisible = await evaluate("Boolean(document.querySelector('[data-testid=\\\"nura-ask-processing-orb\\\"]'))");
  assert(processingOrbVisible, 'Ask does not show its visible Nura processing orb while the local response is pending.');
  record('Ask shows a live processing card, actual retrieval trace and animated Nura orb');
  if (process.env.M1_ASK_SCREENSHOT_PATH) {
    const viewport = await evaluate("(() => { window.scrollTo({ top: 0, left: 0 }); document.documentElement.scrollLeft = 0; document.body.scrollLeft = 0; [...document.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 10 || element.scrollWidth > element.clientWidth + 10).forEach((element) => { element.scrollTop = 0; element.scrollLeft = 0; }); return { width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth, pageX: window.scrollX }; })()");
    log(`Ask processing screenshot viewport: ${JSON.stringify(viewport)}`);
    await delay(80);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_ASK_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    log(`Captured synthetic Ask activity visual at ${process.env.M1_ASK_SCREENSHOT_PATH}`);
  }
  await waitText('The reviewed policy lists this annual medical limit', 30_000);
  await waitText('QUESTIONS FOR YOUR INSURER');
  const answerBody = await bodyText();
  assert(answerBody.includes('SGD 50,000 per insured person'), 'The answer does not preserve the exact reviewed policy limit.');
  assert(/LDL cholesterol/i.test(answerBody), 'The answer omits the explicitly selected health record.');
  assert(answerBody.includes('does not say whether this blood test meets the policy conditions'), 'The answer does not plainly state that the reviewed wording does not establish eligibility.');
  assert(answerBody.includes('Ask the insurer whether this test is eligible'), 'The answer does not provide a safe, concrete question for the insurer.');
  assert(!answerBody.includes('HOW THIS WAS ANSWERED') && !answerBody.includes('NEXT STEP'), 'The completed answer still shows generic process or next-step panels.');
  record('Ask displays the quoted limit, selected health evidence, uncertainty and insurer next step');
  await clickVisible({ aria: 'Show why this answer is relevant' });
  await clickVisible({ aria: 'Show 1 reviewed policy terms' });
  const citedControlText = await evaluate(`[...document.querySelectorAll('[role="button"]')].map((el) => (el.getAttribute('aria-label') || '') + ' ' + (el.innerText || '')).join(' ')`);
  assert(citedControlText.includes('Open cited policy source Annual medical limit from Nura-Example-Policy-2025.pdf') && citedControlText.includes('Open cited saved detail LDL cholesterol'), 'The Ask answer does not link both the exact policy term and health source in their evidence details.');
  await clickVisible({ aria: 'Open cited saved detail LDL cholesterol' });
  await waitPath((value) => value.startsWith('/health'));
  await waitFor(async () => /LDL cholesterol/i.test(await bodyText()), 'The cited report detail did not open in Health History.');
  record('A cited Ask health fact opens its saved source-linked history');
  const policyConversationId = await evaluate(`JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}').askConversations?.[0]?.id || ''`);
  assert(policyConversationId, 'The saved policy conversation has no route identifier for reopening.');
  await navigate(`${appOrigin}/ask?conversationId=${encodeURIComponent(policyConversationId)}`);
  await waitText('The reviewed policy lists this annual medical limit', 30_000);
  await waitText('QUESTIONS FOR YOUR INSURER');
  record('The completed, cited Ask answer and its uncertainty persist after app reload');
  const modelCalls = (await readFile(syntheticModelLogPath, 'utf8').catch(() => '')).trim().split(/\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert(modelCalls.length === 2 && modelCalls[0].stage === 'profile_search_requested' && modelCalls[1].stage === 'grounded_response_returned', 'The synthetic Ask rehearsal did not execute exactly one search and one response step.');
  assert(modelCalls[1].titles.includes('Annual medical limit') && modelCalls[1].titles.some((title) => /LDL cholesterol/i.test(title)), 'The intercepted model response was not grounded in the exact selected sources.');
  assert((await readFile(blockedModelNetworkLogPath, 'utf8').catch(() => '')).trim() === '', 'The synthetic Ask adapter observed an unmocked external network request.');
  record('Ask used two intercepted synthetic model steps and made no external provider request');

  await navigate(`${appOrigin}/ask`);
  await waitText('Let’s look at the whole picture.');
  const savedPolicyThread = await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const conversationId = ${JSON.stringify(policyConversationId)};
    const conversation = snapshot?.askConversations?.find((item) => item.id === conversationId);
    const messages = (snapshot?.agentMessages || []).filter((item) => item.conversationId === conversationId);
    return conversation ? { ...conversation, messageCount: messages.length } : null;
  })()`);
  assert(savedPolicyThread?.title && savedPolicyThread.messageCount === 2, `The first Ask thread was not saved with a title and both messages: ${JSON.stringify(savedPolicyThread)}`);
  await clickVisible({ aria: 'Recent conversations' });
  await waitText('Recent conversations');
  assert((await bodyText()).includes(savedPolicyThread.title) && (await bodyText()).includes('Open chat'), 'Recents does not show the saved policy thread and its reopen action.');
  await clickVisible({ text: 'Open chat' });
  await delay(700);
  await waitText('The reviewed policy lists this annual medical limit');
  record('Ask saves a titled conversation, lists it in Recents, and reopens its cited answer');

  await clickVisible({ aria: 'Start a new conversation' });
  await waitText('Let’s look at the whole picture.');
  await clickVisible({ text: 'Link a recent conversation for context' });
  await waitText('Link a recent conversation');
  await clickVisible({ text: 'Use context' });
  await waitText(`Linked: ${savedPolicyThread.title}`);
  await fillInput({ aria: 'Your question for Nura', value: 'Can you continue from our policy conversation?' });
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Choose what Nura can use.');
  const linkedChatToggle = await evaluate(`(() => [...document.querySelectorAll('[role="checkbox"]')].map((item) => ({ label: item.innerText || '', checked: item.getAttribute('aria-checked') === 'true' })).find((item) => item.label.includes('Linked chat ·')) || null)()`);
  assert(linkedChatToggle?.label.includes(savedPolicyThread.title) && linkedChatToggle.label.includes('conversation context only') && !linkedChatToggle.checked, `The previous chat is not offered as a separate, opt-in context source: ${JSON.stringify(linkedChatToggle)}`);
  // The row title may be shortened for display; target its unique visible prefix
  // so coordinate-based input lands on the consent checkbox, not the prompt behind it.
  await clickVisible({ text: 'Linked chat ·' });
  const linkedChatSelected = await evaluate(`([...document.querySelectorAll('[role="checkbox"]')].find((item) => (item.innerText || '').includes('Linked chat ·'))?.getAttribute('aria-checked') === 'true')`);
  assert(linkedChatSelected, 'The user could not opt in to the linked conversation context.');
  await clickVisible({ text: 'Not now' });
  assert((await readFile(syntheticModelLogPath, 'utf8').catch(() => '')).trim().split(/\n/).filter(Boolean).length === 2, 'Canceling linked-chat consent unexpectedly invoked the model.');
  record('A new chat can link an earlier conversation, keeps its text opt-in, and sends nothing when consent is canceled');

  // Exercise the affirmative path too: only the separately consented prior
  // turns should enter a new Ask run, while each chat keeps its own messages.
  await clickVisible({ aria: 'Start a new conversation' });
  await waitText('Let’s look at the whole picture.');
  await clickVisible({ text: 'Link a recent conversation for context' });
  await waitText('Link a recent conversation');
  await clickVisible({ text: 'Use context' });
  await waitText(`Linked: ${savedPolicyThread.title}`);
  const linkedFollowUpQuestion = 'Continue the policy explanation using the chat I linked.';
  await fillInput({ aria: 'Your question for Nura', value: linkedFollowUpQuestion });
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Choose what Nura can use.');
  const linkedFollowUpChoice = await evaluate(`(() => [...document.querySelectorAll('[role="checkbox"]')].map((item) => ({ label: item.innerText || '', checked: item.getAttribute('aria-checked') === 'true' })).find((item) => item.label.includes('Linked chat ·')) || null)()`);
  assert(linkedFollowUpChoice?.label.includes(savedPolicyThread.title) && !linkedFollowUpChoice.checked, `Linked history was not offered as a separate, off-by-default consent choice: ${JSON.stringify(linkedFollowUpChoice)}`);
  await clickVisible({ text: 'Linked chat ·' });
  await clickVisible({ text: 'CONTINUE WITH SELECTED DETAILS' });
  await waitText('The reviewed policy lists this annual medical limit', 30_000);
  const linkedFollowUpThread = await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const conversationId = new URL(location.href).searchParams.get('conversationId');
    const conversation = snapshot?.askConversations?.find((item) => item.id === conversationId);
    const messages = (snapshot?.agentMessages || []).filter((item) => item.conversationId === conversationId);
    return conversation ? { ...conversation, messageCount: messages.length, answer: messages.at(-1)?.text || '' } : null;
  })()`);
  assert(linkedFollowUpThread?.messageCount === 2 && linkedFollowUpThread.linkedConversationIds.includes(savedPolicyThread.id), `The new chat did not persist its explicit link separately from its own messages: ${JSON.stringify(linkedFollowUpThread)}`);
  const linkedHistoryRequest = (await readFile(syntheticModelLogPath, 'utf8')).trim().split(/\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((item) => item.stage === 'profile_search_requested').at(-1);
  assert(linkedHistoryRequest?.transcript.includes(linkedFollowUpQuestion) && linkedHistoryRequest.transcript.includes('The reviewed policy lists this annual medical limit'), 'The confirmed linked-chat context did not reach the next answer as conversation continuity.');
  record('A separately consented new chat receives selected prior turns and persists its link without merging histories');

  // Drive a source-only Registry brief from its UI, then change a linked fact
  // and prove the saved prose is hidden until the user explicitly opens it.
  await navigate(`${appOrigin}/registry?topicId=cholesterol`);
  await waitPath((value) => value.startsWith('/registry') && value.includes('topicId=cholesterol'));
  await waitText('SOURCE-LINKED HISTORY');
  await clickVisible({ text: 'CREATE WITH ASK NURA' });
  await waitPath((value) => value.startsWith('/ask') && value.includes('registryBriefTopicId=cholesterol'));
  await waitText('Preparing a source-linked Registry summary');
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Review what goes into this summary.');
  await clickVisible({ text: 'CONTINUE WITH SELECTED DETAILS' });
  await waitText('The linked Cholesterol records include', 30_000);
  await clickVisible({ text: 'SAVE CITED SUMMARY' });
  await waitText('SAVED TO MEDICAL REGISTRY');
  const savedRegistryBrief = await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const brief = snapshot?.registryBriefs?.find((item) => item.topicId === 'cholesterol');
    const target = snapshot?.facts?.find((fact) => fact.id === 'synthetic-range-hba1c');
    return { brief: brief ? { ...brief, citationCount: brief.citations?.length || 0 } : null, targetFactId: target?.id || '' };
  })()`);
  assert(savedRegistryBrief.brief?.answer.includes('The linked Cholesterol records include') && savedRegistryBrief.brief.citationCount > 0 && savedRegistryBrief.targetFactId, `The source-only summary or its linked evidence was not saved: ${JSON.stringify(savedRegistryBrief)}`);
  record('Medical Registry creates and saves a source-cited summary through Ask Nura');
  await navigate(`${appOrigin}/registry?topicId=cholesterol`);
  await waitText('The linked Cholesterol records include');
  const currentRegistryBrief = await bodyText();
  assert(currentRegistryBrief.includes('CURRENT') && currentRegistryBrief.includes('CITED SOURCES'), 'The current Registry brief is missing its fresh status or source navigation.');
  await evaluate(`(() => {
    const key = 'nura-local-demo-v1';
    const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
    const target = snapshot?.facts?.find((fact) => fact.id === ${JSON.stringify(savedRegistryBrief.targetFactId)});
    if (!target) throw new Error('The linked synthetic HbA1c fact disappeared before the stale-summary check.');
    target.value = '5.9%';
    localStorage.setItem(key, JSON.stringify(snapshot));
  })()`);
  await navigate(`${appOrigin}/registry?topicId=cholesterol`);
  await waitText('This summary needs refreshing because a linked record or relationship changed. The current saved records are shown here.', 15_000);
  await waitText('CURRENT LINKED RECORDS');
  const staleRegistryBrief = await bodyText();
  const staleAnswerVisible = staleRegistryBrief.includes('The linked Cholesterol records include');
  const revisedValueVisible = staleRegistryBrief.includes('5.9%');
  assert(!staleAnswerVisible && revisedValueVisible, `A stale Registry summary remained in the current view or the revised evidence was hidden: ${JSON.stringify({ staleAnswerVisible, revisedValueVisible })}`);
  await clickVisible({ text: 'VIEW SAVED SUMMARY · OUT OF DATE' });
  await waitText('OLDER SUMMARY · NOT REFRESHED');
  assert((await bodyText()).includes('The linked Cholesterol records include'), 'The explicitly expanded older Registry summary did not remain available with its stale label.');
  record('Changed linked evidence hides stale Registry prose and keeps it available only behind an out-of-date disclosure');

  await navigate(`${appOrigin}/ask`);
  await waitText('Let’s look at the whole picture.');
  await clickVisible({ aria: 'Start a new conversation' });
  await waitText('Let’s look at the whole picture.');
  await evaluate(`(() => {
    const key = 'nura-local-demo-v1';
    const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
    if (!snapshot || snapshot.version !== 1 || snapshot.demoOnly !== true) throw new Error('The synthetic profile is unavailable for the video-to-Ask journey.');
    const retrievedAt = new Date().toISOString();
    snapshot.feedItems = [{ id: 'synthetic-selected-video', title: 'Synthetic video · LDL and HDL', detail: 'A short video explaining how LDL and HDL differ within a cholesterol panel.', url: 'https://www.youtube.com/watch?v=CholVid0011', publisher: 'Synthetic video publisher', topic: 'Cholesterol', retrievedAt, saved: false, dismissed: false }];
    localStorage.setItem(key, JSON.stringify(snapshot));
  })()`);
  await navigate(`${appOrigin}/services`);
  await waitText('YOUR HEALTH LIBRARY');
  await expandAllTopicsIfCollapsed();
  await waitText('Synthetic video · LDL and HDL');
  const exploreVideoCard = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('[role="button"]')];
    const askButton = buttons.find((item) => item.getAttribute('aria-label') === 'Ask Nura about this video: Synthetic video · LDL and HDL');
    const playButton = buttons.find((item) => item.getAttribute('aria-label') === 'Play featured video in Nura: Synthetic video · LDL and HDL');
    return { title: document.body.innerText.includes('Synthetic video · LDL and HDL'), askButton: Boolean(askButton), playButton: Boolean(playButton) };
  })()`);
  assert(exploreVideoCard?.title && exploreVideoCard.askButton && exploreVideoCard.playButton, 'The Explore video is missing its title, play action or Ask Nura action.');
  await clickVisible({ aria: 'Ask Nura about this video: Synthetic video · LDL and HDL' });
  await waitPath((value) => value.startsWith('/ask') && value.includes('readingSourceId=synthetic-selected-video'));
  await waitText('Synthetic video · LDL and HDL');
  const selectedVideoCard = await evaluate(`(() => {
    const card = document.querySelector('[aria-label="Play selected video: Synthetic video · LDL and HDL"]');
    const media = card?.querySelector('[style*="aspect-ratio"]') || card?.firstElementChild;
    const rect = media?.getBoundingClientRect();
    const ratio = rect?.height ? rect.width / rect.height : 0;
    const copy = card?.innerText || '';
    return { card: Boolean(card), playableFrame: Boolean(media) && ratio > 1.7 && ratio < 1.9, ratio, fallbackReady: copy.includes('PLAY VIDEO IN NURA') && copy.includes('NURA · HEALTH VIDEO') && copy.includes('THUMBNAIL UNAVAILABLE'), speculativeThumbnailRequests: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('i.ytimg.com/vi/CholVid0011/')).length };
  })()`);
  assert(selectedVideoCard?.card && selectedVideoCard.playableFrame && selectedVideoCard.fallbackReady, `Ask did not carry the selected video preview and play action into the conversation: ${JSON.stringify(selectedVideoCard)}`);
  assert(selectedVideoCard.speculativeThumbnailRequests === 0, `A video without provider thumbnail metadata triggered a guessed YouTube thumbnail request: ${JSON.stringify(selectedVideoCard)}`);
  record('Explore carries a playable branded fallback into Ask without guessing a YouTube thumbnail');

  const suppliedThumbnailUrl = 'https://i.ytimg.com/vi/CholVid0011/hqdefault.jpg';
  await evaluate(`(() => {
    const key = 'nura-local-demo-v1';
    const snapshot = JSON.parse(localStorage.getItem(key));
    const video = snapshot?.feedItems?.find((item) => item.id === 'synthetic-selected-video');
    if (!video) throw new Error('Synthetic video was missing before thumbnail failure check.');
    video.thumbnailUrl = ${JSON.stringify(suppliedThumbnailUrl)};
    localStorage.setItem(key, JSON.stringify(snapshot));
  })()`);
  await cdp('Network.setBlockedURLs', { urls: [suppliedThumbnailUrl] });
  await navigate(`${appOrigin}/services`);
  await waitText('Synthetic video · LDL and HDL');
  const exploreThumbnailFallback = await waitFor(async () => evaluate(`(() => {
    const card = document.querySelector('[aria-label="Play featured video in Nura: Synthetic video · LDL and HDL"]');
    const copy = card?.innerText || '';
    return card && copy.includes('NURA · HEALTH VIDEO') && copy.includes('THUMBNAIL UNAVAILABLE') ? { card: true, fallbackReady: true } : null;
  })()`), 'Explore did not fall back to title artwork after the supplied thumbnail failed.');
  assert(exploreThumbnailFallback?.fallbackReady, 'Explore did not preserve identifiable branded artwork for the failed thumbnail.');
  await clickVisible({ aria: 'Ask Nura about this video: Synthetic video · LDL and HDL' });
  await waitPath((value) => value.startsWith('/ask') && value.includes('readingSourceId=synthetic-selected-video'));
  const askThumbnailFallback = await waitFor(async () => evaluate(`(() => {
    const card = document.querySelector('[aria-label="Play selected video: Synthetic video · LDL and HDL"]');
    const copy = card?.innerText || '';
    return card && copy.includes('NURA · HEALTH VIDEO') && copy.includes('THUMBNAIL UNAVAILABLE') ? { card: true, fallbackReady: true } : null;
  })()`), 'Ask did not fall back to title artwork after the supplied thumbnail failed.');
  assert(askThumbnailFallback?.fallbackReady, 'Ask did not preserve identifiable branded artwork for the failed thumbnail.');
  await cdp('Network.setBlockedURLs', { urls: [] });
  record('Explore and Ask keep video title artwork and play actions when a provider-supplied thumbnail fails');

  await fillInput({ aria: 'Your question for Nura', value: 'What should I learn from this video?' });
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Selected public video');
  assert((await bodyText()).includes('Synthetic video publisher · title, topic and link'), 'Source consent does not identify the selected video metadata.');
  await clickVisible({ text: 'CONTINUE WITH SELECTED DETAILS' });
  await waitText('video description highlights A short video explaining how LDL and HDL differ', 30_000);
  await waitText('Keep exploring');
  if (process.env.M1_ASK_ANSWER_SCREENSHOT_PATH) {
    await evaluate(`(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      const frame = [...document.querySelectorAll('div')].find((item) => { const style = getComputedStyle(item); return style.maxWidth === '390px' && style.borderRadius === '34px' && style.overflow === 'hidden'; });
      if (frame) { frame.scrollTop = 0; frame.scrollLeft = 0; }
      for (const item of document.querySelectorAll('*')) if (item.scrollWidth > item.clientWidth + 8) item.scrollLeft = 0;
    })()`);
    await delay(320);
    const layout = await evaluate(`(() => {
      const frame = [...document.querySelectorAll('div')].find((item) => { const style = getComputedStyle(item); return style.maxWidth === '390px' && style.borderRadius === '34px' && style.overflow === 'hidden'; });
      const rect = (item) => { const value = item.getBoundingClientRect(); return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) }; };
      const layers = frame ? [...frame.querySelectorAll('div')].filter((item) => { const value = item.getBoundingClientRect(); return value.width > 200 && value.height > 500; }).slice(0, 8).map((item) => ({ box: rect(item), transform: getComputedStyle(item).transform, overflowX: getComputedStyle(item).overflowX, scrollLeft: item.scrollLeft })) : [];
      return { viewport: { width: innerWidth, height: innerHeight, x: scrollX, y: scrollY }, frame: frame ? { ...rect(frame), scrollTop: frame.scrollTop, scrollLeft: frame.scrollLeft } : null, layers };
    })()`);
    log(`Ask preview layout: ${JSON.stringify(layout)}`);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_ASK_ANSWER_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    log(`Captured rendered Ask answer at ${process.env.M1_ASK_ANSWER_SCREENSHOT_PATH}`);
  }
  const sourceAnswerBody = await bodyText();
  const videoFollowUps = await evaluate(`([...document.querySelectorAll('[role="button"]')].filter((item) => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && (item.getAttribute('aria-label') || '').startsWith('Ask: '); }).map((item) => item.getAttribute('aria-label')))`);
  assert(sourceAnswerBody.includes('Explain LDL vs HDL') && sourceAnswerBody.includes('How does my cholesterol result compare') && videoFollowUps.length === 2, `The selected video answer did not offer two compact, context-specific follow-up options: ${JSON.stringify(videoFollowUps)}`);
  assert(sourceAnswerBody.indexOf('Why this is relevant') >= 0 && sourceAnswerBody.indexOf('Why this is relevant') < sourceAnswerBody.indexOf('Keep exploring'), 'The relevance disclosure should appear before the selectable exploration pills.');
  assert(!sourceAnswerBody.includes('HOW THIS WAS ANSWERED') && !sourceAnswerBody.includes('WHAT I COULDN’T CONFIRM'), 'The selected-video answer still shows process or uncertainty panels in the conversational view.');
  await clickVisible({ aria: 'Show why this answer is relevant' });
  const sourceEvidenceBody = await bodyText();
  assert(sourceEvidenceBody.includes('This video appeared because you follow Cholesterol.') && sourceEvidenceBody.includes('Saved health details') && sourceEvidenceBody.includes('LDL cholesterol'), 'The relevance disclosure does not show the selected health area and cited saved detail.');
  record('Selected video opens a natural answer with compact evidence and dynamic context-matched follow-ups');
  await clickVisible({ aria: 'Ask: How does my cholesterol result compare?' });
  const filledFollowUp = await evaluate(`document.querySelector('[aria-label="Your question for Nura"]')?.value || ''`);
  assert(filledFollowUp === 'How does my cholesterol result compare?', 'Tapping a source follow-up did not put that question in the composer.');
  await fillInput({ aria: 'Your question for Nura', value: 'What should I understand from this video?' });
  await clickVisible({ aria: 'Check Nura and continue' });
  await waitText('Choose what Nura can use.');
  const currentChatToggle = await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const conversationId = new URL(location.href).searchParams.get('conversationId');
    const labels = [...document.querySelectorAll('[role="checkbox"]')].map((item) => item.innerText || '');
    const messages = (snapshot?.agentMessages || []).filter((item) => item.conversationId === conversationId).map(({ role, text, readingSource }) => ({ role, text: text?.slice(0, 100), hasReadingSource: Boolean(readingSource) }));
    return { conversationId, labels, messages, body: document.body.innerText.slice(-2200) };
  })()`);
  assert(currentChatToggle.labels.some((label) => label.includes('This conversation') && label.includes('2 recent messages') && label.includes('includes selected media details')), `A video follow-up does not present its earlier turns as context: ${JSON.stringify(currentChatToggle)}`);
  await clickVisible({ text: 'CONTINUE WITH SELECTED DETAILS' });
  const completedVideoFollowUp = await waitFor(async () => evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const conversationId = new URL(location.href).searchParams.get('conversationId');
    const messages = (snapshot?.agentMessages || []).filter((item) => item.conversationId === conversationId);
    return messages.length === 4 && messages.at(-1)?.role === 'assistant' ? messages.at(-1).text : null;
  })()`), 'The selected-video follow-up did not finish and save its answer.', 30_000);
  assert(completedVideoFollowUp?.length > 40, `The persisted video follow-up answer is unexpectedly short: ${completedVideoFollowUp}`);
  record('A follow-up turn can continue the video conversation with its earlier turns available');
  await navigate(`${appOrigin}/ask`);
  await waitText('Let’s look at the whole picture.');
  await clickVisible({ aria: 'Recent conversations' });
  await waitText('Recent conversations');
  await clickVisible({ text: 'Open chat' });
  await waitText('In "Synthetic video · LDL and HDL", the video description highlights');
  const restoredVideo = await evaluate(`Boolean(document.querySelector('[aria-label="Play selected video: Synthetic video · LDL and HDL"]'))`);
  assert(restoredVideo, 'The selected video card did not return with its saved Ask conversation.');
  const savedVideoThread = await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const conversationId = new URL(location.href).searchParams.get('conversationId');
    const conversation = snapshot?.askConversations?.find((item) => item.id === conversationId);
    const messages = (snapshot?.agentMessages || []).filter((item) => item.conversationId === conversationId);
    return conversation ? { ...conversation, messageCount: messages.length } : null;
  })()`);
  assert(savedVideoThread?.title === 'Synthetic video · LDL and HDL' && savedVideoThread.messageCount === 4, `The video title and multi-turn history did not persist: ${JSON.stringify(savedVideoThread)}`);
  record('Selected video title and both user/assistant turns remain linked after app reload');
  await clickVisible({ aria: 'Recent conversations' });
  await waitText('Recent conversations');
  const allRecents = await bodyText();
  assert(allRecents.includes(savedPolicyThread.title) && allRecents.includes(savedVideoThread.title), 'Starting new chats replaced an earlier conversation instead of retaining both in Recents.');
  await clickVisible({ text: 'Close' });
  record('Recents keeps distinct conversations together without merging their histories');
  const sourceCalls = (await readFile(syntheticModelLogPath, 'utf8').catch(() => '')).trim().split(/\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((item) => item.stage === 'selected_reading_answer_returned');
  assert(sourceCalls.length === 2 && sourceCalls.every((item) => item.topic === 'Cholesterol' && item.followUps.length === 2), 'The selected-source turns did not generate context-specific follow-up choices.');
  const searchCalls = (await readFile(syntheticModelLogPath, 'utf8').catch(() => '')).trim().split(/\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((item) => item.stage === 'profile_search_requested');
  assert(searchCalls.length === 5 && searchCalls[4].transcript.includes('What should I learn from this video?') && searchCalls[4].transcript.includes('video description highlights A short video explaining how LDL and HDL differ') && searchCalls[4].transcript.includes('What should I understand from this video?'), 'The second video answer did not receive the earlier user/assistant turns as explicit conversation history.');
  record('Keep exploring stays context matched and the second video answer receives the saved multi-turn history');
}

async function runZeroTopicSkipScenario() {
  log('Clearing the disposable browser profile and starting a fresh zero-topic setup…');
  const cleared = await evaluate(`(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('nura-browser-demo-files');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    return { localStorage: localStorage.length, sessionStorage: sessionStorage.length };
  })()`);
  await cdp('Network.clearBrowserCookies');
  assert(cleared?.localStorage === 0 && cleared?.sessionStorage === 0, 'The disposable browser profile retained local session data before its fresh run.');
  record('Disposable browser profile storage is cleared before re-entering onboarding');

  await navigate(appOrigin);
  await waitPath('/sign-in');
  await clickVisible({ text: 'CONTINUE' });
  await waitText('Enter your access code.');
  await fillInput({ aria: 'Six-digit preview code', value: '720720' });
  await clickVisible({ text: 'CONTINUE' });
  await waitPath('/');
  const restoredSessionBeforeReload = await evaluate(`JSON.parse(localStorage.getItem('nura.synthetic-preview-session.v1') || 'null')`);
  assert(typeof restoredSessionBeforeReload?.accessToken === 'string', 'Successful preview sign-in did not persist the opaque server session.');
  const verifiedSessionStatus = await evaluate(`fetch(${JSON.stringify(`${serviceOrigin}/v1/demo/session`)}, { headers: { authorization: ${JSON.stringify(`Bearer ${restoredSessionBeforeReload.accessToken}`)} } }).then((response) => response.status)`);
  assert(verifiedSessionStatus === 200, 'The issued preview token was not verified by the server.');
  record('Successful preview sign-in stores an opaque token verified by the local server');
  const sessionEndpoint = `${serviceOrigin}/v1/demo/session`;
  const validationRequestIdsBeforeReload = new Set([...requestState.entries()]
    .filter(([, state]) => state.url === sessionEndpoint)
    .map(([requestId]) => requestId));
  await navigate(appOrigin);
  await waitPath('/');
  const startupValidation = await waitFor(async () => [...requestState.entries()].find(([requestId, state]) =>
    !validationRequestIdsBeforeReload.has(requestId) && state.url === sessionEndpoint && state.status === 200),
  'The app did not validate its restored session with the server during startup after reload.');
  assert(startupValidation?.[1]?.state === 'finished', 'The startup session validation request did not finish.');
  const restoredSessionStatus = await evaluate(`fetch(${JSON.stringify(`${serviceOrigin}/v1/demo/session`)}, { headers: { authorization: ${JSON.stringify(`Bearer ${restoredSessionBeforeReload.accessToken}`)} } }).then((response) => response.status)`);
  assert(restoredSessionStatus === 200, 'A valid preview session was not revalidated after browser reload.');
  record('The app revalidates its restored session with the server during startup after browser reload');
  await waitText('START MY PROFILE');
  await clickVisible({ text: 'START MY PROFILE' });
  await waitText('CONTINUE TO HEALTH AREAS');

  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  const nameValidation = await bodyText();
  assert(nameValidation.includes('Add a name or nickname to continue.'), 'A blank required display name was not rejected.');
  record('New-profile setup enforces a display name');

  await fillInput({ aria: 'Profile display name', value: 'Casey Zero' });
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  const countryValidation = await bodyText();
  assert(countryValidation.includes('Choose or enter your country to continue.'), 'A missing required country was not rejected after entering a name.');
  const retainedName = await evaluate("document.querySelector('[aria-label=\"Profile display name\"]')?.value || ''");
  assert(retainedName === 'Casey Zero', 'The synthetic display name was not retained while the missing country was corrected.');
  record('New-profile setup enforces country and retains the entered synthetic name');

  await clickVisible({ aria: 'Select your country' });
  await waitText('Choose your country');
  await clickVisible({ text: 'Malaysia' });
  const countryTextColor = await evaluate(`(() => { const text = document.querySelector('[aria-label="Country: Malaysia. Change country"]')?.firstElementChild; return text ? getComputedStyle(text).color : null; })()`);
  assert(countryTextColor === 'rgb(255, 248, 240)', `The selected country value is not white text (${countryTextColor}).`);
  record('Selected country value uses the warm white text color');
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  assert((await bodyText()).includes('Enter your date of birth to continue.'), 'A missing date of birth was not rejected.');
  record('New-profile setup requires a date of birth');
  await fillInput({ aria: 'Date of birth, required', value: '1990-05-12' });
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  assert((await bodyText()).includes('Enter your height to continue.'), 'A missing required height was not rejected.');
  record('New-profile setup requires height');
  await fillInput({ aria: 'Height in centimetres, required', value: '165' });
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  assert((await bodyText()).includes('Enter your weight to continue.'), 'A missing required weight was not rejected after entering height.');
  record('New-profile setup requires weight');
  await fillInput({ aria: 'Weight in kilograms, required', value: '58' });
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  await waitText('ADD RECORDS OR A NOTE');
  assert(!(await bodyText()).includes('Enter your height to continue.') && !(await bodyText()).includes('Enter your weight to continue.'), 'Valid required measurements did not allow profile setup to continue.');
  record('Valid date of birth, height and weight allow profile setup to continue');
  const selectionCount = await evaluate("document.body.innerText.match(/(\\d+) SELECTED/i)?.[1] || ''");
  assert(Number(selectionCount) === 0, `Expected the second run to start with zero selected health areas; saw ${selectionCount || 'none'}.`);
  assert((await bodyText()).includes('02 / 06'), 'The fresh profile did not show setup stage 2 of 6.');
  assert(!(await bodyText()).includes('Sample report') && !(await bodyText()).includes('Atorvastatin'), 'A fresh profile started with preloaded health or medicine details.');
  record('Profile setup permits zero selected health areas', true, '00 SELECTED');

  await clickVisible({ text: 'ADD RECORDS OR A NOTE' });
  await waitPath('/setup');
  await waitText('03 / 06');
  record('Zero-topic profile reaches the mandatory profile setup checklist');
  await clickVisible({ aria: 'Add a report or photo' });
  const route = await waitPath('/intake?firstRun=true');
  record('Zero-topic profile proceeds to first-run record intake', true, route);
  await waitText('No records to add');
  record('Empty first-run intake offers an explicit no-record choice');
  await clickVisible({ text: 'No records to add' });
  await waitPath('/setup');
  await waitText('No records added');
  await waitText('04 / 06');
  await clickVisible({ text: 'I take no medicines' });
  await waitText('No current medicines');
  await waitText('05 / 06');
  await clickVisible({ text: 'I have no policy to add' });
  await waitText('No policy added');
  await waitText('06 / 06');
  await waitText('Review your profile');
  record('Zero-area profile requires explicit choices for health records, medicines, and insurance before final review');
  await clickVisible({ text: 'FINISH SETUP · OPEN HOME' });
  await waitPath((value) => value.startsWith('/home'));
  await waitText('Your health,');
  await waitText('Clearer insights. A healthier you.');
  await waitText('Start with one detail');
  const zeroAreaHome = await bodyText();
  assert(!zeroAreaHome.includes('118/76') && !zeroAreaHome.includes('Lipid panel') && !zeroAreaHome.includes('Choose your focus areas') && !zeroAreaHome.includes('Your latest reading') && !zeroAreaHome.includes('58 kg') && !zeroAreaHome.includes('165 cm'), 'A clean zero-area Home showed preloaded examples, setup measurements as recent readings, or setup-only area prompts.');
  record('Zero-area profile reaches a useful first-detail Home brief without sample health data or setup prompts');
  assert(zeroAreaHome.includes('Full health timeline') && zeroAreaHome.includes('Reports, notes and care in date order'), 'Home does not expose the full health timeline as a distinct feature.');
  await clickVisible({ aria: 'Open your full health timeline' });
  await waitPath((value) => value.startsWith('/health'));
  record('Home timeline feature opens the full dated health history');

  await cdp('Network.setBlockedURLs', { urls: [sessionEndpoint] });
  await navigate(appOrigin);
  await waitPath('/sign-in', 12_000);
  const unavailableSessionState = await evaluate(`({ stored: localStorage.getItem('nura.synthetic-preview-session.v1'), text: document.body.innerText })`);
  assert(unavailableSessionState?.stored === null, 'An unverified preview session remained stored while the local service was unavailable.');
  assert(unavailableSessionState?.text.includes('could not verify this local preview session'), 'The app did not explain why startup returned to sign-in.');
  await cdp('Network.setBlockedURLs', { urls: [] });
  record('A stalled session check times out, clears the unverified local session, and explains how to retry');
}

async function runJourney() {
  const backendPort = await availablePort();
  const webPort = await availablePort();
  const debugPort = await availablePort();
  // Expo's documented --localhost listener binds to ::1 on this host.
  appOrigin = `http://localhost:${webPort}`;
  serviceOrigin = `http://127.0.0.1:${backendPort}`;
  await mkdir(repositoryDir, { recursive: true, mode: 0o700 });
  if (askEnabled) await installSyntheticModelAdapter();
  const serviceEnv = safeChildEnv({
    NURA_BIND_HOST: '127.0.0.1', NURA_AGENT_PORT: String(backendPort),
    NURA_ALLOWED_ORIGINS: appOrigin, NURA_DEMO_DATA_DIR: repositoryDir,
    OPENAI_API_KEY: askEnabled ? 'synthetic-key-intercepted-in-process' : '',
    ...(askEnabled ? { NURA_SYNTHETIC_ASK_LOG: syntheticModelLogPath, NURA_BLOCKED_MODEL_NETWORK_LOG: blockedModelNetworkLogPath } : {}),
  });
  const serviceArgs = askEnabled ? ['--import', syntheticModelAdapterPath, 'server/index.mjs'] : ['server/index.mjs'];
  launch('isolated service', process.execPath, serviceArgs, serviceEnv);
  await waitFor(() => serviceReady(`${serviceOrigin}/healthz`, askEnabled), 'Isolated service did not start with the expected synthetic provider state.');
  const health = await (await fetch(`${serviceOrigin}/healthz`)).json();
  assert(health.provider?.configured === askEnabled, 'The isolated service provider state did not match this run mode.');
  assert(health.capabilities?.localSampleDocuments === true, 'The exact built-in sample processor is not enabled.');
  record(askEnabled ? 'Loopback service uses a synthetic intercepted Ask adapter' : 'Isolated backend is loopback-only and provider-free', true, askEnabled ? `temporary service port ${backendPort}; model endpoint intercepted locally` : `temporary service port ${backendPort}; OPENAI_API_KEY empty`);

  log('Starting isolated Expo web server in offline mode…');
  launch('isolated Expo web', process.execPath, [
    'node_modules/expo/bin/cli', 'start', '--web', '--port', String(webPort), '--localhost',
  ], safeChildEnv({
    EXPO_PUBLIC_NURA_AGENT_URL: serviceOrigin,
    EXPO_PUBLIC_SAMPLE_PREVIEW: 'true',
    NURA_AGENT_PORT: String(backendPort),
    CI: '1', BROWSER: 'none',
  }));
  await waitFor(async () => {
    try {
      const response = await fetch(appOrigin, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch { return false; }
  }, 'Isolated Expo web app did not become ready.', 150_000);
  log('Isolated Expo web server is ready.');

  const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  await stat(chromePath);
  launch('chrome', chromePath, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-sync', '--disable-extensions', '--disable-translate', '--metrics-recording-only',
    '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${chromeProfile}`,
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1',
    'about:blank',
  ], safeChildEnv({}));
  const reducedMotionEnabled = process.env.M1_REDUCED_MOTION !== 'false';
  log('Starting disposable Chrome with the ' + (reducedMotionEnabled ? 'reduced-motion' : 'standard-motion') + ' preference…');
  const debugBase = `http://127.0.0.1:${debugPort}`;
  await waitFor(() => browserJson(`${debugBase}/json/version`), 'Disposable Chrome could not start.', 30_000);
  const created = await browserJson(`${debugBase}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  await connectCdp(created.webSocketDebuggerUrl);
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotionEnabled ? 'reduce' : 'no-preference' }] });
  const mediaState = await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches");
  assert(mediaState === reducedMotionEnabled, 'Chrome did not emulate the requested motion preference.');
  record(reducedMotionEnabled ? 'Reduced-motion preference is enabled for this acceptance run' : 'Standard motion preference is enabled for this acceptance run');

  await navigate(appOrigin);
  await waitPath('/sign-in');
  await waitText('PRIVATE BY DESIGN');
  const ambientTransforms = () => evaluate(`(() => ['nura-atmosphere-peach-light','nura-atmosphere-lilac-light'].map((testId) => {
    const element = document.querySelector('[data-testid="' + testId + '"]');
    return element ? element.style.transform || getComputedStyle(element).transform : null;
  }))()`);
  const ambientInitial = await waitFor(async () => {
    const values = await ambientTransforms();
    return Array.isArray(values) && values.length === 2 && values.every(Boolean) ? values : false;
  }, 'The shared ambient background did not render both color fields.');
  await delay(1_200);
  const ambientLater = await ambientTransforms();
  const ambientMoved = JSON.stringify(ambientInitial) !== JSON.stringify(ambientLater);
  assert(reducedMotionEnabled ? !ambientMoved : ambientMoved, reducedMotionEnabled
    ? 'The ambient background kept drifting with reduced motion enabled.'
    : 'The ambient background did not drift with standard motion enabled.');
  record(reducedMotionEnabled
    ? 'Shared ambient background stays still when reduced motion is enabled'
    : 'Shared ambient background retains its slow drift when standard motion is enabled');
  await clickVisible({ text: 'CONTINUE' });
  await waitText('Enter your access code.');
  await fillInput({ aria: 'Six-digit preview code', value: '720720' });
  await clickVisible({ text: 'CONTINUE' });
  await waitPath('/');
  await waitText('START MY PROFILE');
  await clickVisible({ text: 'START MY PROFILE' });
  await waitText('CONTINUE TO HEALTH AREAS');
  await fillInput({ aria: 'Profile display name', value: 'Riley Sample' });
  await clickVisible({ aria: 'Select your country' }).catch(async () => {
    await clickVisible({ aria: 'Country: Malaysia. Change country' });
  });
  await waitText('Choose your country');
  await clickVisible({ text: 'Malaysia' });
  await fillInput({ aria: 'Date of birth, required', value: '1990-05-12' });
  await fillInput({ aria: 'Height in centimetres, required', value: '165' });
  await fillInput({ aria: 'Weight in kilograms, required', value: '58' });
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  await waitText('ADD RECORDS OR A NOTE');
  for (const area of ['Blood pressure', 'Cholesterol', 'Sleep', 'Heart health', 'Blood sugar', 'Medicines', 'Family history', 'Joints and movement']) {
    await clickVisible({ aria: `Follow ${area} and choose its context` });
    await waitText('CONTEXT FOR THIS AREA');
    await delay(600); // profile context sheet enters over 550ms in standard motion
    if (area === 'Blood pressure') {
      await clickVisible({ aria: 'Expand Symptoms choices' });
      await clickVisible({ aria: 'Add symptom: Headache' });
      await returnToAreaChoicesFromIntake('SYMPTOM DETAILS · YOUR WORDS');
      await waitFor(async () => evaluate("[...document.querySelectorAll('[aria-label]')].some((el) => el.getAttribute('aria-label') === 'Remove symptom: Headache')"), 'Headache did not enter the selected state after the symptom quick-pick.');
      await waitFor(async () => (await profileContextCount()) === 1, 'The Blood pressure symptom selection did not update the profile context count.');
      await clickVisible({ aria: 'Expand Blood pressure medicine choices' });
      await clickVisible({ aria: 'Add medicine: Amlodipine' });
      await inspectMedicineQuickPick('Amlodipine');
      assert(/01\s+CONTEXT SIGNALS/.test(await bodyText()), 'The symptom should remain a context signal while a medicine quick-pick opens its treatment form.');
      record('Blood pressure symptom becomes self-reported context and its medicine quick-pick opens a prefilled treatment form');
    }
    if (area === 'Cholesterol') {
      const cholesterolChoices = await bodyText();
      assert(cholesterolChoices.includes('TAP TO OPEN · 6 COMMON MEDICINES'), 'The cholesterol medicine tile does not clearly signal that its six common choices can be expanded.');
      await clickVisible({ aria: 'Expand Cholesterol medicine choices' });
      await clickVisible({ aria: 'Add medicine: Rosuvastatin' });
      await inspectMedicineQuickPick('Rosuvastatin');
      assert((await profileContextCount()) === 1, 'A medicine quick-pick was incorrectly counted as a separate profile context signal.');
      record('Cholesterol medicine examples route into a treatment form with the selected name prefilled');
    }
    if (area === 'Sleep') {
      await clickVisible({ aria: 'Expand Sleep medicine choices' });
      await clickVisible({ aria: 'Add medicine: Zopiclone' });
      await inspectMedicineQuickPick('Zopiclone');
      record('Sleep medicine examples open the treatment form without creating an unconfirmed profile topic');
    }
    if (area === 'Heart health') {
      await clickVisible({ aria: 'Expand Heart medicine choices' });
      await clickVisible({ aria: 'Add medicine: Apixaban' });
      await inspectMedicineQuickPick('Apixaban');
      record('Heart health medicine examples open the treatment form with the selected medicine');
    }
    if (area === 'Blood sugar') {
      await clickVisible({ aria: 'Add I have a diagnosis or condition' });
      await waitPath((path) => path.startsWith('/intake?purpose=medical&areaId=sugar&capture=condition'));
      await waitText('CONDITION DETAILS · YOUR WORDS');
      assert((await bodyText()).includes('Name the condition if you know it'), 'Choosing a diagnosis should open a form that asks for self-reported details.');
      await returnToAreaChoicesFromIntake('CONDITION DETAILS · YOUR WORDS');
      assert((await profileContextCount()) === 1, 'Opening the condition form saved an unconfirmed diagnosis to the profile.');
      await clickVisible({ aria: 'Expand Related medicine choices' });
      await clickVisible({ aria: 'Add medicine: Metformin' });
      await inspectMedicineQuickPick('Metformin');
      const conditionSignalBody = await bodyText();
      assert(/01\s+CONTEXT SIGNALS/.test(conditionSignalBody), 'Opening the condition form or medicine quick-pick added an unconfirmed diagnosis to the profile.');
      record('A diagnosis choice opens a self-report details form without inventing a diagnosis');
    }
    if (area === 'Medicines') {
      await clickVisible({ text: 'Add a medicine record' });
      await inspectMedicineAreaAction();
      record('The Medicines area routes directly to the treatment registry and its add form');
    }
    if (area === 'Family history') {
      await clickVisible({ aria: 'Expand Diabetes choices, 7 common family relationships' });
      await clickVisible({ aria: 'Add family relationship: Mother' });
      await returnToAreaChoicesFromIntake('You selected Diabetes · Mother');
      await waitFor(async () => (await profileContextCount()) === 2, 'The family relationship was not saved as context for its selected condition.');
      await clickVisible({ text: 'DONE' });
      await clickVisible({ aria: 'Open context details for Family history' });
      await clickVisible({ aria: 'Expand Diabetes choices, 7 common family relationships' });
      await waitFor(async () => evaluate("[...document.querySelectorAll('[aria-label]')].some((el) => el.getAttribute('aria-label') === 'Remove family relationship: Mother')"), 'The selected family relationship did not remain attached to Diabetes when its context was reopened.');
      record('Family history stores the selected relative with the specific condition and restores it when reopened');
    }
    if (area === 'Joints and movement') {
      await clickVisible({ aria: 'Expand Symptoms choices' });
      await clickVisible({ aria: 'Add symptom: Stiffness' });
      await returnToAreaChoicesFromIntake('SYMPTOM DETAILS · YOUR WORDS');
      await clickVisible({ aria: 'Expand Pain relief medicine choices' });
      await clickVisible({ aria: 'Add medicine: Naproxen' });
      await inspectMedicineQuickPick('Naproxen');
      assert((await profileContextCount()) === 3, 'A joint symptom and medicine quick-pick should remain distinct context and treatment actions.');
      record('Joint symptoms become self-reported context and pain-relief examples open a prefilled treatment form');
    }
    await clickVisible({ text: 'DONE' });
  }
  const selected = await evaluate("document.body.innerText.match(/(\\d+) SELECTED/i)?.[1] || ''");
  assert(Number(selected) === 8, `Expected eight selected focus areas; saw ${selected || 'none'}.`);
  record('Profile journey accepts more than four focus areas', true, 'eight selected; each choice opened its context bubbles');
  await clickVisible({ aria: 'Open context details for Blood sugar' });
  await waitText('CONTEXT FOR THIS AREA');
  record('Tapping a selected main bubble reopens its context choices', true, 'Blood sugar detail panel opened');
  const contextCountBeforeRemovingBloodSugar = await profileContextCount();
  await clickVisible({ aria: 'Remove Blood sugar from your profile' });
  await waitText('07 SELECTED');
  const contextCountAfterRemovingBloodSugar = await profileContextCount();
  assert(contextCountAfterRemovingBloodSugar === contextCountBeforeRemovingBloodSugar, 'Removing Blood sugar changed context signals belonging to another area.');
  record('Removing an area also removes its nested context selections', true, 'selected count and context count both update');
  await clickVisible({ aria: 'Follow Blood sugar and choose its context' });
  await waitText('CONTEXT FOR THIS AREA');
  await clickVisible({ aria: 'Expand Related medicine choices' });
  await clickVisible({ aria: 'Add medicine: Metformin' });
  await inspectMedicineQuickPick('Metformin');
  await clickVisible({ text: 'DONE' });
  await waitText('08 SELECTED');
  if (process.env.M1_PROFILE_SCREENSHOT_PATH) {
    await evaluate("window.scrollTo(0, 0); [...document.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 10).forEach((element) => { element.scrollTop = 0; });");
    await delay(120);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_PROFILE_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    log(`Captured synthetic profile visual at ${process.env.M1_PROFILE_SCREENSHOT_PATH}`);
  }
  await clickVisible({ aria: 'Open context details for Cholesterol' });
  await waitText('CONTEXT FOR THIS AREA');
  await clickVisible({ aria: 'Add a health report or image for Cholesterol' });
  await waitPath((value) => value.startsWith('/intake?purpose=medical&areaId=cholesterol'));
  await waitText('FILE UNDER');
  assert((await bodyText()).includes('Cholesterol'), 'The selected area was not shown on direct report intake.');
  record('A selected topic opens direct, topic-linked report intake');
  await waitText('Preview a report comparison');
  const sampleComparisonCopy = await bodyText();
  assert(sampleComparisonCopy.includes('Two fictional lipid reports · Jan + Apr 2025') && sampleComparisonCopy.includes('Preview →'), 'The sample card does not explain the example and its action.');
  record('The optional example card explains what the comparison demonstrates');
  assert(!(await evaluate("document.body.innerText.includes('OPTIONAL HEALTH NOTE')")), 'The optional self-report prompt is still expanded by default.');
  record('The optional self-report stays tucked away until the user asks to add a note');
  if (process.env.M1_INTAKE_SCREENSHOT_PATH) {
    await evaluate("window.scrollTo(0, 0); [...document.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 10).forEach((element) => { element.scrollTop = 0; });");
    await delay(120);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_INTAKE_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    log(`Captured synthetic intake visual at ${process.env.M1_INTAKE_SCREENSHOT_PATH}`);
  }
  await clickVisible({ aria: 'Add an optional health note' });
  await fillInput({ aria: 'Your health note', value: 'I am tracking changes in my cholesterol after my last blood test.' });
  await clickVisible({ text: 'Preview →' });
  await waitText('2 of 2 sample reports added');
  await clickVisible({ text: 'Review →' });
  await waitPath((value) => value.startsWith('/review'));
  await waitText('FILED UNDER · CHOLESTEROL');
  record('Selected area stays visible into the source-review journey');
  await waitText('Review 2 files with Nura');
  await clickVisible({ text: 'Review 2 files with Nura' });
  await waitText('Read these health files?');
  const consent = await bodyText();
  assert(consent.includes('PL0005-sample-lipid-profile.pdf') && consent.includes('EXAMPLE-lipid-follow-up.pdf'), 'Consent does not list the two expected bundled reports.');
  assert(consent.includes('Filed under Cholesterol') && consent.includes('used for organization'), 'Consent does not disclose the selected health-area context.');
  assert(consent.includes('Example files are checked on this device.'), 'Consent does not clearly identify local-only processing.');
  record('Explicit consent names both exact local sample files and says no provider is called');
  await clickVisible({ text: 'Approve and review examples' });
  await waitText('LIVE FILE CHECKS', 5_000);
  assert(await evaluate("Boolean(document.querySelector('[data-testid=\\\"nura-processing-orb\\\"]'))"), 'The review screen did not show the animated Nura processing orb.');
  if (process.env.M1_REVIEW_SCREENSHOT_PATH) {
    await delay(80);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_REVIEW_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    log(`Captured synthetic live-processing visual at ${process.env.M1_REVIEW_SCREENSHOT_PATH}`);
  }
  await waitText('Report details ready to review', 90_000);
  await waitText('EXAMPLE-lipid-follow-up.pdf', 15_000);
  await waitText('LDL cholesterol', 15_000);
  const activity = await bodyText();
  assert(activity.includes('Example report ready') && activity.includes('Organizing report details'), 'The event-driven processing activity is not visible.');
  assert(!/verified locally|built-in sample mapping|exact PDF checked locally|no AI provider was called/i.test(activity), 'Internal processing diagnostics leaked into the user-facing review.');
  record('Live processing activity uses plain language and hides parser implementation details');

  await clickVisible({ text: 'Include in save', exact: false }).catch(async () => {
    // The note action is a focusable div on native web, so try the exact accessible text fallback.
    await clickVisible({ aria: 'Include in save' });
  });
  await waitText('Undo', 8_000).catch(() => {});

  // Switch away from the last-processed file, review it, then return to the
  // follow-up file. This keeps the exercise a real source switch and avoids
  // relying on tapping an already-selected row to reopen the same review.
  await clickVisible({ aria: 'PL0005-sample-lipid-profile.pdf' });
  await waitText('YOUR SOURCE · 8 DETAILS');

  // Stage an edit and dismissal; deliberately leave other claims pending.
  // Re-selecting the currently open file is a no-op, not a blank loading state.
  await clickVisible({ aria: 'PL0005-sample-lipid-profile.pdf' });
  const sameSelection = await bodyText();
  assert(sameSelection.includes('Total Cholesterol') && !sameSelection.includes('Opening your saved review'), 'Re-selecting the open report cleared its source review.');
  const initialClaimLabel = await evaluate("[...document.querySelectorAll('[role=button]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.includes('Triglyceride') && label.includes('Needs review')) || ''");
  assert(initialClaimLabel, 'Could not identify a pending triglyceride claim by its accessible label.');
  await clickVisible({ aria: initialClaimLabel });
  await clickVisible({ aria: 'Edit Triglyceride' });
  await fillInput({ aria: 'Value for Triglyceride', value: '185' });
  const editedValue = await evaluate("document.querySelector('[aria-label=\"Value for Triglyceride\"]')?.value || ''");
  assert(editedValue === '185', `The review editor did not hold the requested value: ${editedValue}`);
  await clickVisible({ aria: 'Stage edited details for Triglyceride' });
  assert((await bodyText()).includes('Edit staged'), 'The edited value did not remain staged in the review queue.');
  const dismissLabel = await evaluate("[...document.querySelectorAll('[role=button]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.startsWith('HDL Cholesterol,') && label.includes('Needs review')) || ''");
  assert(dismissLabel, 'Could not identify an unreviewed HDL claim.');
  await clickVisible({ aria: dismissLabel });
  const hdlClaimLabel = dismissLabel.split(',')[0];
  await clickVisible({ aria: `Dismiss ${hdlClaimLabel}` });
  await clickVisible({ aria: 'EXAMPLE-lipid-follow-up.pdf' });
  await waitText('YOUR SOURCE · 5 DETAILS');
  await waitText('LDL cholesterol');
  const secondSource = await bodyText();
  assert(secondSource.includes('22 Apr 2025') || secondSource.includes('2025-04-22'), 'The follow-up sample does not show its source event date.');
  const firstClaim = await evaluate("[...document.querySelectorAll('[role=button]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.includes('LDL cholesterol') && label.includes('Needs review')) || ''");
  assert(firstClaim, 'Could not identify a pending LDL claim by its accessible label.');
  await clickVisible({ aria: firstClaim });
  await clickVisible({ aria: `Include: ${firstClaim.split(',')[0]}` });
  await waitText('LDL cholesterol');
  const remainingApril = await stageAllPendingClaims('health');
  await clickVisible({ aria: 'PL0005-sample-lipid-profile.pdf' });
  await waitText('YOUR SOURCE · 8 DETAILS');
  const reopenedJanuaryReview = await bodyText();
  assert(reopenedJanuaryReview.includes('Triglyceride') && reopenedJanuaryReview.includes('Edit staged'), 'The staged triglyceride edit was lost when returning to its source.');
  const remainingJanuary = await stageAllPendingClaims('health', ['Triglyceride']);
  const afterJanuaryDecisions = await bodyText();
  const stagedTriglyceride = await evaluate("[...document.querySelectorAll('[role=button]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.startsWith('Triglyceride') && label.includes('Edit staged')) || ''");
  assert(afterJanuaryDecisions.includes('Triglyceride') && stagedTriglyceride, 'A remaining-suggestion action replaced the staged triglyceride edit.');
  assert(remainingApril + remainingJanuary > 0, 'The sample review did not expose any remaining suggestions to decide.');
  const undecidedClaims = await evaluate(`([...document.querySelectorAll('[role=\"button\"]')].map((el) => el.getAttribute('aria-label') || '').filter((label) => label.includes('Needs review.') && label.includes('source quote and review actions')).length)`);
  assert(undecidedClaims === 0, 'Some extracted health suggestions remain undecided before the profile setup handoff.');
  record('Review queue stages an edit and dismissal, then records an explicit choice for every remaining health suggestion');

  // Perform exactly one save after every extracted suggestion has a user choice.
  await waitText('Save reviewed items');
  await clickVisible({ text: 'Save reviewed items' });
  await waitText('saved to your health record', 30_000);
  const postSaveBody = await bodyText();
  const saveAcknowledged = /saved to your health record/i.test(postSaveBody);
  record('Review screen shows a save completion message', saveAcknowledged, saveAcknowledged ? 'save message is visible' : 'claim state updated, but an earlier source-open notice is still visible');
  await clickVisible({ text: 'Continue profile setup' });
  await waitPath('/setup');
  await waitText('YOUR REGISTRIES · NEXT');
  const setupAfterHealth = await bodyText();
  assert(setupAfterHealth.includes('Health records') && setupAfterHealth.includes('13 details reviewed') && setupAfterHealth.includes('2 files'), 'Profile setup does not carry only the reviewed report details into the health-record checklist.');
  assert(!setupAfterHealth.includes('Height') && !setupAfterHealth.includes('Weight'), 'Profile measurements were incorrectly counted as health records.');
  record('Resolved report review returns to setup without counting profile measurements as records');

  await clickVisible({ text: 'Add or review medicines' });
  await waitPath('/treatment?firstRun=true');
  await waitText('04 / 06');
  await waitText('YOUR MEDICINES');
  if (process.env.M1_TREATMENT_SCREENSHOT_PATH) {
    await evaluate("window.scrollTo(0, 0); [...document.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 10).forEach((element) => { element.scrollTop = 0; });");
    await delay(120);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_TREATMENT_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    log(`Captured synthetic treatment registry at ${process.env.M1_TREATMENT_SCREENSHOT_PATH}`);
  }
  const medicineChoice = await evaluate("[...document.querySelectorAll('[role=button]')].some((el) => el.getAttribute('aria-label') === 'I take no current medicines')");
  assert(medicineChoice, 'The medicine registry does not offer an explicit no-current-medicines choice.');
  const medicineStepCopy = await bodyText();
  assert(medicineStepCopy.includes('Add what you take now, or choose that you take none.') && medicineStepCopy.includes('Save this choice and continue to insurance.'), 'The medicine step does not explain how to continue when the user takes no current medicines.');
  assert(!medicineStepCopy.includes('Your treatment history') && !medicineStepCopy.includes('MEDICINE HISTORY') && !medicineStepCopy.includes('Your current medicines will appear here.') && !medicineStepCopy.includes('Nura keeps the details you enter'), 'The first-run medicine step repeats registry and safety detail that belongs outside setup.');
  await clickVisible({ aria: 'I take no current medicines' });
  await waitPath('/setup');
  await waitText('05 / 06');
  const stageFiveAfterNone = await bodyText();
  assert(stageFiveAfterNone.includes('No current medicines') && stageFiveAfterNone.includes('Insurance'), 'The no-current-medicines choice did not advance profile setup to insurance.');
  record('Explicitly marking no current medicines advances from stage 4 to stage 5');
  await clickVisible({ aria: 'Review or change medicines' });
  await waitPath('/treatment?firstRun=true');
  await waitText('04 / 06');
  await clickVisible({ aria: 'Continue to insurance' });
  await waitPath('/setup');
  await waitText('05 / 06');
  record('Reopening stage 4 after the no-medicines choice keeps a clear path to stage 5');
  await clickVisible({ aria: 'Review or change medicines' });
  await waitPath('/treatment?firstRun=true');
  await waitText('04 / 06');
  await clickVisible({ text: 'Add medicine or treatment' });
  await waitText('What are you taking?');
  await fillInput({ aria: 'MEDICINE OR TREATMENT', value: 'Atorvastatin' });
  await fillInput({ aria: 'DOSE / STRENGTH', value: '10 mg' });
  await fillInput({ aria: 'SCHEDULE', value: 'Once daily' });
  await fillInput({ aria: 'WHAT FOR? · YOUR WORDS', value: 'Cholesterol' });
  await clickVisible({ text: 'ADD TO TREATMENT HISTORY' });
  await waitText('Atorvastatin');
  await waitText('10 mg · Once daily');
  record('A user-entered current medicine is saved with its dose and schedule');
  await clickVisible({ text: 'CONTINUE TO INSURANCE' });
  await waitPath('/setup');
  await waitText('05 / 06');
  await clickVisible({ text: 'Add or review insurance' });
  await waitPath('/insurance?firstRun=true');
  await waitText('05 / 06');
  await waitText('Add a policy document');
  const noPolicyAction = await evaluate("[...document.querySelectorAll('[role=button]')].some((el) => el.getAttribute('aria-label') === 'I have no policy to add')");
  assert(noPolicyAction, 'The Insurance step has no direct option for users without a policy.');
  record('Insurance offers a direct, explicit no-policy choice from the registry');
  await clickVisible({ aria: 'I have no policy to add' });
  await waitPath('/setup');
  await waitText('06 / 06');
  await waitText('FINISH SETUP · OPEN HOME');
  record('Choosing no policy advances from stage 5 to final profile review');
  await clickVisible({ aria: 'Review or change insurance' });
  await waitPath('/insurance?firstRun=true');
  await clickVisible({ text: 'Add a policy document' });
  await waitPath((value) => value.startsWith('/intake?purpose=insurance'));
  await waitText('See how policy review works');
  await clickVisible({ text: 'Preview →' });
  await waitText('Policy added · ready to review');
  await clickVisible({ text: 'Review →' });
  await waitPath((value) => value.startsWith('/review?purpose=insurance'));
  await waitText('Review this file with Nura');
  await clickVisible({ text: 'Review this file with Nura' });
  await waitText('Read these policy files?');
  const policyConsent = await bodyText();
  assert(policyConsent.includes('Nura-Example-Policy-2025.pdf') && policyConsent.includes('Example files are checked on this device.'), 'Insurance consent does not name the example or its local-only processing.');
  record('Insurance review names the synthetic policy and explicitly confirms local-only processing');
  await clickVisible({ text: 'Approve and review examples' });
  await waitText('Policy terms ready to review', 90_000);
  await waitText('Annual medical limit', 15_000);
  const policyActivity = await bodyText();
  assert(policyActivity.includes('Organizing policy terms') && !/verified locally|fixed sample mapping|exact PDF checked locally|no AI provider was called/i.test(policyActivity), 'Insurance review exposes internal sample-processing details to the user.');
  record('Policy review shows the work in plain language without parser/debug copy');
  const annualLimitClaim = await evaluate("[...document.querySelectorAll('[role=button]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.includes('Annual medical limit') && label.includes('Needs review')) || ''");
  assert(annualLimitClaim, 'Could not find the policy limit as a pending review item.');
  if (annualLimitClaim.includes('Show source quote and review actions')) await clickVisible({ aria: annualLimitClaim });
  await clickVisible({ text: 'VIEW SOURCE WORDING' });
  await waitText('HIDE SOURCE WORDING');
  record('Exact source wording remains available only when the user opens it');
  await waitFor(async () => evaluate(`(() => { const el = [...document.querySelectorAll('[role="button"]')].find((item) => item.getAttribute('aria-label') === 'Include policy term: Annual medical limit'); return Boolean(el && el.getAttribute('aria-disabled') !== 'true'); })()`), 'The policy limit action is still processing.', 15_000);
  await clickVisible({ aria: 'Include policy term: Annual medical limit' });
  const remainingPolicyTerms = await stageAllPendingClaims('policy');
  const undecidedPolicyTerms = await evaluate(`([...document.querySelectorAll('[role=\"button\"]')].map((el) => el.getAttribute('aria-label') || '').filter((label) => label.includes('Needs review.') && label.includes('source quote and review actions')).length)`);
  assert(remainingPolicyTerms > 0 && undecidedPolicyTerms === 0, 'The policy review did not resolve every remaining suggested term.');
  await clickVisible({ text: 'Save reviewed items' });
  await waitText('saved to your Insurance Registry', 30_000);
  await clickVisible({ text: 'Continue profile setup' });
  await waitPath('/setup');
  await waitText('FINISH SETUP · OPEN HOME');
  const finalProfileReview = await bodyText();
  assert(finalProfileReview.includes('Atorvastatin') && finalProfileReview.includes('Annual medical limit') && finalProfileReview.includes('Lipid panel · April 2025') && finalProfileReview.includes('Height') && finalProfileReview.includes('165 cm · Self-reported') && finalProfileReview.includes('Weight') && finalProfileReview.includes('58 kg · Self-reported'), 'The final review does not bring profile measurements, health sources, current medicine, and reviewed policy together.');
  record('Final profile review separates self-reported measurements from health reports while bringing all registries together');
  await clickVisible({ text: 'FINISH SETUP · OPEN HOME' });
  await waitPath((value) => value.startsWith('/home'));
  await waitText('Your health,');
  await waitText('Latest markers');
  const homeFrameOffset = await evaluate(`(() => { const frame = [...document.querySelectorAll('div')].find((item) => { const style = getComputedStyle(item); return style.maxWidth === '390px' && style.borderRadius === '34px' && style.overflow === 'hidden'; }); return frame ? { top: frame.scrollTop, left: frame.scrollLeft } : null; })()`);
  assert(homeFrameOffset && homeFrameOffset.top === 0 && homeFrameOffset.left === 0, `Home did not enter at the top of its phone frame (${JSON.stringify(homeFrameOffset)}).`);
  record('Home opens at the top of the phone frame after setup navigation');
  await waitText('Total cholesterol');
  await waitText('22 Apr 2025');
  await waitText('EXAMPLE-lipid-follow-up.pdf');
  await waitText('Ask Nura');
  await waitText('Explore');
  await waitText('Your health areas');
  const homeTileLayout = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('[role="button"]')];
    const isVisible = (item) => { const value = item.getBoundingClientRect(); return value.width > 0 && value.height > 0; };
    const find = (prefix) => buttons.find((item) => isVisible(item) && (item.getAttribute('aria-label') || '').startsWith(prefix));
    const ask = find('Ask Nura about your saved health history');
    const add = find('Add a health record');
    const markerPattern = /^Open (?:Total cholesterol|LDL cholesterol|HDL cholesterol|Triglycerides|Non-HDL cholesterol|Apolipoprotein B \\(ApoB\\)|Cholesterol),/;
    const markers = buttons.filter((item) => {
      const label = item.getAttribute('aria-label') || '';
      return isVisible(item) && markerPattern.test(label) && !label.includes(' saved details');
    });
    const marker = markers.find((item) => (item.getAttribute('aria-label') || '').startsWith('Open Total cholesterol,'));
    const seeAll = buttons.find((item) => isVisible(item) && /^See all \\d+/.test((item.getAttribute('aria-label') || item.innerText || '').trim()));
    const redundantExpand = buttons.find((item) => isVisible(item) && /^Show all \\d+ markers$/.test((item.getAttribute('aria-label') || item.innerText || '').trim()));
    const rect = (item) => { const value = item.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; };
    const seeAllLabel = (seeAll?.getAttribute('aria-label') || seeAll?.innerText || '').trim();
    return { ask: ask ? rect(ask) : null, add: add ? rect(add) : null, marker: marker ? rect(marker) : null, secondMarker: markers[1] ? rect(markers[1]) : null, markerLabels: markers.map((item) => item.getAttribute('aria-label')), seeAllLabel, redundantExpandLabel: redundantExpand?.getAttribute('aria-label') || redundantExpand?.innerText || '', markerCount: Number(seeAllLabel.match(/^See all (\\d+)/)?.[1] || 0), viewportWidth: window.innerWidth, markerFill: marker ? getComputedStyle(marker).backgroundColor : null, visibleActionLabels: buttons.filter((item) => isVisible(item)).map((item) => item.getAttribute('aria-label') || '').filter((label) => /Ask Nura|Add a health record|See all|Open (?:Total cholesterol|LDL cholesterol|HDL cholesterol|Triglycerides)/.test(label)) };
  })()`);
  assert(homeTileLayout && Math.abs(homeTileLayout.ask.y - homeTileLayout.add.y) < 3 && Math.abs(homeTileLayout.ask.x - homeTileLayout.add.x) > 20, `Ask Nura and Add a record are not displayed as a paired Home action row (${JSON.stringify(homeTileLayout)}).`);
  assert(homeTileLayout.marker.width >= homeTileLayout.viewportWidth * 0.8 && Math.abs(homeTileLayout.marker.x - homeTileLayout.secondMarker.x) < 2 && homeTileLayout.secondMarker.y > homeTileLayout.marker.y, 'Home marker cards are not full-width and stacked.');
  assert(homeTileLayout.markerLabels.length >= Math.min(4, homeTileLayout.markerCount), `Home preview omits one or more of its first four markers: ${JSON.stringify(homeTileLayout.markerLabels)}.`);
  const homeCholesterolIndex = homeTileLayout.markerLabels.findIndex((label) => label.startsWith('Open Total cholesterol,') || label.startsWith('Open Cholesterol,'));
  assert(homeCholesterolIndex >= 0 && homeCholesterolIndex <= 1, `Home preview does not surface the saved cholesterol result in its first two cards: ${JSON.stringify(homeTileLayout.markerLabels)}.`);
  assert(homeTileLayout.markerCount > 2 && homeTileLayout.seeAllLabel.startsWith('See all') && homeTileLayout.seeAllLabel.includes('↓'), 'Home does not show a downward “See all” control for the remaining marker cards.');
  assert(!homeTileLayout.redundantExpandLabel, 'Home shows a second marker expansion control outside the heading.');
  assert(homeTileLayout.markerFill === 'rgba(67, 42, 35, 0.48)', `Home marker tile does not use the Nura brown fill (${homeTileLayout.markerFill}).`);
  record('Home shows up to four full-width marker cards, including total cholesterol, with an expandable list and paired Ask/Add actions');
  await clickVisible({ text: `See all ${homeTileLayout.markerCount}` });
  await waitText('Show latest 4');
  const expandedMarkerLabels = await evaluate(`([...document.querySelectorAll('[role="button"]')].filter((item) => { const rect = item.getBoundingClientRect(); const label = item.getAttribute('aria-label') || ''; return rect.width > 0 && rect.height > 0 && !label.includes(' saved details') && /^Open (?:Total cholesterol|LDL cholesterol|HDL cholesterol|Triglycerides|Non-HDL cholesterol|Apolipoprotein B \\(ApoB\\)|Cholesterol),/.test(label); }).map((item) => item.getAttribute('aria-label')))`);
  const expandedMarkerCount = expandedMarkerLabels.length;
  assert(expandedMarkerCount === homeTileLayout.markerCount, `Expanded Home marker list shows ${expandedMarkerCount} cards, expected ${homeTileLayout.markerCount}: ${JSON.stringify(expandedMarkerLabels)}.`);
  record(`“See all ${homeTileLayout.markerCount}” reveals the complete marker set`);
  const returningProfileHome = await bodyText();
  assert(!returningProfileHome.includes('Review a cited summary and what is still unknown.'), 'Home presented a generic Nura placeholder as if it were a saved health insight.');
  record('Home leads with source-dated health markers and keeps followed areas as shortcuts');
  if (process.env.M1_HOME_SCREENSHOT_PATH) {
    const homeMarkerState = () => evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[role="button"]')];
      const visible = (item) => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
      const action = buttons.find((item) => visible(item) && /^See all \\d+/.test((item.getAttribute('aria-label') || item.innerText || '').trim()))
        || buttons.find((item) => visible(item) && /^Show latest 4/.test((item.getAttribute('aria-label') || item.innerText || '').trim()));
      const markers = buttons.filter((item) => visible(item) && /^Open (?:Total cholesterol|LDL cholesterol|HDL cholesterol|Triglycerides|Non-HDL cholesterol|Apolipoprotein B \\(ApoB\\)|Cholesterol),/.test(item.getAttribute('aria-label') || ''));
      return { action: (action?.getAttribute('aria-label') || action?.innerText || '').trim(), markerCount: markers.length };
    })()`);
    const beforeCapture = await homeMarkerState();
    if (beforeCapture?.action.startsWith('Show latest 4')) await clickVisible({ text: 'Show latest 4' });
    const collapsedCapture = await waitFor(async () => {
      const state = await homeMarkerState();
      return state?.action.startsWith(`See all ${homeTileLayout.markerCount}`) ? state : false;
    }, 'The Home visual capture did not return to its default four-marker state.', 10_000);
    assert(collapsedCapture.action.includes('↓'), `Home visual capture is not in its default See-all state: ${JSON.stringify(collapsedCapture)}.`);
    await waitText(`See all ${homeTileLayout.markerCount}`);
    await evaluate("window.scrollTo(0, 0); document.documentElement.scrollLeft = 0; document.body.scrollLeft = 0; [...document.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 10 || element.scrollWidth > element.clientWidth + 10).forEach((element) => { element.scrollTop = 0; element.scrollLeft = 0; });");
    await delay(120);
    const layout = await evaluate(`(() => {
      const frame = [...document.querySelectorAll('div')].find((item) => { const style = getComputedStyle(item); return style.maxWidth === '390px' && style.borderRadius === '34px' && style.overflow === 'hidden'; });
      const rect = (item) => { const value = item.getBoundingClientRect(); return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) }; };
      const layers = frame ? [...frame.querySelectorAll('div')].filter((item) => { const value = item.getBoundingClientRect(); return value.width > 200 && value.height > 500; }).slice(0, 8).map((item) => ({ box: rect(item), transform: getComputedStyle(item).transform, overflowX: getComputedStyle(item).overflowX, scrollLeft: item.scrollLeft })) : [];
      return { viewport: { width: innerWidth, height: innerHeight, x: scrollX, y: scrollY }, frame: frame ? { ...rect(frame), scrollLeft: frame.scrollLeft } : null, layers };
    })()`);
    log(`Home preview layout: ${JSON.stringify(layout)}`);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_HOME_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    log(`Captured synthetic Home visual at ${process.env.M1_HOME_SCREENSHOT_PATH}`);
  }

  // Give the Health UI one valid adult-guide value for each supported marker
  // family. This disposable browser-only data proves that the shared range
  // card renders for every eligible type, not just the sample lipid panel.
  await evaluate(`(() => {
    const key = 'nura-local-demo-v1';
    const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
    const template = snapshot?.facts?.find((fact) => fact.label === 'LDL cholesterol');
    if (!snapshot || !template) throw new Error('A confirmed synthetic fact is required for range-card coverage.');
    const records = [
      ['synthetic-range-hba1c', 'HbA1c', '5.8%'],
      ['synthetic-range-fasting-glucose', 'Fasting glucose', '105 mg/dL'],
      ['synthetic-range-systolic', 'Systolic blood pressure', '100 mmHg'],
    ];
    snapshot.facts = snapshot.facts.filter((fact) => !records.some(([id]) => fact.id === id));
    snapshot.facts.push(...records.map(([id, label, value]) => ({
      ...template, id, label, value, date: '2026-10-04', source: 'Synthetic range verification',
      note: '', validUntil: null, supersedesId: null, status: 'confirmed', reviewState: 'user_confirmed',
    })));
    localStorage.setItem(key, JSON.stringify(snapshot));
  })()`);
  await navigate(`${appOrigin}/health`);
  await waitPath((value) => value.startsWith('/health'));
  await waitText('LATEST MARKERS');
  const allSupportedRangeCards = await evaluate(`(() => {
    const labels = ['Total cholesterol', 'LDL cholesterol', 'HDL cholesterol', 'Triglycerides', 'HbA1c', 'Fasting glucose', 'Systolic blood pressure'];
    const allowedPalette = ['rgb(121, 201, 159)', 'rgb(154, 205, 159)', 'rgb(233, 190, 112)', 'rgb(233, 154, 110)', 'rgb(228, 125, 114)'];
    const cards = [...document.querySelectorAll('[role="button"][aria-label^="Open latest "]')];
    const results = labels.map((label) => {
      const card = cards.find((item) => item.getAttribute('aria-label')?.startsWith('Open latest ' + label + ':'));
      const band = card?.querySelector('[data-testid^="health-marker-range-"]');
      const axis = card?.querySelector('[data-testid^="health-marker-axis-"]');
      const segments = [...(band?.children || [])].slice(0, -1).map((item) => getComputedStyle(item).backgroundColor).filter((color) => color !== 'rgba(0, 0, 0, 0)');
      return { label, found: Boolean(card), hasBand: Boolean(band), hasAxis: Boolean(axis), hasThumb: Boolean(band?.querySelector('div:last-child')), tickCount: axis?.querySelectorAll('[data-testid^="health-marker-tick-"]').length || 0, paletteMatches: segments.length > 0 && segments.every((color) => allowedPalette.includes(color)), segments };
    });
    const nonHdl = cards.find((item) => item.getAttribute('aria-label')?.startsWith('Open latest Non-HDL cholesterol:'));
    const unsupportedHasNoGuide = !nonHdl || !nonHdl.querySelector('[data-testid^="health-marker-range-"]');
    return { results, unsupportedHasNoGuide };
  })()`);
  const missingRangeCards = allSupportedRangeCards.results.filter((item) => !item.found || !item.hasBand || !item.hasAxis || !item.hasThumb || !item.tickCount || item.segments.length < 2 || !item.paletteMatches);
  assert(missingRangeCards.length === 0, `Health did not render the shared colored range card with the approved palette for every supported marker: ${JSON.stringify(allSupportedRangeCards)}.`);
  assert(allSupportedRangeCards.unsupportedHasNoGuide, `Health invented a common colored range for a marker without a supported guide: ${JSON.stringify(allSupportedRangeCards)}.`);
  record('Health renders the shared range card for all seven supported marker types and withholds invented ranges for unsupported markers');
  const healthLatestMarker = await evaluate(`(() => {
    const card = [...document.querySelectorAll('[role="button"][aria-label^="Open latest "]')].find((item) => item.getAttribute('aria-label')?.startsWith('Open latest Total cholesterol:'));
    const band = card?.querySelector('[data-testid^="health-marker-range-latest-"]');
    const rect = (item) => { const value = item?.getBoundingClientRect(); return value ? { top: Math.round(value.top), bottom: Math.round(value.bottom), left: Math.round(value.left), right: Math.round(value.right), height: Math.round(value.height) } : null; };
    const tabs = document.querySelector('[data-testid="health-view-switcher"]') || document.querySelector('[role="tablist"]');
    const tabButtons = [...document.querySelectorAll('[role="tab"]')];
    const tabHeaderBottom = tabs?.getBoundingClientRect().bottom ?? (tabButtons.length ? Math.max(...tabButtons.map((item) => item.getBoundingClientRect().bottom)) : 0);
    const bottomTabs = [...document.querySelectorAll('[role="tab"], [role="button"]')].filter((item) => /^(Home|Explore|Library|Care|You)(?:,? tab.*)?$/i.test((item.getAttribute('aria-label') || item.innerText || '').trim()) && item.getBoundingClientRect().top > window.innerHeight * .55);
    const bottomNavTop = bottomTabs.length ? Math.min(...bottomTabs.map((item) => item.getBoundingClientRect().top)) : window.innerHeight - 68;
    const axis = card?.querySelector('[data-testid^="health-marker-axis-"]');
    const axisRect = rect(axis);
    const ticks = [...(card?.querySelectorAll('[data-testid^="health-marker-tick-"]') || [])].map((item) => {
      const value = item.getBoundingClientRect();
      return { text: item.innerText.trim(), top: Math.round(value.top), bottom: Math.round(value.bottom), left: Math.round(value.left), right: Math.round(value.right) };
    });
    const markerCardCount = [...document.querySelectorAll('[role="button"][aria-label^="Open latest "]')].length;
    return { label: card?.getAttribute('aria-label') || '', text: card?.innerText || '', bandLabel: band?.getAttribute('aria-label') || '', markerCardCount, cardRect: rect(card), bandRect: rect(band), axisRect, ticks, tabHeaderBottom: Math.round(tabHeaderBottom), bottomNavTop: Math.round(bottomNavTop), viewportHeight: window.innerHeight };
  })()`);
  assert(healthLatestMarker?.label.includes('Total cholesterol') && healthLatestMarker.text.includes('DESIRABLE') && healthLatestMarker.text.includes('<200') && healthLatestMarker.bandLabel.includes('Total cholesterol'), `Health does not show the supported Total cholesterol status and range labels in its visible latest-marker card: ${JSON.stringify(healthLatestMarker)}.`);
  assert(healthLatestMarker.markerCardCount >= homeTileLayout.markerCount, `Health limits its latest-marker section to ${healthLatestMarker.markerCardCount} cards while Home has ${homeTileLayout.markerCount} current markers; cholesterol and other markers can disappear: ${JSON.stringify(healthLatestMarker)}.`);
  assert(healthLatestMarker.tabHeaderBottom > 0 && healthLatestMarker.cardRect?.top >= healthLatestMarker.tabHeaderBottom && healthLatestMarker.bandRect?.bottom <= healthLatestMarker.bottomNavTop && healthLatestMarker.cardRect?.bottom <= healthLatestMarker.bottomNavTop, `The initial Health viewport does not fully show the latest Total cholesterol card and range band between the tabs and bottom navigation: ${JSON.stringify(healthLatestMarker)}.`);
  assert(healthLatestMarker.ticks.length === 3 && healthLatestMarker.ticks.every((tick) => tick.top >= healthLatestMarker.axisRect.top && tick.bottom <= healthLatestMarker.axisRect.bottom && tick.left >= healthLatestMarker.cardRect.left && tick.right <= healthLatestMarker.cardRect.right), `A marker threshold label is clipped by its axis or card: ${JSON.stringify(healthLatestMarker)}.`);
  record('Health shows every current marker, including the range-bearing Total cholesterol card');
  if (process.env.M1_HEALTH_SCREENSHOT_PATH) {
    await evaluate("window.scrollTo(0, 0); document.documentElement.scrollLeft = 0; document.body.scrollLeft = 0; [...document.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 10 || element.scrollWidth > element.clientWidth + 10).forEach((element) => { element.scrollTop = 0; element.scrollLeft = 0; });");
    await delay(120);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(process.env.M1_HEALTH_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    log(`Captured synthetic Health range-card visual at ${process.env.M1_HEALTH_SCREENSHOT_PATH}`);
  }
  await clickVisible({ aria: healthLatestMarker.label });
  const expandedHealthGuide = await waitFor(async () => evaluate(`([...document.querySelectorAll('[data-testid^="health-marker-range-fact:"]')].map((item) => item.getAttribute('aria-label') || '').find((label) => label.startsWith('Total cholesterol:')) || '')`), 'Opening the Health marker did not reveal its range guide in the expanded dated report card.', 12_000);
  const expandedHealthText = await bodyText();
  assert(expandedHealthGuide.includes('general adult guide') && expandedHealthText.includes('DESIRABLE') && expandedHealthText.includes('<200') && expandedHealthText.includes('240+'), `The expanded Health report card is missing its status or threshold labels (${expandedHealthGuide}).`);
  record('Expanded Health report cards show the eligible marker status and threshold labels');

  // Exercise the denser systolic scale with a disposable synthetic fact so
  // phone-width ticks cannot regress to clipped “<…” / “14…” labels.
  await evaluate(`(() => {
    const key = 'nura-local-demo-v1';
    const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
    const template = snapshot?.facts?.find((fact) => fact.label === 'LDL cholesterol');
    if (!snapshot || !template) throw new Error('A confirmed synthetic fact is required for the BP scale layout check.');
    snapshot.facts.push({ ...template, id: 'synthetic-bp-range-layout', label: 'Systolic blood pressure', value: '100 mmHg', date: '2025-05-01', source: 'Entered by you', note: '', validUntil: null, supersedesId: null });
    localStorage.setItem(key, JSON.stringify(snapshot));
  })()`);
  await navigate(`${appOrigin}/health`);
  await waitText('Systolic blood pressure');
  const systolicRangeLayout = await evaluate(`(() => {
    const card = [...document.querySelectorAll('[role="button"][aria-label^="Open latest "]')].find((item) => item.getAttribute('aria-label')?.startsWith('Open latest Systolic blood pressure:'));
    const axis = card?.querySelector('[data-testid^="health-marker-axis-"]');
    const rect = (item) => { const value = item.getBoundingClientRect(); return { top: Math.round(value.top), bottom: Math.round(value.bottom), left: Math.round(value.left), right: Math.round(value.right) }; };
    const ticks = [...(axis?.querySelectorAll('[data-testid^="health-marker-tick-"]') || [])].map((item) => ({ text: item.innerText.trim(), box: rect(item), width: item.clientWidth, scrollWidth: item.scrollWidth }));
    const axisBox = axis ? rect(axis) : null;
    const cardBox = card ? rect(card) : null;
    const overlap = ticks.some((tick, index) => ticks.slice(index + 1).some((other) => Math.abs(tick.box.top - other.box.top) < 2 && tick.box.right > other.box.left && other.box.right > tick.box.left));
    return { title: card?.getAttribute('aria-label') || '', text: card?.innerText || '', axisBox, cardBox, ticks, overlap };
  })()`);
  assert(systolicRangeLayout.ticks.map((tick) => tick.text).join('|') === '<90|90|120|130|140+', `The systolic scale lost a threshold label: ${JSON.stringify(systolicRangeLayout)}.`);
  assert(systolicRangeLayout.ticks.every((tick) => tick.width >= 30 && tick.scrollWidth <= tick.width + 1 && tick.box.top >= systolicRangeLayout.axisBox.top && tick.box.bottom <= systolicRangeLayout.axisBox.bottom && tick.box.left >= systolicRangeLayout.cardBox.left && tick.box.right <= systolicRangeLayout.cardBox.right) && !systolicRangeLayout.overlap, `The systolic scale has a clipped or crowded threshold label: ${JSON.stringify(systolicRangeLayout)}.`);
  record('Systolic marker thresholds remain readable and separated on the shared range card');
  await evaluate(`(() => {
    const key = 'nura-local-demo-v1';
    const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
    if (!snapshot) throw new Error('Synthetic profile disappeared during the BP scale layout check.');
    snapshot.facts = snapshot.facts.filter((fact) => fact.id !== 'synthetic-bp-range-layout');
    localStorage.setItem(key, JSON.stringify(snapshot));
  })()`);
  await navigate(`${appOrigin}/health`);
  await waitText('Total cholesterol');

  await navigate(`${appOrigin}/registry?topicId=cholesterol`);
  await waitPath((value) => value.startsWith('/registry') && value.includes('topicId=cholesterol'));
  await waitText('SOURCE-LINKED HISTORY');
  await waitText('PL0005-sample-lipid-profile.pdf');
  await waitText('Triglyceride');
  const history = await bodyText();
  assert(history.includes('185'), 'Edited value is missing from the selected topic registry.');
  assert(history.includes('LDL cholesterol') && history.includes('104'), 'Accepted follow-up source claim is missing from the selected topic registry.');
  assert(history.includes('PL0005-sample-lipid-profile.pdf') && history.includes('EXAMPLE-lipid-follow-up.pdf'), 'Selected topic registry is missing one of its filed source reports.');
  assert(!/HDL Cholesterol\s+37 mg\/dL/.test(history), 'Dismissed claim appears as an accepted topic-registry fact.');
  const ldlHistory = await evaluate(`(() => { const group = document.querySelector('[data-testid=\"registry-marker-history-ldl\"]'); return { text: group?.innerText || '', sourceActions: group?.querySelectorAll('[aria-label^=\"Open LDL cholesterol reading\"]').length || 0 }; })()`);
  assert(ldlHistory.text.includes('48 mg/dL') && ldlHistory.text.includes('104 mg/dL') && ldlHistory.sourceActions >= 2, `The Medical Registry did not keep dated LDL results together under one marker with separate source links: ${JSON.stringify(ldlHistory)}.`);
  record('Medical Registry groups multiple dated LDL results into one marker history with source navigation');
  record('Selected Cholesterol registry shows its filed reports and accepted source-linked details together');

  const beforeReload = await evaluate('location.href');
  await navigate(beforeReload);
  await waitFor(async () => (await bodyText()).includes('Triglyceride') && (await bodyText()).includes('185'), 'Saved health history did not persist after reload.', 30_000);
  await waitText('LDL cholesterol');
  record('Accepted and edited topic registry persists after reload in a fresh browser profile');

  await clickVisible({ text: '＋ Record a health marker' });
  await waitText('Record a Cholesterol marker');
  await waitText('LDL cholesterol');
  record('A person can open the dated marker form directly from a health-area registry');
  await clickVisible({ text: 'LDL cholesterol' });
  await fillInput({ aria: 'Value for LDL cholesterol', value: '115' });
  await fillInput({ aria: 'Health marker measurement date in year-month-day format', value: '2025-04-22' });
  await clickVisible({ text: 'CHECK AND SAVE VALUE' });
  await waitText('A saved record has a different value.');
  const firstMarkerConflict = await bodyText();
  assert(firstMarkerConflict.includes('115 mg/dL') && firstMarkerConflict.includes('104 mg/dL') && firstMarkerConflict.includes('Both entries are for 2025-04-22'), 'The registry did not compare the manually entered LDL value with the report value from the same date.');
  record('Same-day manual and report LDL values trigger an animated, source-aware comparison');
  await clickVisible({ text: 'KEEP THE SAVED VALUE' });
  await waitText('Kept the saved LDL cholesterol value.');
  const savedValueKept = await bodyText();
  assert(savedValueKept.includes('104 mg/dL') && !savedValueKept.includes('115 mg/dL'), 'Keeping the report value also saved the rejected manual value.');
  record('Choosing the saved report value leaves the manual alternative out of the active registry');

  await clickVisible({ text: '＋ Record a health marker' });
  await waitText('Record a Cholesterol marker');
  await clickVisible({ text: 'LDL cholesterol' });
  await fillInput({ aria: 'Value for LDL cholesterol', value: '99' });
  await fillInput({ aria: 'Health marker measurement date in year-month-day format', value: '2025-04-22' });
  await clickVisible({ text: 'CHECK AND SAVE VALUE' });
  await waitText('A saved record has a different value.');
  await clickVisible({ text: 'USE MY VALUE · KEEP THE OLD ENTRY IN HISTORY' });
  await waitText('Your LDL cholesterol value is now active.');
  const manualValueKept = await bodyText();
  assert(manualValueKept.includes('99 mg/dL') && manualValueKept.includes('104 mg/dL'), 'Choosing the manual value did not keep both the active entry and the earlier source value visible.');
  record('Choosing the manual value preserves the earlier source-linked value in registry history');

  const markerRegistryUrl = await evaluate('location.href');
  await navigate(markerRegistryUrl);
  await waitFor(async () => {
    const text = await bodyText();
    return text.includes('99 mg/dL') && text.includes('104 mg/dL') ? text : false;
  }, 'The active manual LDL value or the earlier report value did not persist after registry reload.', 30_000);
  record('Manual marker choice and the source-linked prior value persist after reload');

  const feedSeed = await evaluate(`(() => {
    const key = 'nura-local-demo-v1';
    const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
    if (!snapshot || snapshot.version !== 1 || snapshot.demoOnly !== true) throw new Error('The isolated demo snapshot is unavailable.');
    const retrievedAt = new Date().toISOString();
    if (!snapshot.topics.some((topic) => topic.label === 'Cholesterol')) snapshot.topics.push({ id: 'cholesterol', label: 'Cholesterol' });
    snapshot.feedItems = [
      { id: 'synthetic-reading-save', title: 'Synthetic reading · cholesterol overview', detail: 'A complete source summary about cholesterol results, what the values mean, and which parts of a lipid panel help interpret them. This deliberately long synthetic description verifies that Explore exposes the full text when a mobile card shows only a preview. FINAL SOURCE SENTENCE REMAINS VISIBLE.', url: 'https://example.test/health/cholesterol-overview', publisher: 'Synthetic publisher', topic: 'Cholesterol', retrievedAt, saved: false, dismissed: false },
      { id: 'synthetic-reading-hide', title: 'Synthetic reading · understanding a lipid panel', detail: 'Synthetic acceptance item for the hidden reading journey.', url: 'https://example.test/health/lipid-panel', publisher: 'Synthetic publisher', topic: 'Cholesterol', retrievedAt: new Date(Date.now() - 1000).toISOString(), saved: false, dismissed: false },
      { id: 'synthetic-reading-current-ldl', title: 'Synthetic reading · LDL cholesterol and your report', detail: 'How to understand an LDL cholesterol result in a lipid panel.', url: 'https://example.test/health/ldl-report', publisher: 'Synthetic publisher', topic: 'Cholesterol', retrievedAt: new Date(Date.now() - 2000).toISOString(), saved: false, dismissed: false },
    ];
    localStorage.setItem(key, JSON.stringify(snapshot));
    const currentLdl = snapshot.facts.some((fact) => fact.label === 'LDL cholesterol' && fact.value === '99 mg/dL' && ['confirmed', 'reviewed'].includes(fact.status) && fact.reviewState === 'user_confirmed' && !fact.validUntil);
    return { count: snapshot.feedItems.length, topic: snapshot.topics.find((topic) => topic.label === 'Cholesterol')?.label, currentLdl };
  })()`);
  assert(feedSeed?.count === 3 && feedSeed.topic === 'Cholesterol' && feedSeed.currentLdl, 'The isolated Explore feed fixtures or current LDL evidence were not prepared.');
  await navigate(`${appOrigin}/services`);
  await waitText('YOUR HEALTH LIBRARY');
  const exploreSearchPurpose = await bodyText();
  const hasEditionFilter = await evaluate(`Array.from(document.querySelectorAll('input, textarea')).some((input) => input.getAttribute('placeholder') === 'Filter this edition' || input.getAttribute('aria-label') === 'Filter articles and videos already in this edition')`);
  assert(hasEditionFilter && exploreSearchPurpose.includes('This only filters sources already loaded') && exploreSearchPurpose.includes('WANT A FRESH PULL?') && exploreSearchPurpose.includes('Search selected topics for new articles and videos'), 'Explore does not distinguish local filtering from a fresh trusted-source search.');
  record('Explore explains the local edition filter and the separate fresh-source search');
  await clickVisible({ aria: 'Search for new articles and videos using health topics' });
  await waitText('Find more trusted learning');
  const freshSearchConsent = await bodyText();
  assert(freshSearchConsent.includes('only the generalized topics selected above') && freshSearchConsent.includes('Relevant confirmed details can shape your reading notes'), 'Fresh-source search does not explain its public-topic and private-context boundaries.');
  record('Explore clearly explains topic-only public search and optional private context for personalized notes');
  await clickVisible({ aria: 'Close search settings' });
  await clickVisible({ text: '3 ARTICLES · 0 VIDEOS' });
  await waitText('Synthetic reading · cholesterol overview');
  const sourceCopy = await bodyText();
  const rankedArticleButtons = await evaluate(`([...document.querySelectorAll('button,[role="button"]')].filter((item) => (item.getAttribute('aria-label') || '').startsWith('Save Synthetic reading ·')).map((item) => item.getAttribute('aria-label')))`);
  const directMatchRank = rankedArticleButtons.findIndex((label) => label.includes('LDL cholesterol and your report'));
  const broadOverviewRank = rankedArticleButtons.findIndex((label) => label.includes('cholesterol overview'));
  assert(directMatchRank >= 0 && broadOverviewRank >= 0 && directMatchRank < broadOverviewRank, `Explore did not rank a source about the current LDL result ahead of general cholesterol reading: ${JSON.stringify(rankedArticleButtons)}.`);
  record('Explore ranks connected same-topic reading using current saved evidence on-device');
  assert(sourceCopy.includes('PUBLISHED HEADLINE') && sourceCopy.includes('SOURCE SUMMARY'), 'An unpersonalized feed card did not clearly distinguish publisher copy from Nura notes.');
  assert(sourceCopy.includes('On this device, this source matches your saved LDL cholesterol'), 'Relevant saved context was not shown as an on-device relevance cue.');
  assert(!sourceCopy.includes('Your LDL result, in context'), 'A template headline was presented as a personalized reading note.');
  await clickVisible({ aria: 'Read full source summary for Synthetic reading · cholesterol overview' });
  await waitText('FINAL SOURCE SENTENCE REMAINS VISIBLE.');
  record('Explore card summaries reveal their complete source text from an accessible expand control');
  await clickVisible({ aria: 'Save Synthetic reading · cholesterol overview for later' });
  await waitFor(async () => evaluate(`JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}').feedItems?.find((item) => item.id === 'synthetic-reading-save')?.saved === true`), 'The saved reading choice was not written to the browser profile.');
  await clickVisible({ text: 'Saved · 1', exact: true });
  await waitText('Synthetic reading · cholesterol overview');
  record('Explore uses publisher copy without a template note and keeps matched health context on-device');
  record('Explore lets a person save a reading and find it in Saved');

  await navigate(`${appOrigin}/services`);
  await clickVisible({ text: 'Saved · 1', exact: true });
  await expandAllTopicsIfCollapsed();
  await waitText('Synthetic reading · cholesterol overview');
  record('Saved Explore reading survives a full browser reload');

  await clickVisible({ text: 'For you', exact: true });
  await expandAllTopicsIfCollapsed();
  await clickVisible({ aria: 'Hide Synthetic reading · understanding a lipid panel from For you' });
  await waitFor(async () => evaluate(`JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}').feedItems?.find((item) => item.id === 'synthetic-reading-hide')?.dismissed === true`), 'The hidden reading choice was not written to the browser profile.');
  await clickVisible({ text: 'Hidden · 1', exact: true });
  await expandAllTopicsIfCollapsed();
  await waitText('Synthetic reading · understanding a lipid panel');
  record('Explore keeps a hidden reading available in the Hidden collection');

  await navigate(`${appOrigin}/services`);
  await clickVisible({ text: 'Hidden · 1', exact: true });
  await expandAllTopicsIfCollapsed();
  await waitText('Synthetic reading · understanding a lipid panel');
  record('Hidden Explore reading survives a full browser reload');

  const homeVideoSeed = await evaluate(`(() => {
    const key = 'nura-local-demo-v1';
    const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
    if (!snapshot || snapshot.version !== 1 || snapshot.demoOnly !== true) throw new Error('The isolated demo snapshot is unavailable.');
    const retrievedAt = new Date().toISOString();
    snapshot.feedItems = [...(snapshot.feedItems || []),
      { id: 'synthetic-home-video-ldl', title: 'Synthetic home video · LDL and HDL', detail: 'A general video about a lipid panel and cholesterol.', url: 'https://www.youtube.com/watch?v=CholVid0011', publisher: 'Synthetic video publisher', topic: 'Cholesterol', retrievedAt, saved: false, dismissed: false },
      { id: 'synthetic-home-video-food', title: 'Synthetic home video · everyday cholesterol', detail: 'A general video about food patterns and cholesterol.', url: 'https://www.youtube.com/watch?v=CholVid0022', publisher: 'Synthetic video publisher', topic: 'Cholesterol', retrievedAt: new Date(Date.now() - 1000).toISOString(), saved: false, dismissed: false },
    ];
    localStorage.setItem(key, JSON.stringify(snapshot));
    return snapshot.feedItems.filter((item) => item.id.startsWith('synthetic-home-video-')).length;
  })()`);
  assert(homeVideoSeed === 2, 'The isolated Home video fixtures were not prepared.');
  await navigate(`${appOrigin}/home`);
  await waitText('Worth a closer look.');
  await waitText('Synthetic home video · LDL and HDL');
  await waitText('Synthetic home video · everyday cholesterol');
  await clickVisible({ aria: 'Show relevance details for Synthetic home video · LDL and HDL' });
  const firstVideoMap = await bodyText();
  assert(firstVideoMap.includes('HEALTH AREA USED FOR SEARCH') && firstVideoMap.includes('RELATED SAVED CONTEXT') && firstVideoMap.includes('LDL cholesterol'), 'Home did not map the first video to its selected area and saved context.');
  record('Home video relevance map connects the selected topic to confirmed saved context');
  await clickVisible({ aria: 'Show relevance details for Synthetic home video · everyday cholesterol' });
  const openHomeVideoMaps = await evaluate(`document.querySelectorAll('[aria-label^="Hide relevance details for Synthetic home video"]').length`);
  assert(openHomeVideoMaps === 2, 'Each Home video does not have its own relevance mapping.');
  record('Every visible Home video has an independently expandable relevance mapping');
  await navigate(`${appOrigin}/privacy`);
  await waitText('Take your records with you');
  await evaluate(`(() => {
    window.__nuraExportBlob = null;
    window.__nuraExportFileName = '';
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__nuraExportBlob = blob; return originalCreateObjectUrl(blob); };
    HTMLAnchorElement.prototype.click = function () { window.__nuraExportFileName = this.download; };
  })()`);
  await waitFor(async () => evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="button"]')].find((item) => (item.innerText || '').includes('Download my Nura data'));
    return Boolean(button && button.getAttribute('aria-disabled') !== 'true');
  })()`), 'The local privacy export action is still loading.', 15_000);
  await clickVisible({ text: 'Download my Nura data' });
  await waitText('Create a copy of your Nura data?');
  await clickVisible({ text: 'Create export' });
  await waitText('Your Nura data export is ready with the available original files.');
  const privacyExport = await evaluate(`(async () => {
    const blob = window.__nuraExportBlob;
    if (!blob) return { error: 'export archive was not generated' };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder();
    const entries = new Map();
    let offset = 0;
    while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
      const method = view.getUint16(offset + 8, true);
      const size = view.getUint32(offset + 22, true);
      const nameLength = view.getUint16(offset + 26, true);
      const extraLength = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
      const contentsStart = nameStart + nameLength + extraLength;
      if (method !== 0) return { error: 'archive entry used an unsupported compression mode' };
      entries.set(name, bytes.slice(contentsStart, contentsStart + size));
      offset = contentsStart + size;
    }
    const manifestBytes = entries.get('nura-export.json');
    if (!manifestBytes) return { error: 'archive manifest is missing' };
    const manifest = JSON.parse(decoder.decode(manifestBytes));
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || '{}');
    const originalSources = manifest.sources.filter((source) => source.originalFileIncluded);
    const originalsMatch = await Promise.all(originalSources.map(async (source) => {
      const asset = snapshot.assets.find((item) => item.id === source.id);
      if (!asset?.uri?.startsWith('nura-local-asset://')) return false;
      const id = decodeURIComponent(asset.uri.slice('nura-local-asset://'.length));
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('nura-browser-demo-files', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      });
      const original = await new Promise((resolve, reject) => {
        const request = db.transaction('assets', 'readonly').objectStore('assets').get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Saved local file read failed'));
      });
      const archiveCopy = entries.get(source.archivePath);
      if (!original || !archiveCopy || original.size !== archiveCopy.byteLength) return false;
      const originalBytes = new Uint8Array(await original.arrayBuffer());
      return originalBytes.every((byte, index) => byte === archiveCopy[index]);
    }));
    return {
      mime: blob.type,
      fileName: window.__nuraExportFileName,
      entryCount: entries.size,
      sourceCount: manifest.sources.length,
      includedOriginals: originalSources.length,
      allOriginalsMatch: originalsMatch.length > 0 && originalsMatch.every(Boolean),
      includesPrivateUri: decoder.decode(manifestBytes).includes('file://') || decoder.decode(manifestBytes).includes('nura-local-asset://'),
    };
  })()`);
  assert(privacyExport?.mime === 'application/zip' && privacyExport.fileName?.endsWith('.zip') && privacyExport.entryCount >= 2 && privacyExport.sourceCount >= 2 && privacyExport.includedOriginals >= 1 && privacyExport.allOriginalsMatch && !privacyExport.includesPrivateUri, `The local privacy export was incomplete or exposed a device URI: ${JSON.stringify(privacyExport)}`);
  record('Privacy export packages source-linked records with exact local originals and omits device URIs', true, `${privacyExport.includedOriginals} original files verified by byte match`);

  await navigate(`${appOrigin}/insurance`);
  await waitText('POLICY AT A GLANCE');
  const hasApprovedTermExpand = await evaluate("[...document.querySelectorAll('[aria-label]')].some((el) => (el.getAttribute('aria-label') || '').startsWith('Show all ') && (el.getAttribute('aria-label') || '').endsWith(' approved policy terms'))");
  assert(hasApprovedTermExpand, 'The approved policy term list does not expose an accessible expand control.');
  const savedPolicyBody = await bodyText();
  assert(savedPolicyBody.includes('11 current entries') && savedPolicyBody.includes('EXPLICIT EXCLUSIONS') && savedPolicyBody.includes('POLICY AT A GLANCE'), 'The saved Insurance Registry does not show the linked source, approved-term summary, and evidence categories.');
  record('The source-linked Insurance Registry opens with its approved-term summary and accessible expansion control');
  await navigate(`${appOrigin}/insurance`);
  await waitText('POLICY AT A GLANCE');
  record('The reviewed policy registry survives browser route re-entry');
  if (askEnabled) await runAskBrowserJourney();

  await navigate(`${appOrigin}/privacy`);
  await waitText('What Nura has right now');
  await clickVisible({ text: 'Health details' });
  const sourceFact = await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const fact = snapshot?.facts?.find((item) => item.sourceId && item.sourceClaimId && !item.validUntil && item.reviewState !== 'user_retracted');
    return fact ? { id: fact.id, label: fact.label, sourceId: fact.sourceId, sourceClaimId: fact.sourceClaimId } : null;
  })()`);
  assert(sourceFact, 'The isolated profile has no active source-linked health detail for the privacy removal acceptance.');
  await clickVisible({ aria: `Remove ${sourceFact.label} from active profile` });
  await waitText(`Remove “${sourceFact.label}” from your active profile?`);
  await clickVisible({ text: 'Remove detail' });
  await waitText(`“${sourceFact.label}” was removed from your active profile.`);
  const serverRetraction = await evaluate(`(async () => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const fact = snapshot?.facts?.find((item) => item.id === ${JSON.stringify(sourceFact.id)});
    const session = JSON.parse(localStorage.getItem('nura.synthetic-preview-session.v1') || 'null');
    const response = await fetch(${JSON.stringify(`${serviceOrigin}/v1/intake/sources/`)} + encodeURIComponent(${JSON.stringify(sourceFact.sourceId)}) + '/claims', { headers: { authorization: 'Bearer ' + session.accessToken } });
    const body = await response.json();
    const claim = body.claims?.find((item) => item.id === ${JSON.stringify(sourceFact.sourceClaimId)});
    return { factState: fact?.reviewState, factValidUntil: fact?.validUntil, claimState: claim?.evidenceState };
  })()`);
  assert(serverRetraction?.factState === 'user_retracted' && serverRetraction.factValidUntil && serverRetraction.claimState === 'user_retracted', `Source-linked privacy removal did not update both the active profile and its source review: ${JSON.stringify(serverRetraction)}`);
  record('Privacy removes a selected source-backed health detail while retaining its source and history');

  const localFact = await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const fact = snapshot?.facts?.find((item) => !item.sourceClaimId && !item.validUntil && item.reviewState !== 'user_retracted');
    return fact ? { id: fact.id, label: fact.label } : null;
  })()`);
  assert(localFact, 'The isolated profile has no active local-only health detail for the privacy removal acceptance.');
  await clickVisible({ aria: `Remove ${localFact.label} from active profile` });
  await waitText(`Remove “${localFact.label}” from your active profile?`);
  await clickVisible({ text: 'Remove detail' });
  await waitText(`“${localFact.label}” was removed from your active profile.`);
  const localRetraction = await evaluate(`(() => {
    const snapshot = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const fact = snapshot?.facts?.find((item) => item.id === ${JSON.stringify(localFact.id)});
    return { state: fact?.reviewState, validUntil: fact?.validUntil, hasSourceClaim: Boolean(fact?.sourceClaimId) };
  })()`);
  assert(localRetraction?.state === 'user_retracted' && localRetraction.validUntil && !localRetraction.hasSourceClaim, `Local-only privacy removal did not preserve the historical fact state: ${JSON.stringify(localRetraction)}`);
  record('Privacy removes a selected local-only detail from the active profile without a service call');

  await navigate(`${appOrigin}/visits`);
  await waitText('VISITS + CARE');
  await clickVisible({ text: 'ADD A VISIT OR START A BRIEF' });
  await fillInput({ placeholder: 'e.g. Cardiology follow-up', value: 'Synthetic cardiology follow-up' });
  await fillInput({ placeholder: 'Leave blank if not scheduled', value: '2026-11-10' });
  await fillInput({ placeholder: 'Name or care team', value: 'Synthetic care team' });
  await fillInput({ placeholder: 'Hospital, clinic, or telehealth', value: 'Synthetic clinic' });
  await clickVisible({ text: 'SAVE VISIT · CHOOSE WHAT GOES WITH YOU' });
  await waitText('What should go with you?');
  const visitChoiceText = await bodyText();
  assert(!visitChoiceText.includes('Policy number') && !visitChoiceText.includes('Annual medical limit'), 'Insurance policy terms leaked into the visit brief’s confirmed health-detail choices.');
  const selectedLdl = await evaluate(`([...document.querySelectorAll('[role="checkbox"]')].find((item) => /LDL cholesterol/i.test(item.innerText || ''))?.getAttribute('aria-checked') || '')`);
  const ldlCheckbox = await evaluate(`([...document.querySelectorAll('[role="checkbox"]')].find((item) => /LDL cholesterol/i.test(item.innerText || ''))?.innerText || '')`);
  assert(ldlCheckbox, 'The visit brief did not offer the confirmed synthetic LDL result.');
  if (selectedLdl !== 'true') await clickVisible({ text: 'LDL Cholesterol' });
  await fillInput({ placeholder: 'Write a question in your own words', value: 'What should I follow up after this result?' });
  await clickVisible({ text: 'ADD' });
  await clickVisible({ text: 'PREVIEW MY BRIEF' });
  await waitText('Ready to review.');
  const briefText = await bodyText();
  assert(/LDL cholesterol/i.test(briefText) && briefText.includes('What should I follow up after this result?') && briefText.includes('Nothing has been shared.'), 'The visit brief did not preserve the selected source, question, or local-only disclosure.');
  record('Visit brief includes only a selected confirmed result and user-written question, with no automatic sharing');
  await clickVisible({ text: 'DONE FOR NOW' });
  await waitText('Synthetic cardiology follow-up');
  await clickVisible({ text: 'ADD WHAT HAPPENED' });
  await fillInput({ placeholder: 'What did you discuss or decide?', value: 'Synthetic note from the appointment.' });
  await fillInput({ aria: 'Follow-up action', value: 'Request the complete lipid report' });
  await fillInput({ aria: 'Follow-up due date', value: '2026-11-17' });
  await clickVisible({ text: 'ADD ACTION' });
  await waitText('Request the complete lipid report');
  await clickVisible({ text: 'SAVE VISIT OUTCOME' });
  await waitText('Synthetic note from the appointment.');
  await clickVisible({ aria: 'Mark follow-up action: Request the complete lipid report' });
  await waitText('COMPLETED BY YOU');
  await cdp('Page.reload');
  await waitPath((value) => value.startsWith('/visits'));
  await waitText('Past · 1');
  await clickVisible({ text: 'Past · 1' });
  await clickVisible({ text: 'Synthetic cardiology follow-up' });
  const restoredVisit = await bodyText();
  assert(restoredVisit.includes('Synthetic note from the appointment.') && restoredVisit.includes('Request the complete lipid report') && restoredVisit.includes('COMPLETED BY YOU'), 'The completed visit, note, or follow-up state did not survive browser reload.');
  record('Visit outcome and completed dated follow-up remain connected after reload');

  await clickVisible({ aria: 'Back to previous step' });
  await waitText('VISITS + CARE');
  await clickVisible({ text: 'ADD A VISIT OR START A BRIEF' });
  await fillInput({ placeholder: 'e.g. Cardiology follow-up', value: 'Unscheduled synthetic care brief' });
  await clickVisible({ text: 'SAVE VISIT · CHOOSE WHAT GOES WITH YOU' });
  await waitText('What should go with you?');
  await clickVisible({ aria: 'Back to previous step' });
  await waitText('Unscheduled synthetic care brief');
  assert((await bodyText()).includes('UNSCHEDULED'), 'An unscheduled care brief was given an invented date.');
  record('Unscheduled care brief remains explicitly undated');

  await navigate(`${appOrigin}/health`);
  await waitText('Timeline');
  await clickVisible({ aria: 'View health connections' });
  await waitText('Connections');
  await clickVisible({ text: 'CONNECT SAVED ITEMS' });
  await waitText('Choose the first item');
  const cholesterolTopicChoice = await evaluate(`([...document.querySelectorAll('[role="button"][aria-label]')].map((item) => item.getAttribute('aria-label') || '').find((label) => /^Cholesterol, Chosen health area$/i.test(label)) || '')`);
  assert(cholesterolTopicChoice, 'The connection builder did not offer the selected Cholesterol area.');
  await clickVisible({ aria: cholesterolTopicChoice });
  await waitText('Choose the second item');
  const connectionFact = await evaluate(`(() => {
    const profile = JSON.parse(localStorage.getItem('nura-local-demo-v1') || 'null');
    const fact = profile?.facts?.find((item) => !item.validUntil && item.reviewState === 'user_confirmed' && item.category?.toLowerCase() !== 'insurance coverage');
    if (!fact) return null;
    const choice = [...document.querySelectorAll('[role="button"][aria-label]')].find((item) => (item.getAttribute('aria-label') || '').startsWith(fact.label + ','));
    return choice ? { label: fact.label, choiceLabel: choice.getAttribute('aria-label') } : null;
  })()`);
  assert(connectionFact, 'The connection builder did not offer an active confirmed health record.');
  await clickVisible({ aria: connectionFact.choiceLabel });
  await waitText('Describe your connection');
  await clickVisible({ text: 'Related in my words' });
  await fillInput({ placeholder: 'Add a short note (optional detail)', value: 'Synthetic link written by the user.' });
  await clickVisible({ text: 'SAVE MY CONNECTION' });
  await waitText('Synthetic link written by the user.');
  const connectionBody = await bodyText();
  assert(connectionBody.includes('Cholesterol') && connectionBody.includes(connectionFact.label) && connectionBody.includes('RELATED IN MY WORDS') && connectionBody.includes('A link you chose · Nura does not infer cause'), 'The saved connection lost its endpoints, chosen relation or non-causation caveat.');
  record('A source-linked health record can be connected to a chosen area with a user-authored relation that does not imply cause');
  await cdp('Page.reload');
  await waitPath((value) => value.startsWith('/health'));
  await waitText('Timeline');
  await clickVisible({ aria: 'View health connections' });
  await waitText('Synthetic link written by the user.');
  record('User-authored connection and explicit relation persist after reload');
  await clickVisible({ aria: 'View 720 profile' });
  await waitText('Your 720 profile');
  const biometricsDomain = await evaluate(`([...document.querySelectorAll('[role="button"][aria-label]')].map((item) => item.getAttribute('aria-label') || '').find((label) => label.startsWith('Biometrics,')) || '')`);
  assert(biometricsDomain, 'The 720 profile does not show the Biometrics domain.');
  await clickVisible({ aria: biometricsDomain });
  assert((await bodyText()).includes('SAVED RECORDS') || (await bodyText()).includes('Add when you are ready'), 'Opening a 720 profile domain did not reveal its saved or empty state.');
  record('The 720 profile opens a mobile domain detail with saved records or an explicit empty state');

  const activeSession = await evaluate(`JSON.parse(localStorage.getItem('nura.synthetic-preview-session.v1') || 'null')`);
  assert(typeof activeSession?.accessToken === 'string', 'The saved preview session disappeared before sign-out.');
  await navigate(`${appOrigin}/profile`);
  await waitText('Sign out');
  await clickVisible({ text: 'Sign out' });
  await waitPath('/sign-in');
  const signedOutStorage = await evaluate("localStorage.getItem('nura.synthetic-preview-session.v1')");
  const revokedSessionStatus = await evaluate(`fetch(${JSON.stringify(`${serviceOrigin}/v1/demo/session`)}, { headers: { authorization: ${JSON.stringify(`Bearer ${activeSession.accessToken}`)} } }).then((response) => response.status)`);
  assert(signedOutStorage === null && revokedSessionStatus === 401, 'Sign-out did not remove the local credential and revoke it on the server.');
  record('Sign-out clears the local credential and immediately revokes the server session');

  const staleRevokedSession = { ...activeSession, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  await evaluate(`localStorage.setItem('nura.synthetic-preview-session.v1', ${JSON.stringify(JSON.stringify(staleRevokedSession))})`);
  await navigate(appOrigin);
  await waitPath('/sign-in');
  await waitFor(async () => evaluate(`localStorage.getItem('nura.synthetic-preview-session.v1') === null`), 'The app did not remove a revoked session during startup.');
  record('A revoked but locally unexpired session is rejected during app startup and returns to sign-in');

  const viewportResults = [];
  for (const width of [360, 390, 430]) {
    await setViewport(width);
    const measure = await evaluate(`(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }))()`);
    const ok = measure.width === width && measure.content <= width;
    viewportResults.push({ ...measure, ok });
    record(`No horizontal overflow at ${width}px`, ok, `viewport ${measure.width}px; widest document surface ${measure.content}px`);
  }

  const allowedOrigins = new Set([appOrigin, serviceOrigin]);
  const unexpectedExternal = requestURLs.filter((url) => {
    try {
      const parsed = new URL(url);
      if (allowedOrigins.has(parsed.origin)) return false;
      return !(parsed.origin === 'https://i.ytimg.com' && !parsed.search && /^\/vi\/[A-Za-z0-9_-]{11}\/(?:maxresdefault|hqdefault|mqdefault|default)\.jpg$/.test(parsed.pathname));
    } catch { return true; }
  });
  const external = [...new Set(unexpectedExternal.map((url) => { try { return new URL(url).origin; } catch { return url.slice(0, 180); } }))];
  const thumbnailCount = requestURLs.filter((url) => { try { const parsed = new URL(url); return parsed.origin === 'https://i.ytimg.com' && /^\/vi\/[A-Za-z0-9_-]{11}\/(?:maxresdefault|hqdefault|mqdefault|default)\.jpg$/.test(parsed.pathname); } catch { return false; } }).length;
  record('No unexpected external HTTP(S) requests', external.length === 0, external.length ? external.join(', ') : `${requestURLs.length - thumbnailCount} app/service requests and ${thumbnailCount} public YouTube thumbnails with video IDs only`);

  const stored = JSON.parse(await readFile(join(repositoryDir, 'repository.json'), 'utf8'));
  const localSources = stored.sources.filter((source) => source.processingMode === 'local_sample_fixture');
  const runEvents = stored.runEvents || [];
  const providerEvents = runEvents.filter((event) => /connected_ai_provider|openai/i.test(`${event.type} ${event.display?.label} ${event.stage}`));
  const expectedExtractionEvents = runEvents.some((event) => event.type === 'extraction_completed')
    && runEvents.some((event) => event.type === 'claims_ready_for_review');
  record('Backend activity log contains completed extraction and claims-ready events', expectedExtractionEvents, `${runEvents.length} metadata-only activity events persisted`);
  const medicalSources = localSources.filter((source) => source.healthAreaId === 'cholesterol');
  const policySources = localSources.filter((source) => ['Nura-Example-Policy-2025.pdf', 'Nura-Independent-Policy-2024.pdf'].includes(source.displayName));
  const areasOk = medicalSources.length === 2;
  record('Both reviewed report sources retain the user-selected Cholesterol area', areasOk, medicalSources.map((source) => source.healthAreaId || 'no area').join(', '));
  const expectedPolicySources = askEnabled ? 2 : 1;
  const policyOk = policySources.length === expectedPolicySources;
  record(askEnabled ? 'Backend repository retains both separate synthetic policy sources' : 'Backend repository retains the initial synthetic policy source', policyOk, `${policySources.length} local policy fixture sources`);
  const syntheticModelCalls = askEnabled ? (await readFile(syntheticModelLogPath, 'utf8').catch(() => '')).trim().split(/\n/).filter(Boolean) : [];
  const blockedModelCalls = askEnabled ? (await readFile(blockedModelNetworkLogPath, 'utf8').catch(() => '')).trim() : '';
  const modelModeOk = askEnabled ? syntheticModelCalls.length === 10 && blockedModelCalls.length === 0 : providerEvents.length === 0;
  const expectedFixtureSources = 2 + expectedPolicySources;
  const modesOk = medicalSources.length === 2 && policySources.length === expectedPolicySources && localSources.length === expectedFixtureSources && modelModeOk && expectedExtractionEvents && areasOk;
  record(askEnabled ? 'Backend repository retains all local fixtures while Ask uses only intercepted synthetic responses' : 'Backend repository confirms three exact local fixtures and zero provider events', modesOk, `${localSources.length} local fixture sources; ${askEnabled ? `${syntheticModelCalls.length} synthetic model responses; no outbound network` : `${providerEvents.length} provider-like event labels`}`);
  assert(modesOk, 'The backend repository evidence does not match the isolated fixture and model policy for this run.');

  const assertions = stored.assertions || [];
  const pendingClaims = (stored.claims || []).filter((claim) => claim.evidenceState === 'needs_review');
  const rejectedClaims = (stored.claims || []).filter((claim) => claim.evidenceState === 'rejected');
  const editedClaims = (stored.claims || []).filter((claim) => claim.originalExtraction && claim.value === '185');
  assert(assertions.some((claim) => claim.value === '104') && assertions.some((claim) => claim.value === '185'), 'Persisted repository does not include both the accepted and edited claims.');
  assert(pendingClaims.length === 0 && rejectedClaims.length > 0 && editedClaims.length > 0, 'Repository does not preserve the dismissed and edited choices or still contains unresolved claims after mandatory review.');
  record('Server repository preserves accepted, edited, dismissed, and fully decided claims');

  await runZeroTopicSkipScenario();
}

async function cleanup() {
  if (browser?.readyState === WebSocket.OPEN) {
    try { browser.close(); } catch { /* best effort */ }
  }
  for (const child of childProcesses.slice().reverse()) {
    if (!child.proc.killed && !child.exit) {
      child.proc.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => child.proc.once('exit', resolve)), delay(3000)]);
      if (!child.exit) child.proc.kill('SIGKILL');
    }
  }
  if (!keepArtifacts) await rm(temporaryRoot, { recursive: true, force: true });
}

try {
  log(askEnabled ? 'Starting isolated Health → Insurance → Ask browser rehearsal.' : 'Starting isolated M1 full-journey browser acceptance rehearsal.');
  log(askEnabled ? 'Synthetic profile and files only; model responses are intercepted in-process and outbound network is blocked.' : 'Synthetic demo identity only; no .env file or provider key is read.');
  await runJourney();
} catch (error) {
  failures.push({ name: 'Journey stopped safely', detail: error instanceof Error ? error.message : String(error) });
  log(`FAIL Journey stopped safely — ${error instanceof Error ? error.message : String(error)}`);
  try {
    const path = await evaluate('location.pathname + location.search');
    const page = await bodyText();
    log(`Current page: ${path}\nVisible page text: ${page.slice(-6500)}`);
    const requestSummary = requestURLs.slice(-30).map((value) => {
      try { const parsed = new URL(value); return `${parsed.origin}${parsed.pathname}`; } catch { return value.slice(0, 180); }
    });
    log(`Recent browser requests: ${JSON.stringify(requestSummary)}`);
    log(`Recent source request status: ${JSON.stringify([...requestState.values()].filter((item) => item.url.includes('/v1/intake/sources/')).slice(-10).map((item) => ({ pathname: new URL(item.url).pathname, state: item.state })))}`);
    log(`Browser network failures: ${JSON.stringify(browserNetworkFailures.slice(-12))}`);
    log(`Browser exceptions: ${JSON.stringify(browserExceptions.slice(-12))}`);
    try {
      const idb = await evaluate(`(async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('nura-browser-demo-files', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
          request.onblocked = () => reject(new Error('IndexedDB open blocked'));
        });
        const blobs = await new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains('assets')) { resolve([]); return; }
          const transaction = db.transaction('assets', 'readonly');
          const request = transaction.objectStore('assets').getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
        });
        const digest = async (blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return await Promise.all(blobs.map(async (blob) => ({ size: blob.size, sha256: await digest(blob) })));
      })()`);
      const lastSourceRequest = [...requestURLs].filter((url) => url.includes('/v1/intake/sources/')).at(-1);
      let sourceEvidence = null;
      if (lastSourceRequest) {
        const pathname = new URL(lastSourceRequest).pathname;
        const response = await fetch(`${serviceOrigin}${pathname}`);
        if (response.ok) {
          const body = await response.json();
          sourceEvidence = { size: body.source?.sizeBytes, blobMatch: idb.some((blob) => blob.size === body.source?.sizeBytes && blob.sha256 === body.source?.sha256), claims: body.claims?.length ?? 0 };
        } else sourceEvidence = { status: response.status };
      }
      log(`Local original/source match diagnostic: ${JSON.stringify({ storedBlobs: idb.length, source: sourceEvidence })}`);
    } catch (diagnosticError) {
      log(`Local original/source match diagnostic failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
    }
  } catch { /* the browser may not have started */ }
  if (process.env.NURA_M1_VERBOSE === '1') {
    for (const child of childProcesses) {
      log(`\n[${child.label} stderr]\n${tail(child.stderr, 6000)}`);
    }
  }
  if (!keepArtifacts) {
    keepArtifacts = true;
    log(`Keeping isolated artifacts for diagnosis at ${temporaryRoot}`);
  }
} finally {
  await cleanup();
}

const summary = {
  result: failures.length ? 'FAIL' : 'PASS',
  passed: passed.length,
  failed: failures.length,
  checks: [...passed, ...failures],
  externalOrigins: [...requestOrigins],
  artifacts: keepArtifacts ? temporaryRoot : null,
};
log(`\n${askEnabled ? 'Health → Insurance → Ask' : 'M1'} browser rehearsal ${summary.result}: ${summary.passed} passed, ${summary.failed} failed.`);
if (keepArtifacts) log(`Temporary run artifacts: ${temporaryRoot}`);
if (failures.length) process.exitCode = 1;
