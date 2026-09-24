import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

export const VIDEO_LIMITS = Object.freeze({
  maxDurationSeconds: 180,
  maxFrames: 6,
  maxFrameBytes: 4 * 1024 * 1024,
  maxProbeOutputBytes: 512 * 1024,
  processTimeoutMs: 15_000,
});

const EXTENSIONS = new Map([
  ['video/mp4', '.mp4'],
  ['video/quicktime', '.mov'],
  ['video/webm', '.webm'],
  ['video/x-m4v', '.m4v'],
]);

function abortError() {
  const error = new Error('Video processing was stopped.');
  error.name = 'AbortError';
  return error;
}

function runProcess(command, args, { signal, timeoutMs, maxOutputBytes }) {
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
      finish(new Error('Video processing took too long. No health details were added.'));
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk) => {
      if (output.length + chunk.length > maxOutputBytes) {
        child.kill('SIGKILL');
        finish(new Error('The selected video exceeds the local processing limit.'));
        return;
      }
      output = Buffer.concat([output, chunk]);
    });
    child.once('error', () => finish(new Error('Video analysis tools are unavailable on this device.')));
    child.once('close', (code) => {
      if (code !== 0) finish(new Error('This video could not be read. Check the file and try again.'));
      else finish(null, output);
    });
  });
}

export function videoFrameTimes(durationSeconds, maxFrames = VIDEO_LIMITS.maxFrames) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const count = Math.min(maxFrames, Math.max(2, Math.ceil(durationSeconds / 15)));
  return Array.from({ length: count }, (_, index) => Number((durationSeconds * (index + 1) / (count + 1)).toFixed(3)));
}

/**
 * Safely sample a bounded set of timestamped stills from a short local video.
 * Original video bytes are not retained here; the caller keeps only the hash/source metadata.
 */
export async function sampleVideoFrames({ bytes, mediaType, signal }) {
  const extension = EXTENSIONS.get(String(mediaType || '').toLowerCase());
  if (!extension) throw new Error('Choose an MP4, MOV or WEBM video.');
  const workDir = await mkdtemp(join(tmpdir(), 'nura-video-'));
  const inputPath = join(workDir, `selected${extension}`);
  try {
    await writeFile(inputPath, bytes, { flag: 'wx', mode: 0o600 });
    const probeOutput = await runProcess(process.env.NURA_FFPROBE_PATH || 'ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type',
      '-of', 'json', inputPath,
    ], { signal, timeoutMs: VIDEO_LIMITS.processTimeoutMs, maxOutputBytes: VIDEO_LIMITS.maxProbeOutputBytes });
    let probe;
    try { probe = JSON.parse(probeOutput.toString('utf8')); } catch { throw new Error('This video could not be inspected.'); }
    const durationSeconds = Number(probe?.format?.duration);
    if (!(probe?.streams || []).some((stream) => stream.codec_type === 'video')) throw new Error('The selected file does not contain a video track.');
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('The selected video duration could not be read.');
    if (durationSeconds > VIDEO_LIMITS.maxDurationSeconds) throw new Error('For this local build, videos must be 3 minutes or shorter.');

    const timestamps = videoFrameTimes(durationSeconds);
    const frames = [];
    for (const [index, timestampSeconds] of timestamps.entries()) {
      if (signal?.aborted) throw abortError();
      const framePath = join(workDir, `frame-${index}.jpg`);
      await runProcess(process.env.NURA_FFMPEG_PATH || 'ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe',
        '-threads', '1', '-ss', timestampSeconds.toFixed(3), '-i', inputPath,
        '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=1024:1024:force_original_aspect_ratio=decrease',
        '-an', '-sn', '-dn', '-q:v', '5', '-f', 'image2', framePath,
      ], { signal, timeoutMs: VIDEO_LIMITS.processTimeoutMs, maxOutputBytes: 1024 });
      const frameStat = await stat(framePath);
      if (!frameStat.size || frameStat.size > VIDEO_LIMITS.maxFrameBytes) throw new Error('A selected video frame exceeded the local processing limit.');
      frames.push({ timestampSeconds, mimeType: 'image/jpeg', bytes: await readFile(framePath) });
    }
    if (!frames.length) throw new Error('No reviewable video frames were found.');
    return { durationSeconds, frames };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
