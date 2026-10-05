import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRecentHomeVideos } from './homeVideoSelection.mjs';

const video = (id, retrievedAt, overrides = {}) => ({
  id: `feed-${id}-${retrievedAt}`,
  url: `https://www.youtube.com/watch?v=${id}`,
  retrievedAt,
  dismissed: false,
  ...overrides,
});

test('Home shows the two newest distinct visible YouTube videos', () => {
  const items = [
    video('older123456', '2026-10-01T09:00:00Z'),
    video('newest12345', '2026-10-02T10:00:00Z'),
    video('middle12345', '2026-10-02T09:00:00Z'),
  ];

  assert.deepEqual(selectRecentHomeVideos(items).map((item) => item.url), [
    'https://www.youtube.com/watch?v=newest12345',
    'https://www.youtube.com/watch?v=middle12345',
  ]);
});

test('Home collapses the same video across topic results and skips hidden results', () => {
  const items = [
    video('shared12345', '2026-10-02T10:00:00Z', { topic: 'Cholesterol' }),
    { ...video('shared12345', '2026-10-02T09:59:00Z', { topic: 'Heart health' }), url: 'https://youtu.be/shared12345' },
    video('hidden12345', '2026-10-02T09:58:00Z', { dismissed: true }),
    video('nextVideo12', '2026-10-02T09:57:00Z', { topic: 'Blood sugar' }),
  ];

  assert.deepEqual(selectRecentHomeVideos(items).map((item) => item.topic), ['Cholesterol', 'Blood sugar']);
});

test('Home ignores non-YouTube links and supports a caller-specified count', () => {
  const items = [
    { ...video('article', '2026-10-02T10:00:00Z'), url: 'https://medlineplus.gov/cholesterol.html' },
    video('oneVideo123', '2026-10-02T09:00:00Z'),
    video('twoVideo123', '2026-10-02T08:00:00Z'),
  ];

  assert.deepEqual(selectRecentHomeVideos(items, 1).map((item) => item.url), ['https://www.youtube.com/watch?v=oneVideo123']);
  assert.deepEqual(selectRecentHomeVideos(items, 0), []);
});
