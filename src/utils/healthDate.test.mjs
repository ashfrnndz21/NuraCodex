import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReviewEventDate, parseHealthDate, resolveFactEventDate } from './healthDate.mjs';

test('date-only health dates preserve their calendar day west of UTC', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const parsed = parseHealthDate('2025-01-01');
    assert.ok(parsed);
    assert.equal(parsed.getFullYear(), 2025);
    assert.equal(parsed.getMonth(), 0);
    assert.equal(parsed.getDate(), 1);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('rejects invalid ISO calendar days instead of allowing Date to normalize them', () => {
  assert.equal(parseHealthDate('2025-02-30'), null);
  assert.equal(parseHealthDate('2025-13-01'), null);
});

test('keeps timestamp instants and legacy locale dates supported', () => {
  assert.ok(parseHealthDate('2025-01-01T00:00:00.000Z'));
  const legacy = parseHealthDate('24/9/2026');
  assert.ok(legacy);
  assert.equal(legacy.getFullYear(), 2026);
  assert.equal(legacy.getMonth(), 8);
  assert.equal(legacy.getDate(), 24);
});


test('reviewed event dates accept real ISO days and preserve unknown dates', () => {
  assert.deepEqual(normalizeReviewEventDate('2024-02-29'), { ok: true, value: '2024-02-29' });
  assert.deepEqual(normalizeReviewEventDate(''), { ok: true, value: null });
  assert.deepEqual(normalizeReviewEventDate('2025-02-29'), { ok: false, value: null });
  assert.deepEqual(normalizeReviewEventDate('21/01/2025'), { ok: false, value: null });
});

test('an explicitly unknown event date stays separate from its recorded time', () => {
  assert.equal(resolveFactEventDate(null, '2026-09-26T10:00:00.000Z'), '');
  assert.equal(resolveFactEventDate('2025-01-21', '2026-09-26T10:00:00.000Z'), '2025-01-21');
  assert.equal(resolveFactEventDate(undefined, '2026-09-26T10:00:00.000Z'), '2026-09-26T10:00:00.000Z');
});
