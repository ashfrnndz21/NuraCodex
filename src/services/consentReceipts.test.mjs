import assert from 'node:assert/strict';
import test from 'node:test';
import { appendConsentReceipt, CONSENT_RECEIPT_LIMIT, normalizeConsentReceipt, normalizeConsentReceipts } from './consentReceipts.mjs';

const receipt = (id, approvedAt = '2026-09-29T08:00:00.000Z', extra = {}) => ({
  id, purpose: 'ask', scopes: ['user_question', 'saved_details'], approvedAt, ...extra,
});

test('receipt stores only an approved purpose, scope categories and timestamp', () => {
  const normalized = normalizeConsentReceipt({
    ...receipt('run-1'), question: 'private prompt', fileName: 'report.pdf', healthValue: 'not stored',
  });
  assert.deepEqual(normalized, receipt('run-1'));
  assert.equal('question' in normalized, false);
  assert.equal('fileName' in normalized, false);
  assert.equal('healthValue' in normalized, false);
});

test('invalid approvals, timestamps and empty scopes are rejected', () => {
  assert.equal(normalizeConsentReceipt({ ...receipt('run-1'), purpose: 'unknown' }), null);
  assert.equal(normalizeConsentReceipt({ ...receipt('run-1'), approvedAt: 'not a date' }), null);
  assert.equal(normalizeConsentReceipt({ ...receipt('run-1'), scopes: ['unknown'] }), null);
  assert.throws(() => appendConsentReceipt([], { ...receipt('run-1'), scopes: [] }), /consent receipt is required/);
});

test('scope categories are deduplicated and unsupported categories discarded', () => {
  const normalized = normalizeConsentReceipt({ ...receipt('run-1'), scopes: ['saved_details', 'saved_details', 'prompt', 'health_areas'] });
  assert.deepEqual(normalized?.scopes, ['saved_details', 'health_areas']);
});

test('consent records an age derived on-device as its own shareable detail', () => {
  const normalized = normalizeConsentReceipt({ ...receipt('run-age'), scopes: ['user_question', 'saved_details', 'derived_age'] });
  assert.deepEqual(normalized?.scopes, ['user_question', 'saved_details', 'derived_age']);
});

test('consent records a user-approved reply to Nura clarification as a separate scope', () => {
  const normalized = normalizeConsentReceipt({ ...receipt('run-follow-up'), scopes: ['user_question', 'ask_clarification_reply'] });
  assert.deepEqual(normalized?.scopes, ['user_question', 'ask_clarification_reply']);
});

test('append replaces a repeated receipt id and retains the newest 100', () => {
  const receipts = Array.from({ length: CONSENT_RECEIPT_LIMIT }, (_, index) => receipt(`run-${index}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()));
  const next = appendConsentReceipt(receipts, receipt('run-new', '2026-09-29T09:00:00.000Z'));
  assert.equal(next.length, CONSENT_RECEIPT_LIMIT);
  assert.equal(next[0].id, 'run-new');
  assert.equal(next.some((entry) => entry.id === 'run-0'), false);
  const replaced = appendConsentReceipt(next, receipt('run-new', '2026-09-29T10:00:00.000Z', { question: 'discarded' }));
  assert.equal(replaced.filter((entry) => entry.id === 'run-new').length, 1);
  assert.equal(replaced[0].approvedAt, '2026-09-29T10:00:00.000Z');
});

test('normalization tolerates missing or corrupt browser data without exposing it', () => {
  assert.deepEqual(normalizeConsentReceipts(null), []);
  assert.deepEqual(normalizeConsentReceipts([receipt('good'), { question: 'secret' }]), [receipt('good')]);
});
