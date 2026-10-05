import assert from 'node:assert/strict';
import test from 'node:test';
import { createHealthFeedSearch } from './healthFeedSearch.mjs';

test('Explore combines three distinct articles and three playable videos per topic', async () => {
  const calls = [];
  const search = createHealthFeedSearch({
    searchArticles: async (input) => { calls.push(['articles', input.query]); return { summary: 'A useful overview.', sources: Array.from({ length: 4 }, (_, index) => ({ title: `Article ${index}`, url: `https://cdc.gov/article-${index}` })) }; },
    searchVideos: async (input) => { calls.push(['videos', input.query]); return { sources: Array.from({ length: 4 }, (_, index) => ({ title: `Video ${index}`, url: `https://youtube.com/watch?v=${String(index).padStart(2, '0')}cDEF123_-` })) }; },
  });
  const result = await search({ query: 'LDL and HDL' });
  assert.deepEqual(calls.sort((a, b) => a[0].localeCompare(b[0])), [['articles', 'LDL and HDL'], ['videos', 'LDL and HDL']]);
  assert.equal(result.summary, 'A useful overview.');
  assert.equal(result.sources.length, 8);
  assert.equal(result.articleSearchAvailable, true);
});

test('Explore still returns videos when article search is unavailable', async () => {
  const search = createHealthFeedSearch({
    searchArticles: async () => { throw new Error('private provider error'); },
    searchVideos: async () => ({ sources: [{ title: 'Video', url: 'https://youtube.com/watch?v=abcDEF123_-' }] }),
  });
  const result = await search({ query: 'Blood pressure' });
  assert.equal(result.summary, '');
  assert.equal(result.articleSearchAvailable, false);
  assert.equal(result.videoSearchAvailable, true);
  assert.equal(result.sources.length, 1);
});

test('Explore keeps articles visible and reports when the YouTube lane fails', async () => {
  const unavailable = new Error('YouTube search is not configured.');
  const search = createHealthFeedSearch({
    searchArticles: async () => ({ summary: '', sources: [{ title: 'Article', url: 'https://cdc.gov/example' }] }),
    searchVideos: async () => { throw unavailable; },
  });
  const result = await search({ query: 'Cholesterol' });
  assert.equal(result.videoSearchAvailable, false);
  assert.match(result.unavailableMessage, /YouTube video search could not finish/);
  assert.deepEqual(result.sources.map((source) => source.title), ['Article']);
});

test('Explore reports the real video error when both source lanes fail', async () => {
  const unavailable = new Error('YouTube search is not configured.');
  const search = createHealthFeedSearch({
    searchArticles: async () => { throw new Error('Article provider detail must stay private'); },
    searchVideos: async () => { throw unavailable; },
  });
  await assert.rejects(search({ query: 'Cholesterol' }), (error) => error === unavailable);
});
