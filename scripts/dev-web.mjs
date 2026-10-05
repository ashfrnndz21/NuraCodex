#!/usr/bin/env node
/** Start the local synthetic Nura API and Expo web preview together. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const agentPort = process.env.NURA_AGENT_PORT || '4175';
const agentUrl = (process.env.EXPO_PUBLIC_NURA_AGENT_URL || `http://127.0.0.1:${agentPort}`).replace(/\/$/, '');
const forwardedArgs = process.argv.slice(2);
const portProvided = forwardedArgs.some((arg) => arg === '--port' || arg.startsWith('--port='));
const children = [];
let stopping = false;

async function reserveWebPort(preferredPort) {
  const probe = (port) => new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
  const isAvailable = probe;
  if (Number.isInteger(preferredPort) && preferredPort > 0 && await isAvailable(preferredPort)) return preferredPort;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not reserve a local web preview port.');
    await new Promise((resolve) => server.close(resolve));
    if (await isAvailable(address.port)) return address.port;
  }
  throw new Error('Could not find an available local web preview port.');
}

async function getAgentHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`${agentUrl}/healthz`, { signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.ok && body?.service === 'nura-agent-dev' ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForAgent(agentProcess) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (agentProcess?.exitCode !== null && agentProcess?.exitCode !== undefined) {
      throw new Error('The local Nura service stopped before it was ready.');
    }
    const health = await getAgentHealth();
    if (health) return health;
    await delay(250);
  }
  throw new Error('The local Nura service did not become ready. Check its startup message and .env configuration.');
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}

process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));

try {
  let agentProcess = null;
  const alreadyRunning = await getAgentHealth();
  if (alreadyRunning) {
    console.log(`Nura local service is ready at ${agentUrl}.`);
  } else {
    const serverArgs = existsSync(join(root, '.env')) ? ['--env-file=.env', 'server/index.mjs'] : ['server/index.mjs'];
    agentProcess = spawn(process.execPath, serverArgs, { cwd: root, env: process.env, stdio: 'inherit' });
    children.push(agentProcess);
    agentProcess.once('exit', (code) => { if (!stopping) stop(code || 1); });
    const health = await waitForAgent(agentProcess);
    console.log(`Nura local service is ready at ${agentUrl} · provider configured ${Boolean(health.provider?.configured)}.`);
  }

  const expoEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(OPENAI_|NURA_)/.test(key)));
  expoEnv.EXPO_NO_DOTENV = '1';
  expoEnv.EXPO_PUBLIC_NURA_AGENT_URL = agentUrl;
  expoEnv.EXPO_NO_TELEMETRY = '1';
  const expoCli = join(root, 'node_modules/expo/bin/cli');
  let webPortArgs = [];
  if (!portProvided) {
    const preferredPort = Number(process.env.NURA_WEB_PORT || 8099);
    const selectedPort = await reserveWebPort(preferredPort);
    if (selectedPort !== preferredPort) console.log(`Port ${preferredPort} is already in use; using ${selectedPort} for this preview.`);
    webPortArgs = ['--port', String(selectedPort)];
  }
  const webProcess = spawn(process.execPath, [expoCli, 'start', '--web', '--localhost', ...webPortArgs, ...forwardedArgs], { cwd: root, env: expoEnv, stdio: 'inherit' });
  children.push(webProcess);
  webProcess.once('exit', (code) => { if (!stopping) stop(code || 0); });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The local Nura preview could not start.');
  stop(1);
}
