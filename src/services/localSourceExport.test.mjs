import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLocalSourceFiles } from './localSourceExport.mjs';

test('local source export reads browser originals by their saved URI and omits missing copies', async () => {
  const calls = [];
  const result = await collectLocalSourceFiles([
    { id: 'report-1', uri: 'nura-local-asset://report-1' },
    { id: 'report-2', uri: 'nura-local-asset://report-2' },
  ], {
    platform: 'web',
    readBrowserFile: async (uri) => {
      calls.push(uri);
      if (uri.endsWith('report-2')) throw new Error('missing');
      return new Uint8Array([37, 80, 68, 70]);
    },
    readDeviceFile: async () => { throw new Error('wrong platform reader'); },
  });

  assert.deepEqual(calls, ['nura-local-asset://report-1', 'nura-local-asset://report-2']);
  assert.deepEqual(result, [{ assetId: 'report-1', bytes: new Uint8Array([37, 80, 68, 70]) }]);
});

test('local source export reads device files and skips malformed or duplicate asset references', async () => {
  const calls = [];
  const result = await collectLocalSourceFiles([
    { id: 'report-1', uri: 'file:///documents/report.pdf' },
    { id: 'report-1', uri: 'file:///documents/duplicate.pdf' },
    { id: '', uri: 'file:///documents/no-id.pdf' },
    { id: 'missing-uri', uri: '' },
  ], {
    platform: 'ios',
    readDeviceFile: async (uri) => { calls.push(uri); return new Uint8Array([1, 2, 3]); },
  });

  assert.deepEqual(calls, ['file:///documents/report.pdf']);
  assert.deepEqual(result, [{ assetId: 'report-1', bytes: new Uint8Array([1, 2, 3]) }]);
});

test('local source export accepts ArrayBuffer data and returns empty when no reader is available', async () => {
  const result = await collectLocalSourceFiles([{ id: 'report-1', uri: 'file:///report.pdf' }], {
    platform: 'android',
    readDeviceFile: async () => new Uint8Array([4, 5]).buffer,
  });
  assert.deepEqual(result, [{ assetId: 'report-1', bytes: new Uint8Array([4, 5]) }]);
  assert.deepEqual(await collectLocalSourceFiles([{ id: 'report-1', uri: 'file:///report.pdf' }], { platform: 'ios' }), []);
});
