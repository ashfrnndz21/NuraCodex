import test from 'node:test';
import assert from 'node:assert/strict';
import { getYouTubeThumbnailCandidates, getYouTubeThumbnailForVideo } from './youtubeVideo.mjs';

test('thumbnail candidates prefer the widely available high-quality preview and retain fallbacks', () => {
  assert.deepEqual(getYouTubeThumbnailCandidates('https://www.youtube.com/watch?v=abcDEF123_1'), [
    'https://i.ytimg.com/vi/abcDEF123_1/hqdefault.jpg',
    'https://i.ytimg.com/vi/abcDEF123_1/maxresdefault.jpg',
    'https://i.ytimg.com/vi/abcDEF123_1/mqdefault.jpg',
    'https://i.ytimg.com/vi/abcDEF123_1/default.jpg',
  ]);
});

test('thumbnail candidates reject non-YouTube video URLs', () => {
  assert.deepEqual(getYouTubeThumbnailCandidates('https://example.com/watch?v=abcDEF123_1'), []);
});

test('video cards use only a provider thumbnail that matches the video and otherwise show branded artwork', () => {
  const videoUrl = 'https://www.youtube.com/watch?v=abcDEF123_1';
  assert.equal(getYouTubeThumbnailForVideo(videoUrl, 'https://i.ytimg.com/vi/abcDEF123_1/hqdefault.jpg'), 'https://i.ytimg.com/vi/abcDEF123_1/hqdefault.jpg');
  assert.equal(getYouTubeThumbnailForVideo(videoUrl, undefined), null);
  assert.equal(getYouTubeThumbnailForVideo(videoUrl, 'https://i.ytimg.com/vi/otherID12345/hqdefault.jpg'), null);
  assert.equal(getYouTubeThumbnailForVideo(videoUrl, 'https://example.com/vi/abcDEF123_1/hqdefault.jpg'), null);
});
