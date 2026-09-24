import assert from 'node:assert/strict';
import test from 'node:test';
import { browserAssetId, browserAssetUri } from './browserAssetStore.mjs';

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
