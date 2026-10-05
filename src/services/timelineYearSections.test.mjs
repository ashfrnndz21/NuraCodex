import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTimelineByDate, groupTimelineByYear, timelineGroupExpandedByDefault } from './timelineYearSections.mjs';
import { documentDisplayName, documentIsInsurance } from './documentPresentation.mjs';

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

test('groups the same day together and summarizes distinct record categories', () => {
  const policyAsset = { name: 'Elmo_Health policy doc_A5 WEB.pdf', kind: 'pdf', purpose: 'medical' };
  const groups = groupTimelineByDate([
    { id: 'weight', kind: 'fact', title: 'Weight', category: 'Biometrics', eventDateKey: '2026-09-29' },
    { id: 'policy', kind: 'asset', title: documentDisplayName(policyAsset), category: documentIsInsurance(policyAsset) ? 'Insurance document' : 'Health document', eventDateKey: '2026-09-29' },
    { id: 'height', kind: 'fact', title: 'Height', category: 'Biometrics', eventDateKey: '2026-09-29' },
    { id: 'older', kind: 'fact', title: 'LDL', category: 'Lab results', eventDateKey: '2026-09-28' },
  ]);

  assert.equal(documentIsInsurance(policyAsset), true);

  assert.deepEqual(groups.map(({ key, entries: items, categories }) => [
    key,
    items.map(({ id }) => id),
    categories,
  ]), [
    ['2026-09-29', ['weight', 'policy', 'height'], [{ label: 'Measurements', count: 2 }, { label: 'Insurance', count: 1 }]],
    ['2026-09-28', ['older'], [{ label: 'Lab results', count: 1 }]],
  ]);
});

test('opens only a single newest event by default and collapses multi-event or older date groups', () => {
  assert.equal(timelineGroupExpandedByDefault(0, 0, 1), true);
  assert.equal(timelineGroupExpandedByDefault(0, 0, 3), false);
  assert.equal(timelineGroupExpandedByDefault(0, 1, 1), false);
  assert.equal(timelineGroupExpandedByDefault(1, 0, 1), false);
});

test('puts undated entries together without inventing a date', () => {
  const groups = groupTimelineByDate([
    { id: 'visit', kind: 'visit', title: 'Follow-up', category: 'Care visit', eventDateKey: null },
    { id: 'invalid', kind: 'asset', title: 'Health report', category: 'PDF', eventDateKey: '2025-02-30' },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'undated');
  assert.equal(groups[0].date, null);
  assert.deepEqual(groups[0].categories, [{ label: 'Care', count: 1 }, { label: 'Documents', count: 1 }]);
});
