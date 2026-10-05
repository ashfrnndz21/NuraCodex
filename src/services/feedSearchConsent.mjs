import { sanitizePublicHealthTopics } from './healthSearchTopic.mjs';

/** Build the smallest allowed payload for one explicitly consented search. */
export function createHealthFeedSearchPayload(topics, consentConfirmed, { excludeUrls = [] } = {}) {
  if (consentConfirmed !== true) {
    throw new Error('Please review and confirm consent before starting this search.');
  }
  if (!Array.isArray(topics) || topics.length < 1 || topics.length > 3) {
    throw new Error('Choose between one and three health areas for this search.');
  }

  const safeTopics = sanitizePublicHealthTopics(topics);
  if (!Array.isArray(excludeUrls) || excludeUrls.length > 500) {
    throw new Error('The saved-source list for this search is not valid.');
  }
  const safeExcludedUrls = [...new Set(excludeUrls.flatMap((value) => {
    if (typeof value !== 'string' || value.length > 2048) return [];
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? [url.href] : [];
    } catch { return []; }
  }))].slice(0, 500);

  return {
    consentConfirmed: true,
    topics: safeTopics,
    ...(safeExcludedUrls.length ? { excludeUrls: safeExcludedUrls } : {}),
  };
}
