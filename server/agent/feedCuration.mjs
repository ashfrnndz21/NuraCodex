import { getYouTubeVideoId } from '../../src/services/youtubeVideo.mjs';

function itemTopics(item) {
  return String(item?.topic ?? '').split(/\s+·\s+/).map((topic) => topic.trim()).filter(Boolean);
}

/** Keep a daily topic edition to at most three articles and three YouTube videos. */
export function curateHealthFeedItems(items, topics, maxPerType = 3) {
  const cap = Number.isSafeInteger(maxPerType) ? Math.max(0, Math.min(3, maxPerType)) : 3;
  const selected = new Map();

  for (const topic of topics) {
    const counts = { articles: 0, videos: 0 };
    for (const item of items) {
      if (!itemTopics(item).includes(topic.label)) continue;
      const kind = getYouTubeVideoId(item.url) ? 'videos' : 'articles';
      if (counts[kind] >= cap) continue;
      counts[kind] += 1;
      selected.set(item.id, item);
    }
  }

  return items.filter((item) => selected.has(item.id));
}
