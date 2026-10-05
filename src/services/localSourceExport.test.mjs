import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLocalSourceStreams } from './localSourceExport.mjs';

test('local source export opens browser originals lazily by saved URI and omits missing copies', async () => {
  const calls = [];
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const result = await prepareLocalSourceStreams([
    { id: 'report-1', uri: 'nura-local-asset://report-1' },
    { id: 'report-2', uri: 'nura-local-asset://report-2' },
  ], {
    platform: 'web',
    readBrowserFile: async (uri) => {
      calls.push(uri);
      if (uri.endsWith('report-2')) throw new Error('missing');
      return new Blob([bytes]);
    },
    readDeviceFile: async () => { throw new Error('wrong platform reader'); },
  });

  assert.deepEqual(calls, ['nura-local-asset://report-1', 'nura-local-asset://report-2']);
  assert.equal(result.length, 1);
  assert.equal(result[0].assetId, 'report-1');
  assert.equal(result[0].sizeBytes, bytes.length);
  assert.deepEqual(await readStream(result[0].openStream()), bytes);
});

test('local source export prepares device streams and skips malformed or duplicate asset references', async () => {
  const calls = [];
  const result = await prepareLocalSourceStreams([
    { id: 'report-1', uri: 'file:///documents/report.pdf' },
    { id: 'report-1', uri: 'file:///documents/duplicate.pdf' },
    { id: '', uri: 'file:///documents/no-id.pdf' },
    { id: 'missing-uri', uri: '' },
  ], {
    platform: 'ios',
    readDeviceFile: async (uri) => {
      calls.push(uri);
      return { size: 3, stream: () => new Blob([new Uint8Array([1, 2, 3])]).stream() };
    },
  });

  assert.deepEqual(calls, ['file:///documents/report.pdf']);
  assert.equal(result.length, 1);
  assert.equal(result[0].sizeBytes, 3);
  assert.deepEqual(await readStream(result[0].openStream()), new Uint8Array([1, 2, 3]));
});

test('local source export omits unreadable metadata and returns empty when no reader is available', async () => {
  const result = await prepareLocalSourceStreams([{ id: 'report-1', uri: 'file:///report.pdf' }], {
    platform: 'android',
    readDeviceFile: async () => ({ size: null, stream: () => new Blob([new Uint8Array([4, 5])]).stream() }),
  });
  assert.deepEqual(result, []);
  assert.deepEqual(await prepareLocalSourceStreams([{ id: 'report-1', uri: 'file:///report.pdf' }], { platform: 'ios' }), []);
});

async function readStream(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
