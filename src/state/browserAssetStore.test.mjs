import assert from 'node:assert/strict';
import test from 'node:test';
import { browserAssetId, browserAssetUri, isSyntheticPlaceholderUri } from './browserAssetStore.mjs';

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
