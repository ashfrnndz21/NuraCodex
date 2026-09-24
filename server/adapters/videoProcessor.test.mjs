import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sampleVideoFrames, videoFrameTimes, VIDEO_LIMITS } from './videoProcessor.mjs';

const canUseFfmpeg = spawnSync(process.env.NURA_FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
  && spawnSync(process.env.NURA_FFPROBE_PATH || 'ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;

test('video frame times are ordered, interior to the clip, and bounded', () => {
  const short = videoFrameTimes(2);
  assert.equal(short.length, 2);
  assert.ok(short[0] > 0 && short.at(-1) < 2);
  assert.ok(short[0] < short[1]);
  const long = videoFrameTimes(VIDEO_LIMITS.maxDurationSeconds);
  assert.equal(long.length, VIDEO_LIMITS.maxFrames);
  assert.ok(long.every((time, index) => time > 0 && time < VIDEO_LIMITS.maxDurationSeconds && (!index || time > long[index - 1])));
  assert.deepEqual(videoFrameTimes(0), []);
});

test('video sampler rejects media types outside its explicit allowlist', async () => {
  await assert.rejects(sampleVideoFrames({ bytes: Buffer.from('not a video'), mediaType: 'video/avi' }), /MP4, MOV or WEBM/);
});

test('video sampler creates a small timestamped frame set locally', { skip: !canUseFfmpeg && 'ffmpeg and ffprobe are not installed' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-video-fixture-'));
  const fixturePath = join(directory, 'sample.mp4');
  try {
    const created = spawnSync(process.env.NURA_FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=96x64:r=4',
      '-t', '2', '-c:v', 'mpeg4', '-an', '-movflags', '+faststart', fixturePath,
    ], { stdio: 'ignore', timeout: 15_000 });
    assert.equal(created.status, 0, 'synthetic video fixture generation should succeed');
    const result = await sampleVideoFrames({ bytes: await readFile(fixturePath), mediaType: 'video/mp4' });
    assert.equal(result.frames.length, 2);
    assert.equal(result.durationSeconds, 2);
    assert.ok(result.frames.every((frame) => frame.mimeType === 'image/jpeg' && frame.bytes.length > 0 && frame.bytes.length <= VIDEO_LIMITS.maxFrameBytes));
    assert.ok(result.frames[0].timestampSeconds < result.frames[1].timestampSeconds);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
