import assert from 'node:assert/strict';
import test from 'node:test';
import { browserAssetId, browserAssetUri, deleteBrowserAssetCopies, isSyntheticPlaceholderUri, readBrowserAsset, saveBrowserAsset } from './browserAssetStore.mjs';

test('browser asset handles round-trip arbitrary local IDs without embedding file content', () => {
  const id = 'local file / page#1';
  const uri = browserAssetUri(id);
  assert.match(uri, /^nura-local-asset:\/\//);
  assert.equal(browserAssetId(uri), id);
  assert.equal(uri.includes('data:'), false);
});

test('browser asset resolver rejects ordinary and malformed handles', () => {
  assert.equal(browserAssetId('blob:http://localhost/file-id'), null);
  assert.equal(browserAssetId('nura-local-asset://bad%ZZ'), null);
});

test('synthetic demo placeholders are not treated as attached file bytes', () => {
  assert.equal(isSyntheticPlaceholderUri('demo://example-blood-test.pdf'), true);
  assert.equal(isSyntheticPlaceholderUri('nura-local-asset://file-1'), false);
  assert.equal(isSyntheticPlaceholderUri('file:///tmp/report.pdf'), false);
});

test('source removal clears only that source original from browser file storage', async () => {
  const previousIndexedDb = globalThis.indexedDB;
  const blobs = new Map();
  const finish = (transaction) => queueMicrotask(() => transaction.oncomplete?.());
  globalThis.indexedDB = {
    open: () => {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          createObjectStore: () => undefined,
          transaction: () => {
            const transaction = {
              oncomplete: null, onerror: null, onabort: null,
              objectStore: () => ({
                put: (blob, id) => { blobs.set(id, blob); finish(transaction); },
                get: (id) => { const item = {}; queueMicrotask(() => { item.result = blobs.get(id) ?? null; item.onsuccess?.(); finish(transaction); }); return item; },
                delete: (id) => { blobs.delete(id); finish(transaction); },
              }),
            };
            return transaction;
          },
        };
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  try {
    const sourceA = new Blob(['source A report bytes'], { type: 'application/pdf' });
    const sourceB = new Blob(['source B report bytes'], { type: 'application/pdf' });
    await saveBrowserAsset('source-a-file', sourceA);
    await saveBrowserAsset('source-b-file', sourceB);

    assert.equal(await deleteBrowserAssetCopies([{ uri: browserAssetUri('source-a-file') }]), 1);
    assert.equal(await readBrowserAsset('source-a-file'), null);
    assert.equal(await (await readBrowserAsset('source-b-file')).text(), 'source B report bytes');
  } finally {
    if (previousIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDb;
  }
});
