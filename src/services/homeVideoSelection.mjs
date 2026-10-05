import { getYouTubeVideoId } from './youtubeVideo.mjs';

/** Pick the newest distinct, visible YouTube videos for the Home preview. */
export function selectRecentHomeVideos(items, limit = 2) {
  const maximum = Number.isInteger(limit) && limit > 0 ? limit : 0;
  if (!maximum || !Array.isArray(items)) return [];

  const ordered = items
    .filter((item) => item && !item.dismissed && getYouTubeVideoId(item.url))
    .map((item, index) => ({ item, index, timestamp: Date.parse(String(item.retrievedAt ?? '')) || 0 }))
    .sort((left, right) => right.timestamp - left.timestamp || left.index - right.index);

  const seen = new Set();
  const selected = [];
  for (const { item } of ordered) {
    const videoId = getYouTubeVideoId(item.url);
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    selected.push(item);
    if (selected.length >= maximum) break;
  }
  return selected;
}
