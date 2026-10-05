const TRACKING_KEYS = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i;

function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const GENERIC_TITLE_WORDS = new Set(['a', 'an', 'and', 'are', 'about', 'article', 'for', 'from', 'guide', 'health', 'here', 'how', 'information', 'into', 'is', 'of', 'on', 'overview', 'some', 'the', 'to', 'understanding', 'what', 'with']);
function titleTokens(value) {
  return new Set(normalized(value).split(' ').filter((token) => token.length > 2 && !GENERIC_TITLE_WORDS.has(token)));
}
function isVideo(item) {
  try { return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(new URL(item.url).hostname); } catch { return false; }
}
function nearDuplicateTitle(left, right) {
  const a = titleTokens(left); const b = titleTokens(right);
  if (Math.min(a.size, b.size) < 3) return false;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared >= 3 && shared / Math.max(a.size, b.size) >= 0.72;
}

function nearDuplicateDetail(left, right) {
  const a = titleTokens(left); const b = titleTokens(right);
  if (Math.min(a.size, b.size) < 8) return false;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / Math.min(a.size, b.size) >= 0.9 && shared / Math.max(a.size, b.size) >= 0.82;
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    url.hostname = url.hostname.replace(/^www\./i, '');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (TRACKING_KEYS.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch { return null; }
}

function topicLabels(topic) {
  return String(topic || '').split(/\s+·\s+/).map((value) => value.trim()).filter(Boolean);
}

/** Arrange each reading item once under a topic tile, in the user's chosen order. */
export function groupHealthFeedCategories(items, preferredTopics = []) {
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const label = topicLabels(item.topic)[0] || 'More reading';
    const id = normalized(label) || 'more-reading';
    if (!byId.has(id)) byId.set(id, { id, label, items: [] });
    byId.get(id).items.push(item);
  }
  const preferredOrder = new Map(preferredTopics.map((topic, index) => [normalized(typeof topic === 'string' ? topic : topic?.label), index]));
  return [...byId.values()].sort((left, right) => {
    const leftOrder = preferredOrder.get(normalized(left.label)) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = preferredOrder.get(normalized(right.label)) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.label.localeCompare(right.label);
  });
}

function publisherTitleKey(item) {
  const publisher = normalized(item.publisher).replace(/^www\s+/, '');
  return `${publisher}|${normalized(item.title)}`;
}

/**
 * Merge a fresh search without losing a person's saved or dismissed reading.
 * Dismissed items remain available to the Hidden view after another search.
 * @template {{ id: string, saved: boolean, dismissed: boolean }} T
 * @param {T[]} current
 * @param {Array<Omit<T, 'saved' | 'dismissed'>>} incoming
 * @returns {T[]}
 */
export function mergeHealthFeedItems(current, incoming) {
  const existing = new Map(current.map((item) => [item.id, item]));
  const next = incoming.map((item) => {
    const prior = existing.get(item.id);
    return { ...item, saved: prior?.saved ?? false, dismissed: prior?.dismissed ?? false };
  });

  for (const item of current) {
    if ((item.saved || item.dismissed) && !next.some((candidate) => candidate.id === item.id)) next.push(item);
  }
  return next;
}

/** Collapse repeated reading cards for display while retaining every saved source ID. */
export function groupHealthFeedItems(items) {
  const ordered = [...items].sort((left, right) => String(right.retrievedAt || '').localeCompare(String(left.retrievedAt || '')));
  const groups = [];
  const byUrl = new Map();
  const byPublisherTitle = new Map();

  for (const item of ordered) {
    const urlKey = canonicalUrl(item.url);
    const titleKey = publisherTitleKey(item);
    let group = urlKey ? byUrl.get(urlKey) : null;
    if (!group) {
      const titleMatches = byPublisherTitle.get(titleKey) || [];
      group = titleMatches.find((candidate) => candidate.items.some((member) => isVideo(member) === isVideo(item)));
    }
    if (!group) {
      group = groups.find((candidate) => candidate.items.some((member) => {
        if (isVideo(member) !== isVideo(item)) return false;
        const sameHeadline = normalized(member.title) === normalized(item.title) || nearDuplicateTitle(member.title, item.title);
        const sameExplanationAcrossPublishers = normalized(member.publisher) !== normalized(item.publisher)
          && nearDuplicateDetail(member.detail, item.detail);
        return sameHeadline || sameExplanationAcrossPublishers;
      }));
    }
    if (!group) {
      group = { items: [] };
      groups.push(group);
      if (urlKey) byUrl.set(urlKey, group);
      const titleMatches = byPublisherTitle.get(titleKey) || [];
      titleMatches.push(group);
      byPublisherTitle.set(titleKey, titleMatches);
    }
    group.items.push(item);
    if (urlKey) byUrl.set(urlKey, group);
    const titleMatches = byPublisherTitle.get(titleKey) || [];
    if (!titleMatches.includes(group)) titleMatches.push(group);
    byPublisherTitle.set(titleKey, titleMatches);
  }

  return groups.map(({ items: members }) => {
    const representative = members[0];
    const topics = [...new Map(members.flatMap((item) => topicLabels(item.topic)).map((topic) => [normalized(topic), topic])).values()];
    return {
      ...representative,
      topic: topics.join(' · '),
      topicLabels: topics,
      saved: members.some((item) => item.saved),
      dismissed: members.every((item) => item.dismissed),
      duplicateIds: [...new Set(members.map((item) => item.id))],
      activeIds: [...new Set(members.filter((item) => !item.dismissed).map((item) => item.id))],
    };
  });
}
