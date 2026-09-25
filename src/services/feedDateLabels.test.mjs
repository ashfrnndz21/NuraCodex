import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFeedRetrievalDate } from './feedDateLabels.mjs';

test('labels the search retrieval date with its year, separately from publisher dates', () => {
  const value = '2026-09-25T10:30:00.000Z';
  const expectedDate = new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  assert.equal(formatFeedRetrievalDate(value, 'en-GB'), `Found by Nura · ${expectedDate}`);
  assert.match(formatFeedRetrievalDate(value, 'en-GB'), /2026/);
});

test('keeps date-only values on the supplied calendar day and handles missing or invalid dates honestly', () => {
  const expectedDate = new Date(2026, 8, 25).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  assert.equal(formatFeedRetrievalDate('2026-09-25', 'en-GB'), `Found by Nura · ${expectedDate}`);
  assert.equal(formatFeedRetrievalDate('', 'en-GB'), 'Search date unavailable');
  assert.equal(formatFeedRetrievalDate('not-a-date', 'en-GB'), 'Search date unavailable');
  assert.equal(formatFeedRetrievalDate('2026-02-30', 'en-GB'), 'Search date unavailable');
});
