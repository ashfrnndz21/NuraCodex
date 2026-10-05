import assert from 'node:assert/strict';
import test from 'node:test';
import { createYouTubeDataApi } from './youtubeDataApi.mjs';

const video = (id, channelId, title = 'Trusted health video') => ({
  id: { kind: 'youtube#video', videoId: id },
  snippet: {
    title, description: 'A public health education video.', channelId, channelTitle: 'Trusted Health Publisher',
    publishedAt: '2026-09-30T08:00:00Z',
    thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
  },
});

function response(items, status = 200) {
  const body = items && typeof items === 'object' && !Array.isArray(items) ? items : { items };
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('searches approved publishers with only the broad selected topic and returns a thumbnail candidate pool', async () => {
  const calls = [];
  const api = createYouTubeDataApi({
    apiKey: 'test-key', trustedChannelHandles: '@nhs', now: () => 1,
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      if (url.pathname.endsWith('/channels')) return response([{ id: 'trusted-channel' }]);
      return response([
        video('abcDEF123_0', 'other-channel', 'Unapproved source'),
        video('abcDEF123_1', 'trusted-channel', 'LDL and HDL: what to know'),
        video('abcDEF123_2', 'trusted-channel', 'A closer look at a lipid panel'),
        video('abcDEF123_3', 'trusted-channel', 'Understanding cholesterol markers'),
        video('abcDEF123_4', 'trusted-channel', 'This fourth result is outside the daily limit'),
      ]);
    },
  });
  const result = await api.search({ query: 'LDL and HDL', signal: new AbortController().signal });
  const search = calls.find((url) => url.pathname.endsWith('/search'));
  assert.ok(search);
  assert.equal(search.searchParams.get('q'), 'LDL and HDL');
  assert.equal(search.searchParams.get('channelId'), 'trusted-channel');
  assert.equal(search.searchParams.get('type'), 'video');
  assert.equal(search.searchParams.get('videoEmbeddable'), 'true');
  assert.equal(search.searchParams.get('safeSearch'), 'strict');
  assert.equal(search.searchParams.get('maxResults'), '50');
  assert.equal(search.searchParams.get('key'), 'test-key');
  assert.equal(result.sources.length, 4);
  assert.equal(result.sources[0].title, 'LDL and HDL: what to know');
  assert.equal(result.sources[0].thumbnailUrl, 'https://i.ytimg.com/vi/abcDEF123_1/hqdefault.jpg');
  assert.equal(result.sources[0].publishedAt, '2026-09-30T08:00:00Z');
  assert.ok(result.sources.every((source) => source.url.startsWith('https://www.youtube.com/watch?v=')));
  assert.ok(calls.filter((url) => url.pathname.endsWith('/search')).every((url) => url.searchParams.get('q') === 'LDL and HDL'));
});

test('uses cached replacement candidates when earlier selected topics already displayed videos', async () => {
  const api = createYouTubeDataApi({
    apiKey: 'test-key', trustedChannelHandles: '@nhs', now: () => 1,
    fetchImpl: async (url) => url.pathname.endsWith('/channels')
      ? response([{ id: 'trusted-channel' }])
      : response([
        video('abcDEF123_1', 'trusted-channel', 'First LDL video'),
        video('abcDEF123_2', 'trusted-channel', 'Second LDL video'),
        video('abcDEF123_3', 'trusted-channel', 'Third LDL video'),
        video('abcDEF123_4', 'trusted-channel', 'Fourth LDL video'),
      ]),
  });
  const first = await api.search({ query: 'Cholesterol' });
  const second = await api.search({ query: 'LDL and HDL', excludeUrls: first.sources.slice(0, 2).map((source) => source.url) });
  assert.deepEqual(second.sources.map((source) => source.url), first.sources.slice(2).map((source) => source.url));
});

test('keeps replacement candidates beyond the first screen for a later contextual search', async () => {
  const candidates = Array.from({ length: 14 }, (_, index) =>
    video(`abcDEF12_${String(index + 1).padStart(2, '0')}`, 'trusted-channel', `Cholesterol lesson ${index + 1}`));
  const api = createYouTubeDataApi({
    apiKey: 'test-key', trustedChannelHandles: '@nhs', now: () => 1,
    fetchImpl: async (url) => url.pathname.endsWith('/channels')
      ? response([{ id: 'trusted-channel' }])
      : response(candidates),
  });
  const first = await api.search({ query: 'Cholesterol' });
  const next = await api.search({ query: 'LDL and HDL', excludeUrls: first.sources.map((source) => source.url) });
  assert.equal(first.sources.length, 10);
  assert.equal(next.sources.length, 4);
  assert.deepEqual(next.sources.map((source) => source.title), candidates.slice(10).map((source) => source.snippet.title));
});

test('generalizes medicine details before the query reaches YouTube', async () => {
  const calls = [];
  const api = createYouTubeDataApi({
    apiKey: 'test-key', trustedChannelHandles: '@nhs',
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      return url.pathname.endsWith('/channels') ? response([{ id: 'trusted-channel' }]) : response([video('abcDEF123_1', 'trusted-channel')]);
    },
  });
  await api.search({ query: 'Medicine · Ezetimibe' });
  const query = calls.find((url) => url.pathname.endsWith('/search')).searchParams.get('q');
  assert.equal(query, 'Medication information');
  assert.doesNotMatch(query, /Ezetimibe/i);
});

test('prioritizes trusted publisher variety while keeping additional unique replacement videos', async () => {
  let searchCount = 0;
  const channelIds = new Map([
    ['@clevelandclinic', 'cleveland'],
    ['@mayoclinic', 'mayo'],
    ['@american_heart', 'aha'],
  ]);
  const api = createYouTubeDataApi({
    apiKey: 'test-key', trustedChannelHandles: '@clevelandclinic,@mayoclinic,@american_heart',
    fetchImpl: async (url) => {
      if (url.pathname.endsWith('/channels')) return response([{ id: channelIds.get(url.searchParams.get('forHandle')) }]);
      searchCount += 1;
      const channel = url.searchParams.get('channelId');
      return response(channel === 'cleveland'
        ? [video('abcDEF123_1', 'cleveland', 'Cleveland cholesterol guide'), video('abcDEF123_2', 'cleveland', 'Another Cleveland cholesterol guide')]
        : channel === 'mayo'
          ? [video('abcDEF123_3', 'mayo', 'Mayo cholesterol guide')]
          : [video('abcDEF123_4', 'aha', 'AHA cholesterol guide')]);
    },
  });
  const result = await api.search({ query: 'Heart health' });
  assert.equal(searchCount, 3);
  assert.equal(result.sources.length, 4);
  assert.deepEqual(result.sources.slice(0, 3).map((source) => source.publisher), ['Trusted Health Publisher', 'Trusted Health Publisher', 'Trusted Health Publisher']);
  assert.deepEqual(result.sources.map((source) => source.url), [
    'https://www.youtube.com/watch?v=abcDEF123_1',
    'https://www.youtube.com/watch?v=abcDEF123_3',
    'https://www.youtube.com/watch?v=abcDEF123_4',
    'https://www.youtube.com/watch?v=abcDEF123_2',
  ]);
});

test('reuses cached public-topic video results instead of spending more YouTube quota', async () => {
  let searchCount = 0;
  const api = createYouTubeDataApi({
    apiKey: 'test-key', trustedChannelHandles: '@nhs', now: () => 1,
    fetchImpl: async (url) => {
      if (url.pathname.endsWith('/channels')) return response([{ id: 'trusted-channel' }]);
      searchCount += 1;
      return response([video('abcDEF123_1', 'trusted-channel')]);
    },
  });
  const first = await api.search({ query: 'Cholesterol' });
  const second = await api.search({ query: 'Cholesterol' });
  assert.equal(searchCount, 1);
  assert.deepEqual(second.sources, first.sources);
});

test('returns a safe setup message when the server key is missing', async () => {
  const api = createYouTubeDataApi({ apiKey: '', fetchImpl: async () => assert.fail('must not call YouTube without a key') });
  await assert.rejects(api.search({ query: 'Cholesterol' }), (error) => {
    assert.equal(error.code, 'youtube_video_search_not_configured');
    assert.match(error.message, /NURA_YOUTUBE_DATA_API_KEY/);
    return true;
  });
});

test('does not expose provider response details or the API key on credential errors', async () => {
  const api = createYouTubeDataApi({ apiKey: 'never-show-this-key', trustedChannelHandles: '@nhs', fetchImpl: async () => response([], 403) });
  await assert.rejects(api.search({ query: 'Cholesterol' }), (error) => {
    assert.equal(error.code, 'youtube_video_search_configuration_error');
    assert.doesNotMatch(error.message, /never-show-this-key/);
    return true;
  });
});

test('explains common YouTube API configuration failures without exposing provider details', async (t) => {
  const cases = [
    ['invalid key returned during channel lookup', 400, 'keyInvalid', 'youtube_video_search_invalid_key', /key is current/],
    ['YouTube Data API is disabled', 403, 'accessNotConfigured', 'youtube_video_search_api_not_enabled', /not enabled or allowed/],
    ['YouTube search quota is exhausted', 403, 'quotaExceeded', 'youtube_video_search_quota_exceeded', /quota is temporarily unavailable/],
    ['server key application restriction blocks the request', 403, 'ipRefererBlocked', 'youtube_video_search_key_restriction', /server request/],
  ];
  for (const [name, status, reason, code, message] of cases) {
    await t.test(name, async () => {
      const api = createYouTubeDataApi({
        apiKey: 'private-test-key', trustedChannelHandles: '@nhs',
        fetchImpl: async (url) => url.pathname.endsWith('/channels')
          ? response({ error: { errors: [{ reason }], message: 'private provider diagnostic' } }, status)
          : assert.fail('channel lookup should fail first'),
      });
      await assert.rejects(api.search({ query: 'Cholesterol' }), (error) => {
        assert.equal(error.code, code);
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /private provider diagnostic|private-test-key|keyInvalid|quotaExceeded|ipRefererBlocked/i);
        return true;
      });
    });
  }
});
