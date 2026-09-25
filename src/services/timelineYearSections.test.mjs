import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTimelineByYear } from './timelineYearSections.mjs';

test('groups the active timeline entries by event year and counts only those entries', () => {
  const entries = [
    { id: 'newer', eventDateKey: '2026-09-12' },
    { id: 'older-a', eventDateKey: '2025-01-21' },
    { id: 'newer-two', eventDateKey: '2026-08-18' },
    { id: 'older-b', eventDateKey: '2025-02-01' },
  ];

  const sections = groupTimelineByYear(entries);

  assert.deepEqual(sections.map(({ year, entries: items }) => [year, items.map(({ id }) => id), items.length]), [
    ['2026', ['newer', 'newer-two'], 2],
    ['2025', ['older-a', 'older-b'], 2],
  ]);
});

test('keeps missing and invalid event dates in a clearly undated section', () => {
  const valid = { id: 'valid', eventDateKey: '2026-09-12' };
  const missing = { id: 'missing', eventDateKey: null };
  const invalid = { id: 'invalid', eventDateKey: '2025-02-30' };

  const sections = groupTimelineByYear([missing, valid, invalid]);

  assert.deepEqual(sections.map(({ year, entries: items }) => [year, items.map(({ id }) => id)]), [
    ['2026', ['valid']],
    [null, ['missing', 'invalid']],
  ]);
});
