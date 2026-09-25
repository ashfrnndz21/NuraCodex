const TRACKING_KEYS = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i;

function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
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

function publisherTitleKey(item) {
  const publisher = normalized(item.publisher).replace(/^www\s+/, '');
  return `${publisher}|${normalized(item.title)}`;
}

function hasSharedTopic(left, right) {
  const rightTopics = new Set(topicLabels(right.topic).map(normalized));
  return topicLabels(left.topic).some((topic) => rightTopics.has(normalized(topic)));
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
      group = titleMatches.find((candidate) => candidate.items.some((member) => hasSharedTopic(member, item)));
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
