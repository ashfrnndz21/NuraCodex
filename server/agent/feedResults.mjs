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

export function uniqueHealthFeedItems(byUrl) {
  return [...new Map([...byUrl.values()].map((item) => [item.id, item])).values()];
}

/** Keep feed cards distinct by source, while suppressing repeated publisher/title/topic results. */
export function addHealthFeedCandidate({ byUrl, byTitle, source, topic, title, detail, retrievedAt }) {
  const canonicalUrl = canonicalHealthUrl(source?.url);
  if (!canonicalUrl) return { added: false, item: null };
  let parsed;
  try { parsed = new URL(canonicalUrl); } catch { return { added: false, item: null }; }
  const publisher = parsed.hostname.replace(/^www\./, '');
  const existingByUrl = byUrl.get(canonicalUrl);
  if (existingByUrl) {
    if (!existingByUrl.topic.split(' · ').includes(topic)) existingByUrl.topic += ` · ${topic}`;
    return { added: false, item: existingByUrl };
  }

  const titleKey = [publisher, normalizedText(title), normalizedText(topic)].join('|');
  const existingByTitle = byTitle.get(titleKey);
  if (existingByTitle) {
    byUrl.set(canonicalUrl, existingByTitle);
    return { added: false, item: existingByTitle };
  }

  const id = createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 20);
  const item = {
    id,
    title: String(title || '').slice(0, 140),
    detail: String(detail || '').replace(/\s+/g, ' ').slice(0, 520),
    url: canonicalUrl,
    publisher,
    topic,
    retrievedAt,
  };
  byUrl.set(canonicalUrl, item);
  byTitle.set(titleKey, item);
  return { added: true, item };
}
