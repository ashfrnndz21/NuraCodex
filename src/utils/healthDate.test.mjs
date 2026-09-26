import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHealthDate } from './healthDate.mjs';

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
