import assert from 'node:assert/strict';
import test from 'node:test';
import { privacyStorageMap } from './privacyStorageMap.mjs';

test('browser inventory distinguishes local profile, original files, preview review service, provider and cloud boundaries', () => {
  const rows = privacyStorageMap('web');
  assert.deepEqual(rows.map((row) => row.id), ['app-copy', 'original-files', 'review-service', 'outside-provider', 'cloud-sync']);
  assert.match(rows[0].detail, /this browser/);
  assert.match(rows[1].detail, /stored separately/);
  assert.match(rows[2].control, /clear review data/);
  assert.match(rows[3].detail, /only after you approve/);
  assert.match(rows[3].detail, /cannot erase a copy/);
  assert.equal(rows[4].status, 'Not connected');
  assert.match(rows[4].detail, /separate backups/);
});

test('native inventory describes the on-device copy without implying cloud sync or provider deletion', () => {
  const rows = privacyStorageMap('ios');
  assert.equal(rows[0].title, 'This device');
  assert.match(rows[0].detail, /on this device/);
  assert.match(rows[1].control, /Remove a saved source/);
  assert.match(rows[3].detail, /cannot erase a copy/);
  assert.match(rows[4].detail, /does not sync/);
});

test('inventory exposes each store once and does not report deletion as complete', () => {
  const rows = privacyStorageMap('android');
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.ok(rows.every((row) => row.title && row.status && row.detail && row.control));
  assert.doesNotMatch(JSON.stringify(rows), /fully deleted|erased everywhere|permanently removed from provider/i);
});
