import assert from 'node:assert/strict';
import test from 'node:test';
import { feedSearchSetupReason } from './feedSearchStatus.mjs';

test('points to the server-only YouTube key when video search is not configured', () => {
  assert.match(feedSearchSetupReason({ capabilities: { youtubeVideoSearch: false } }), /NURA_YOUTUBE_DATA_API_KEY/);
});

test('explains that both trusted search flags are needed when a key exists', () => {
  assert.match(feedSearchSetupReason({ capabilities: { youtubeVideoSearch: true, trustedHealthSearch: false } }), /NURA_HEALTH_SEARCH_ENABLED.*NURA_ENABLE_DEMO_WEB_SEARCH/);
});

test('uses the service reason only when capabilities do not identify the setup problem', () => {
  assert.equal(feedSearchSetupReason({ capabilities: { youtubeVideoSearch: true, trustedHealthSearch: true }, reason: 'Temporary service issue.' }), 'Temporary service issue.');
});
