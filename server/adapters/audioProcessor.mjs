import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const AUDIO_LIMITS = Object.freeze({
  maxDurationSeconds: 300,
  maxProbeOutputBytes: 512 * 1024,
  processTimeoutMs: 15_000,
});

export const AUDIO_MEDIA_EXTENSIONS = Object.freeze({
  'audio/flac': ['.flac'],
  'audio/mpeg': ['.mp3', '.mpeg', '.mpga'],
  'audio/mp4': ['.m4a'],
  'audio/ogg': ['.ogg'],
  'audio/wav': ['.wav'],
  'audio/webm': ['.webm'],
});

function abortError() {
  const error = new Error('Audio review was stopped.');
  error.name = 'AbortError';
  return error;
}

function runProbe(command, args, { signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let output = Buffer.alloc(0);
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(result);
    };
    const onAbort = () => { child.kill('SIGKILL'); finish(abortError()); };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Audio inspection took too long. No health details were added.'));
    }, AUDIO_LIMITS.processTimeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk) => {
      if (output.length + chunk.length > AUDIO_LIMITS.maxProbeOutputBytes) {
        child.kill('SIGKILL');
        finish(new Error('This audio file exceeds the local processing limit.'));
        return;
      }
      output = Buffer.concat([output, chunk]);
    });
    child.once('error', () => finish(new Error('Audio processing tools are unavailable for this local demo.')));
    child.once('close', (code) => {
      if (code !== 0) finish(new Error('This audio file could not be read. Check the file and try again.'));
      else finish(null, output);
    });
  });
}

export function validateAudioProbe(probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  if (!streams.some((stream) => stream?.codec_type === 'audio')) throw new Error('The selected file does not contain an audio track.');
  const durations = [probe?.format?.duration, ...streams.map((stream) => stream?.duration)]
    .map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!durations.length) throw new Error('The audio duration could not be read.');
  const durationSeconds = Math.max(...durations);
  if (durationSeconds > AUDIO_LIMITS.maxDurationSeconds) throw new Error('For this local preview, audio recordings must be five minutes or shorter.');
  return durationSeconds;
}

/** Checks a bounded local recording before any provider transfer. Input bytes are removed after inspection. */
export async function inspectAudioDuration({ bytes, mediaType, signal }) {
  const extensions = AUDIO_MEDIA_EXTENSIONS[String(mediaType || '').toLowerCase()];
  if (!extensions?.length) throw new Error('Choose an MP3, M4A, WAV, OGG, FLAC or audio WEBM recording.');
  const workDir = await mkdtemp(join(tmpdir(), 'nura-audio-'));
  const inputPath = join(workDir, `selected${extensions[0]}`);
  try {
    await writeFile(inputPath, bytes, { flag: 'wx', mode: 0o600 });
    const result = await runProbe(process.env.NURA_FFPROBE_PATH || 'ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,duration',
      '-of', 'json', inputPath,
    ], { signal });
    let probe;
    try { probe = JSON.parse(result.toString('utf8')); } catch { throw new Error('This audio file could not be inspected.'); }
    return validateAudioProbe(probe);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
