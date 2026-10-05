import { createHash } from 'node:crypto';

const TRACKING_KEYS = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i;

export function canonicalHealthUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (TRACKING_KEYS.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch { return null; }
}

function normalizedText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const GENERIC_TITLE_WORDS = new Set(['a', 'an', 'and', 'are', 'about', 'article', 'for', 'from', 'guide', 'health', 'here', 'how', 'information', 'into', 'is', 'of', 'on', 'overview', 'some', 'the', 'to', 'understanding', 'what', 'with']);
function titleTokens(value) {
  return new Set(normalizedText(value).split(' ').filter((token) => token.length > 2 && !GENERIC_TITLE_WORDS.has(token)));
}
function isVideo(value) {
  try { return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(new URL(value).hostname); } catch { return false; }
}
function nearDuplicateDetail(left, right) {
  const a = titleTokens(left); const b = titleTokens(right);
  if (Math.min(a.size, b.size) < 8) return false;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / Math.min(a.size, b.size) >= 0.9 && shared / Math.max(a.size, b.size) >= 0.82;
}
function nearDuplicateTitle(left, right) {
  const a = titleTokens(left); const b = titleTokens(right);
  if (Math.min(a.size, b.size) < 3) return false;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared >= 3 && shared / Math.max(a.size, b.size) >= 0.72;
}

function safeVideoThumbnail(value, isVideo) {
  if (!isVideo || typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['i.ytimg.com', 'img.youtube.com'].includes(url.hostname.toLowerCase())
      ? url.href
      : undefined;
  } catch { return undefined; }
}

function safeVideoPublishedAt(value, isVideo) {
  if (!isVideo || typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function uniqueHealthFeedItems(byUrl) {
  return [...new Map([...byUrl.values()].map((item) => [item.id, item])).values()];
}

/** Keep feed cards distinct while suppressing exact and near-identical titles across publishers. */
export function addHealthFeedCandidate({ byUrl, byTitle, source, topic, title, detail, retrievedAt, mergeTopic = true }) {
  const canonicalUrl = canonicalHealthUrl(source?.url);
  if (!canonicalUrl) return { added: false, item: null };
  let parsed;
  try { parsed = new URL(canonicalUrl); } catch { return { added: false, item: null }; }
  const publisher = parsed.hostname.replace(/^www\./, '');
  const existingByUrl = byUrl.get(canonicalUrl);
  if (existingByUrl) {
    if (mergeTopic && !existingByUrl.topic.split(' · ').includes(topic)) existingByUrl.topic += ` · ${topic}`;
    existingByUrl.thumbnailUrl ??= safeVideoThumbnail(source?.thumbnailUrl, isVideo(canonicalUrl));
    existingByUrl.publishedAt ??= safeVideoPublishedAt(source?.publishedAt, isVideo(canonicalUrl));
    return { added: false, item: existingByUrl };
  }

  const mediaKind = isVideo(canonicalUrl) ? 'video' : 'article';
  const titleKey = [normalizedText(title), normalizedText(topic), mediaKind].join('|');
  const existingByTitle = byTitle.get(titleKey);
  if (existingByTitle) {
    byUrl.set(canonicalUrl, existingByTitle);
    return { added: false, item: existingByTitle };
  }
  const similar = [...byUrl.values()].find((item) => isVideo(item.url) === (mediaKind === 'video')
    && (normalizedText(item.title) === normalizedText(title)
      || nearDuplicateTitle(item.title, title)
      || (item.publisher !== publisher && nearDuplicateDetail(item.detail, detail))));
  if (similar) {
    if (mergeTopic) {
      if (!similar.topic.split(' · ').includes(topic)) similar.topic += ` · ${topic}`;
      byUrl.set(canonicalUrl, similar);
      byTitle.set(titleKey, similar);
    }
    return { added: false, item: similar };
  }

  const id = createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 20);
  const thumbnail = safeVideoThumbnail(source?.thumbnailUrl, mediaKind === 'video');
  const publishedAt = safeVideoPublishedAt(source?.publishedAt, mediaKind === 'video');
  const item = {
    id,
    title: String(title || '').slice(0, 140),
    // Preserve the complete available provider summary. The UI may collapse
    // it visually, but the tail must remain available when a user expands it.
    detail: String(detail || '').replace(/\s+/g, ' ').slice(0, 2000),
    url: canonicalUrl,
    publisher,
    topic,
    retrievedAt,
    ...(thumbnail ? { thumbnailUrl: thumbnail } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
  byUrl.set(canonicalUrl, item);
  byTitle.set(titleKey, item);
  return { added: true, item };
}
