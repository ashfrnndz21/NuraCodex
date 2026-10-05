import { getYouTubeVideoId } from '../../src/services/youtubeVideo.mjs';
import { canonicalHealthUrl } from '../agent/feedResults.mjs';
import { HealthSearchConfigurationError, HealthVideoSearchUnavailableError } from './openaiResponses.mjs';

/** Keep Explore's public topic feed isolated from arbitrary Ask Nura questions. */
export function createHealthFeedSearch({ searchArticles, searchVideos }) {
  return async function searchHealthFeedSources({ query, signal, excludeUrls = [] }) {
    const [articlesResult, videosResult] = await Promise.allSettled([
      searchArticles({ query, signal, excludeUrls }),
      searchVideos({ query, signal, excludeUrls }),
    ]);
    const excluded = new Set(excludeUrls.map(canonicalHealthUrl).filter(Boolean));
    const notExcluded = (source) => {
      const canonical = canonicalHealthUrl(source?.url);
      return canonical && !excluded.has(canonical);
    };
    const articles = articlesResult.status === 'fulfilled'
      ? (articlesResult.value.sources ?? []).filter((source) => !getYouTubeVideoId(source.url) && notExcluded(source)).slice(0, 10)
      : [];
    const videos = videosResult.status === 'fulfilled'
      ? (videosResult.value.sources ?? []).filter((source) => Boolean(getYouTubeVideoId(source.url)) && notExcluded(source)).slice(0, 10)
      : [];
    if (!articles.length && !videos.length && articlesResult.status === 'rejected' && videosResult.status === 'rejected') {
      throw videosResult.reason;
    }
    const videoError = videosResult.status === 'rejected' ? videosResult.reason : null;
    const articleError = articlesResult.status === 'rejected' ? articlesResult.reason : null;
    return {
      summary: articlesResult.status === 'fulfilled' ? String(articlesResult.value.summary ?? '') : '',
      sources: [...articles, ...videos],
      articleSearchAvailable: articlesResult.status === 'fulfilled',
      videoSearchAvailable: videosResult.status === 'fulfilled',
      unavailableMessage: videoError instanceof HealthVideoSearchUnavailableError
        ? videoError.message
        : articleError instanceof HealthSearchConfigurationError
          ? articleError.message
          : videoError
            ? 'YouTube video search could not finish. The available articles are still shown.'
            : articleError
              ? 'Article search could not finish. The available videos are still shown.'
              : '',
    };
  };
}
