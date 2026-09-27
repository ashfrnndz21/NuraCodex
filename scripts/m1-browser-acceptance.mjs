#!/usr/bin/env node
/**
 * Isolated, provider-free M1 browser acceptance rehearsal.
 * Uses Node's built-in WebSocket and a disposable headless Chrome profile.
 * No app preview data, .env file, or external service is read or modified.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';

const root = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'nura-m1-browser-'));
const repositoryDir = join(temporaryRoot, 'synthetic-repository');
const chromeProfile = join(temporaryRoot, 'chrome-profile');
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
  proc.once('exit', (code, signal) => { existing.exit = { code, signal }; });
  return existing;
}

function tail(value, n = 2500) { return String(value || '').slice(-n); }

async function waitFor(check, message, timeoutMs = 75_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    for (const child of childProcesses) {
      if (child.exit && child.label !== 'chrome') {
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

async function serviceReady(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) return false;
  const body = await response.json();
  return body.ok === true && body.provider?.configured === false;
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
  browser.addEventListener('message', (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.method === 'Network.requestWillBeSent') {
      const url = data.params?.request?.url;
      if (url) {
        requestById.set(data.params.requestId, url);
        requestState.set(data.params.requestId, { url, state: 'started' });
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            requestOrigins.add(parsed.origin);
            requestURLs.push(parsed.href);
          }
        } catch { /* data: and extension URLs are not network origins */ }
      }
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
    if (!data.id || !pending.has(data.id)) return;
    const resolve = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) resolve(Promise.reject(new Error(data.error.message)));
    else resolve(Promise.resolve(data.result));
  });
}

function cdp(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chrome protocol command timed out: ${method}`));
    }, 15_000);
    pending.set(id, (result) => {
      clearTimeout(timer);
      result.then(resolve, reject);
    });
    browser.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
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
    const candidates = [...document.querySelectorAll('button,[role="button"],[tabindex="0"]')]
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
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: node.x, y: node.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: node.x, y: node.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: node.x, y: node.y, button: 'left', clickCount: 1 });
  await delay(180);
  return String(node.label || descriptor).replace(/\s+/g, ' ').trim();
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
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  await waitText('ADD RECORDS OR A NOTE');
  const selectionCount = await evaluate("document.body.innerText.match(/(\\d+) SELECTED/i)?.[1] || ''");
  assert(Number(selectionCount) === 0, `Expected the second run to start with zero selected health areas; saw ${selectionCount || 'none'}.`);
  record('Profile setup permits zero selected health areas', true, '00 SELECTED');

  await clickVisible({ text: 'ADD RECORDS OR A NOTE' });
  const route = await waitPath('/intake?firstRun=true');
  record('Zero-topic profile proceeds to first-run record intake', true, route);
  await waitText('Skip for now · open health history');
  record('Empty first-run intake provides the skip-to-health-history action');
  await clickVisible({ text: 'Skip for now · open health history' });
  await waitPath((value) => /health/.test(value));
  await waitText('Casey Zero');
  record('Zero-topic first-run skip opens the health history for the new profile');
}

async function runJourney() {
  const backendPort = await availablePort();
  const webPort = await availablePort();
  const debugPort = await availablePort();
  // Expo's documented --localhost listener binds to ::1 on this host.
  appOrigin = `http://localhost:${webPort}`;
  serviceOrigin = `http://127.0.0.1:${backendPort}`;
  await mkdir(repositoryDir, { recursive: true, mode: 0o700 });
  const serviceEnv = safeChildEnv({
    NURA_BIND_HOST: '127.0.0.1', NURA_AGENT_PORT: String(backendPort),
    NURA_ALLOWED_ORIGINS: appOrigin, NURA_DEMO_DATA_DIR: repositoryDir,
    OPENAI_API_KEY: '',
  });
  launch('isolated service', process.execPath, ['server/index.mjs'], serviceEnv);
  await waitFor(() => serviceReady(`${serviceOrigin}/healthz`), 'Isolated service did not start with provider access disabled.');
  const health = await (await fetch(`${serviceOrigin}/healthz`)).json();
  assert(health.provider?.configured === false, 'The isolated service unexpectedly reports a configured provider.');
  assert(health.capabilities?.localSampleDocuments === true, 'The exact built-in sample processor is not enabled.');
  record('Isolated backend is loopback-only and provider-free', true, `temporary service port ${backendPort}; OPENAI_API_KEY empty`);

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
  log('Starting disposable Chrome with the reduced-motion preference…');
  const debugBase = `http://127.0.0.1:${debugPort}`;
  await waitFor(() => browserJson(`${debugBase}/json/version`), 'Disposable Chrome could not start.', 30_000);
  const created = await browserJson(`${debugBase}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  await connectCdp(created.webSocketDebuggerUrl);
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const mediaState = await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches");
  assert(mediaState === true, 'Chrome did not emulate the reduced-motion preference.');
  record('Reduced-motion preference is enabled for this acceptance run');

  await navigate(appOrigin);
  await waitPath('/sign-in');
  await waitText('PRIVATE BY DESIGN');
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
  await clickVisible({ text: 'CONTINUE TO HEALTH AREAS' });
  await waitText('ADD RECORDS OR A NOTE');
  for (const area of ['Blood pressure', 'Cholesterol', 'Sleep', 'Heart health', 'Blood sugar']) {
    await clickVisible({ aria: `Add ${area} to your followed health areas` });
  }
  const selected = await evaluate("document.body.innerText.match(/(\\d+) SELECTED/i)?.[1] || ''");
  assert(Number(selected) === 5, `Expected five selected focus areas; saw ${selected || 'none'}.`);
  record('Profile journey accepts more than four focus areas', true, 'five selected');
  await clickVisible({ text: 'ADD RECORDS OR A NOTE' });
  await waitPath('/intake?firstRun=true');
  await waitText('Load a sample report set');
  await fillInput({ aria: 'Your health description', value: 'I was told my blood sugar was high last winter, but I do not remember the result.' });
  await clickVisible({ text: 'Blood sugar', exact: true });
  await clickVisible({ text: 'Load a sample report set' });
  await waitText('Both reports added');
  await clickVisible({ text: 'Review your health details' });
  await waitPath((value) => value.startsWith('/review'));
  await waitText('Review all 2 files with Nura');
  await clickVisible({ text: 'Review all 2 files with Nura' });
  await waitText('Review these health files?');
  const consent = await bodyText();
  assert(consent.includes('PL0005-sample-lipid-profile.pdf') && consent.includes('EXAMPLE-lipid-follow-up.pdf'), 'Consent does not list the two expected bundled reports.');
  assert(consent.includes('No AI provider is called for these samples.'), 'Consent does not clearly identify local-only processing.');
  record('Explicit consent names both exact local sample files and says no provider is called');
  await clickVisible({ text: 'Approve local sample review' });
  await waitText('Sample details ready to review', 90_000);
  await waitText('EXAMPLE-lipid-follow-up.pdf', 15_000);
  await waitText('LDL cholesterol', 15_000);
  const activity = await bodyText();
  assert(activity.includes('Sample report verified locally') || activity.includes('Checking the built-in sample locally'), 'Expected event-driven local processing activity is not visible.');
  assert(activity.includes('Built-in sample mapping') || activity.includes('exact PDF checked locally'), 'Expected source-processing explanation is not visible.');
  record('Live local extraction activity and exact-fixture explanation appear in the review screen');

  await clickVisible({ text: 'Include in save', exact: false }).catch(async () => {
    // The note action is a focusable div on native web, so try the exact accessible text fallback.
    await clickVisible({ aria: 'Include in save' });
  });
  await waitText('Undo', 8_000).catch(() => {});

  // Switch away from the last-processed file, review it, then return to the
  // follow-up file. This keeps the exercise a real source switch and avoids
  // relying on tapping an already-selected row to reopen the same review.
  await clickVisible({ aria: 'Open PL0005-sample-lipid-profile.pdf' });
  await waitText('Total Cholesterol');

  // Stage an edit and dismissal; deliberately leave other claims pending.
  // Re-selecting the currently open file is a no-op, not a blank loading state.
  await clickVisible({ aria: 'Open PL0005-sample-lipid-profile.pdf' });
  const sameSelection = await bodyText();
  assert(sameSelection.includes('Total Cholesterol') && !sameSelection.includes('Opening your saved review'), 'Re-selecting the open report cleared its source review.');
  const initialClaimLabel = await evaluate("[...document.querySelectorAll('[role=button]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.includes('Triglyceride') && label.includes('Needs review')) || ''");
  assert(initialClaimLabel, 'Could not identify a pending triglyceride claim by its accessible label.');
  await clickVisible({ aria: initialClaimLabel });
  await clickVisible({ aria: 'Edit Triglyceride' });
  await fillInput({ aria: 'Value for Triglyceride', value: '185' });
  await clickVisible({ aria: 'Stage edited details for Triglyceride' });
  const dismissLabel = await evaluate("[...document.querySelectorAll('[role=button]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.includes('HDL Cholesterol') && label.includes('Needs review')) || ''");
  assert(dismissLabel, 'Could not identify an unreviewed HDL claim.');
  await clickVisible({ aria: dismissLabel });
  const hdlClaimLabel = dismissLabel.split(',')[0];
  await clickVisible({ aria: `Dismiss ${hdlClaimLabel}` });
  await clickVisible({ aria: 'Open EXAMPLE-lipid-follow-up.pdf' });
  await waitText('LDL cholesterol');
  const secondSource = await bodyText();
  assert(secondSource.includes('22 Apr 2025') || secondSource.includes('2025-04-22'), 'The follow-up sample does not show its source event date.');
  const firstClaim = await evaluate("[...document.querySelectorAll('[role=button]')].map((el) => el.getAttribute('aria-label') || '').find((label) => label.includes('LDL cholesterol') && label.includes('Needs review')) || ''");
  assert(firstClaim, 'Could not identify a pending LDL claim by its accessible label.');
  await clickVisible({ aria: firstClaim });
  await clickVisible({ aria: `Include: ${firstClaim.split(',')[0]}` });
  record('Review queue stages accept, edited value, and dismissal while retaining other claims as pending');

  // Verify the queue describes its pending behavior, then perform exactly one save.
  await waitText('Save reviewed items');
  const queueBeforeSave = await bodyText();
  assert(queueBeforeSave.includes('Leave any of the') && queueBeforeSave.includes('pending'), 'Review queue does not explain that untouched suggestions remain pending.');
  await clickVisible({ text: 'Save reviewed items' });
  await waitFor(async () => {
    const body = await bodyText();
    return body.includes('In your record') || body.includes('saved to your health record') || false;
  }, 'The save did not produce a visible accepted state.', 30_000);
  const postSaveBody = await bodyText();
  const saveAcknowledged = /saved to your health record/i.test(postSaveBody);
  record('Review screen shows a save completion message', saveAcknowledged, saveAcknowledged ? 'save message is visible' : 'claim state updated, but an earlier source-open notice is still visible');
  await clickVisible({ text: 'View your health history' });
  await waitPath((value) => /health/.test(value));
  await waitText('Riley Sample');
  await waitText('2025');
  const history = await bodyText();
  assert(history.includes('Triglyceride') && history.includes('185'), 'Edited value is missing from the saved health history.');
  assert(history.includes('LDL cholesterol') && history.includes('104'), 'Accepted follow-up source claim is missing from the saved health history.');
  assert(history.includes('PL0005-sample-lipid-profile.pdf') || history.includes('EXAMPLE-lipid-follow-up.pdf'), 'Saved health history is missing source-linked report names.');
  assert(!history.includes('HDL Cholesterol') || history.includes('Needs review'), 'Dismissed claim appears as an accepted health-history fact.');
  record('Saved health history shows date-organized, source-linked synthetic results');

  // Reload at the health history route to prove browser persistence and re-entry.
  const beforeReload = await evaluate('location.href');
  await navigate(beforeReload);
  await waitFor(async () => (await bodyText()).includes('Triglyceride') && (await bodyText()).includes('185'), 'Saved health history did not persist after reload.', 30_000);
  await waitText('LDL cholesterol');
  record('Accepted and edited history persists after reload in a fresh browser profile');

  const viewportResults = [];
  for (const width of [360, 390, 430]) {
    await setViewport(width);
    const measure = await evaluate(`(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }))()`);
    const ok = measure.width === width && measure.content <= width;
    viewportResults.push({ ...measure, ok });
    record(`No horizontal overflow at ${width}px`, ok, `viewport ${measure.width}px; widest document surface ${measure.content}px`);
  }

  const allowedOrigins = new Set([appOrigin, serviceOrigin]);
  const external = [...requestOrigins].filter((origin) => !allowedOrigins.has(origin));
  record('No unexpected external HTTP(S) requests', external.length === 0, external.length ? external.join(', ') : `${requestURLs.length} observed requests used only the isolated app and service origins`);

  const stored = JSON.parse(await readFile(join(repositoryDir, 'repository.json'), 'utf8'));
  const localSources = stored.sources.filter((source) => source.processingMode === 'local_sample_fixture');
  const runEvents = stored.runEvents || [];
  const providerEvents = runEvents.filter((event) => /connected_ai_provider|openai/i.test(`${event.type} ${event.display?.label} ${event.stage}`));
  const expectedExtractionEvents = runEvents.some((event) => event.type === 'extraction_completed')
    && runEvents.some((event) => event.type === 'claims_ready_for_review');
  record('Backend activity log contains completed extraction and claims-ready events', expectedExtractionEvents, `${runEvents.length} metadata-only activity events persisted`);
  const modesOk = localSources.length === 2 && providerEvents.length === 0 && expectedExtractionEvents;
  record('Backend repository confirms two exact local fixtures and zero provider events', modesOk, `${localSources.length} local fixture sources; ${providerEvents.length} provider-like event labels`);
  assert(modesOk, 'The backend repository evidence does not match the provider-free two-fixture journey.');

  const assertions = stored.assertions || [];
  const pendingClaims = (stored.claims || []).filter((claim) => claim.evidenceState === 'needs_review');
  const rejectedClaims = (stored.claims || []).filter((claim) => claim.evidenceState === 'rejected');
  const editedClaims = (stored.claims || []).filter((claim) => claim.originalExtraction && claim.value === '185');
  assert(assertions.some((claim) => claim.value === '104') && assertions.some((claim) => claim.value === '185'), 'Persisted repository does not include both the accepted and edited claims.');
  assert(pendingClaims.length > 0 && rejectedClaims.length > 0 && editedClaims.length > 0, 'Repository does not preserve pending, dismissed, and edited review states.');
  record('Server repository preserves accepted, edited, dismissed, and untouched pending claims');

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
  log('Starting isolated M1 full-journey browser acceptance rehearsal.');
  log('Synthetic demo identity only; no .env file or provider key is read.');
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
log(`\nM1 browser rehearsal ${summary.result}: ${summary.passed} passed, ${summary.failed} failed.`);
if (keepArtifacts) log(`Temporary run artifacts: ${temporaryRoot}`);
if (failures.length) process.exitCode = 1;
