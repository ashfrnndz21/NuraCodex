import { getYouTubeVideoId } from '../../src/services/youtubeVideo.mjs';
import { sanitizePublicHealthTopics } from '../../src/services/healthSearchTopic.mjs';
import { canonicalHealthUrl } from '../agent/feedResults.mjs';
import { HealthVideoSearchUnavailableError } from './openaiResponses.mjs';

const API_ROOT = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_TRUSTED_HANDLES = Object.freeze([
  '@clevelandclinic', '@mayoclinic', '@american_heart', '@cdc', '@who', '@nhs',
]);
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function unavailable(message, code = 'trusted_health_videos_unavailable') {
  return new HealthVideoSearchUnavailableError(message, code);
}

function safeHandles(value) {
  const configured = typeof value === 'string' && value.trim()
    ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
    : DEFAULT_TRUSTED_HANDLES;
  return [...new Set(configured.filter((handle) => /^@?[\p{L}\p{N}._-]{3,30}$/u.test(handle)))];
}

function safeTopicLabel(query) {
  try {
    const [topic] = sanitizePublicHealthTopics([{ id: 'youtube-search', label: String(query ?? '').trim().replace(/\s+/g, ' ') }]);
    return topic.label;
  } catch {
    throw unavailable('Choose a general health area before searching for videos.', 'invalid_video_search_topic');
  }
}

function thumbnailUrl(snippet) {
  const candidate = snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && ['i.ytimg.com', 'img.youtube.com'].includes(url.hostname.toLowerCase())
      ? url.href
      : undefined;
  } catch { return undefined; }
}

function providerErrorDetails(status, body) {
  const reason = [
    body?.error?.errors?.[0]?.reason,
    body?.error?.status,
  ].find((value) => typeof value === 'string' && /^[A-Za-z_]{1,80}$/.test(value)) ?? '';
  const normalizedReason = reason.toLowerCase();
  if (['keyinvalid', 'invalidkey', 'unauthorized'].includes(normalizedReason) || status === 401) {
    return {
      code: 'youtube_video_search_invalid_key',
      message: 'Google rejected the YouTube API key. Check that the key is current and belongs to a project with YouTube Data API v3 enabled.',
    };
  }
  if (['accessnotconfigured', 'servicedisabled', 'api_key_service_blocked'].includes(normalizedReason)) {
    return {
      code: 'youtube_video_search_api_not_enabled',
      message: 'YouTube Data API v3 is not enabled or allowed for this Google Cloud project. Enable it for the project that owns the server key, then try again.',
    };
  }
  if (['quotaexceeded', 'dailylimitexceeded', 'userratelimitexceeded', 'ratelimitexceeded'].includes(normalizedReason) || status === 429) {
    return {
      code: 'youtube_video_search_quota_exceeded',
      message: 'Google’s YouTube search quota is temporarily unavailable. Check the project quota or try again after it resets.',
    };
  }
  if (['iprefererblocked', 'ipaddressblocked', 'refererblocked', 'api_key_http_referrer_blocked', 'api_key_ip_address_blocked'].includes(normalizedReason)) {
    return {
      code: 'youtube_video_search_key_restriction',
      message: 'The Google key’s application restriction blocks this server request. Configure a server key with an allowed server IP and restrict it to YouTube Data API v3.',
    };
  }
  if (status === 403 || status === 401) {
    return {
      code: 'youtube_video_search_configuration_error',
      message: 'Google refused the YouTube request. Check the key permissions, API restrictions, and project quota.',
    };
  }
  return {
    code: 'youtube_video_search_failed',
    message: 'YouTube could not complete this video search. Try again later.',
  };
}

function videoSource(item) {
  const videoId = item?.id?.kind === 'youtube#video' ? item.id.videoId : null;
  const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
  if (!getYouTubeVideoId(url)) return null;
  const snippet = item.snippet ?? {};
  return {
    title: String(snippet.title ?? '').trim().slice(0, 140) || 'Health education video',
    detail: String(snippet.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 700),
    url,
    publisher: String(snippet.channelTitle ?? 'YouTube').trim().slice(0, 100),
    thumbnailUrl: thumbnailUrl(snippet),
    publishedAt: typeof snippet.publishedAt === 'string' ? snippet.publishedAt : undefined,
  };
}

/** Direct, server-only YouTube search. The only user-derived search term is a sanitized topic label. */
export function createYouTubeDataApi({
  apiKey = process.env.NURA_YOUTUBE_DATA_API_KEY,
  trustedChannelHandles = process.env.NURA_YOUTUBE_TRUSTED_CHANNEL_HANDLES,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  const channelCache = new Map();
  const searchCache = new Map();

  async function request(resource, params, signal) {
    const url = new URL(`${API_ROOT}/${resource}`);
    for (const [key, value] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal });
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      throw unavailable('YouTube could not be reached. Try the video search again.', 'youtube_video_search_network_error');
    }
    let body;
    try { body = await response.json(); }
    catch {
      if (response.ok) throw unavailable('YouTube returned an unreadable video search response.', 'youtube_video_search_failed');
      body = null;
    }
    if (!response.ok) {
      const details = providerErrorDetails(response.status, body);
      if (response.status === 400 && resource === 'channels'
        && !['youtube_video_search_invalid_key', 'youtube_video_search_api_not_enabled'].includes(details.code)) return { items: [] };
      throw unavailable(details.message, details.code);
    }
    try { return body; }
    catch { throw unavailable('YouTube returned an unreadable video search response.', 'youtube_video_search_failed'); }
  }

  async function trustedChannels(signal) {
    const handles = safeHandles(trustedChannelHandles);
    if (!handles.length) throw unavailable('Add at least one trusted YouTube health channel handle to the local server settings.', 'youtube_trusted_channels_missing');
    const channels = [];
    for (const handle of handles) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      const cached = channelCache.get(handle);
      if (cached && cached.expiresAt > now()) { channels.push({ handle, id: cached.id }); continue; }
      const result = await request('channels', { part: 'id', forHandle: handle }, signal);
      const id = result?.items?.[0]?.id;
      if (typeof id === 'string' && id) {
        channelCache.set(handle, { id, expiresAt: now() + CACHE_TTL_MS });
        channels.push({ handle, id });
      }
    }
    if (!channels.length) throw unavailable('No configured trusted YouTube health channels could be found.', 'youtube_trusted_channels_unavailable');
    return channels;
  }

  async function searchChannel(query, channelId, signal) {
    const result = await request('search', {
      part: 'snippet',
      q: query,
      channelId,
      type: 'video',
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      order: 'relevance',
      maxResults: 50,
    }, signal);
    const output = [];
    for (const item of result?.items ?? []) {
      if (item?.snippet?.channelId !== channelId) continue;
      const source = videoSource(item);
      if (source) output.push(source);
    }
    return output;
  }

  return {
    get configured() { return Boolean(String(apiKey ?? '').trim()); },
    async search({ query, signal, excludeUrls = [] } = {}) {
      if (!String(apiKey ?? '').trim()) {
        throw unavailable('Video search is not configured. Add the server-only NURA_YOUTUBE_DATA_API_KEY and restart the local preview.', 'youtube_video_search_not_configured');
      }
      const topic = safeTopicLabel(query);
      const cacheKey = topic.toLocaleLowerCase();
      const cached = searchCache.get(cacheKey);
      let candidates = cached && cached.expiresAt > now() ? cached.sources : null;
      if (!candidates) {
        const channels = await trustedChannels(signal);
        const byChannel = [];
        // Keep a candidate pool for later selected topics. Related queries often
        // return the same top videos; replacement candidates keep each tile useful.
        for (const channel of channels) {
          if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
          const sources = await searchChannel(topic, channel.id, signal);
          if (sources.length) byChannel.push(sources);
          if (byChannel.length >= 3) break;
        }
        const selected = [];
        const seen = new Set();
        // Round-robin keeps publisher variety while retaining alternatives.
        // Retain more than one screen of results so later searches can replace
        // already-seen videos instead of repeatedly returning the same top ten.
        for (let rank = 0; rank < 50; rank += 1) {
          for (const sources of byChannel) {
            const source = sources[rank];
            if (!source || seen.has(source.url)) continue;
            selected.push(source);
            seen.add(source.url);
            if (selected.length >= 50) break;
          }
          if (selected.length >= 50) break;
        }
        if (!selected.length) throw unavailable(undefined, 'trusted_health_videos_unavailable');
        candidates = selected;
        searchCache.set(cacheKey, { sources: candidates, expiresAt: now() + CACHE_TTL_MS });
      }
      const excluded = new Set(excludeUrls.map(canonicalHealthUrl).filter(Boolean));
      const sources = candidates.filter((source) => !excluded.has(canonicalHealthUrl(source.url))).slice(0, 10);
      if (!sources.length) throw unavailable('No new trusted videos were found for this topic today.', 'trusted_health_videos_exhausted');
      return { summary: '', sources: sources.map((source) => ({ ...source })) };
    },
  };
}

export function getYouTubeVideoSearchStatus() {
  return { configured: Boolean(String(process.env.NURA_YOUTUBE_DATA_API_KEY ?? '').trim()) };
}

// Keep channel ID lookups cached between topic searches for this server process.
const localYouTubeDataApi = createYouTubeDataApi();

export async function searchYouTubeHealthVideos(input) {
  return localYouTubeDataApi.search(input);
}
