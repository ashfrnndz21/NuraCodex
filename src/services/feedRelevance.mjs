import { selectFeedPersonalContext } from './feedPersonalization.mjs';

const STOP_WORDS = new Set([
  'and', 'are', 'about', 'article', 'from', 'guide', 'health', 'how', 'into',
  'more', 'report', 'result', 'results', 'source', 'the', 'this', 'what', 'with',
]);

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function topicLabels(value) {
  return String(value ?? '').split(/\s+·\s+/).map((topic) => topic.trim()).filter(Boolean);
}

function itemText(item) {
  return normalize(`${item?.title ?? ''} ${item?.detail ?? ''}`);
}

function containsPhrase(haystack, phrase) {
  const normalizedPhrase = normalize(phrase);
  return normalizedPhrase.length >= 3 && ` ${haystack} `.includes(` ${normalizedPhrase} `);
}

function tokenOverlap(left, right) {
  const source = new Set(normalize(left).split(' ').filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
  const target = [...new Set(normalize(right).split(' ').filter((token) => token.length > 2 && !STOP_WORDS.has(token)))];
  if (target.length < 2 || source.size === 0) return 0;
  return target.filter((token) => source.has(token)).length / target.length;
}

function factIdFor(label, facts) {
  const normalizedLabel = normalize(label);
  return facts.find((fact) => normalize(fact?.label) === normalizedLabel
    && ['confirmed', 'reviewed'].includes(fact?.status)
    && fact?.reviewState === 'user_confirmed'
    && isCurrentFact(fact))?.id ?? '';
}

function isCurrentFact(fact, now = Date.now()) {
  if (fact?.validUntil) return false;
  if (!fact?.validFrom) return true;
  const validFrom = Date.parse(String(fact.validFrom));
  return Number.isFinite(validFrom) && validFrom <= now;
}

function currentRegistryBriefs(briefs) {
  const latestByTopic = new Map();
  for (const brief of briefs) {
    const key = String(brief?.topicId ?? brief?.topicLabel ?? '').trim().toLowerCase();
    if (!key) continue;
    const previous = latestByTopic.get(key);
    if (!previous || String(brief?.createdAt ?? '') > String(previous?.createdAt ?? '')) latestByTopic.set(key, brief);
  }
  return [...latestByTopic.values()];
}

function relevanceScore(item, { facts = [], treatments = [], links = [], registryBriefs = [], recentQuestionCues = [] } = {}, excludedIdentifiers = []) {
  const currentFacts = facts.filter((fact) => ['confirmed', 'reviewed'].includes(fact?.status)
    && fact?.reviewState === 'user_confirmed' && isCurrentFact(fact));
  const localContext = selectFeedPersonalContext(item, currentFacts, treatments, excludedIdentifiers);
  const sourceText = itemText(item);
  const title = normalize(item?.title);
  let score = 0;

  for (const fact of localContext.facts) {
    score += 2;
    if (containsPhrase(title, fact.label)) score += 14;
    else if (containsPhrase(sourceText, fact.label)) score += 7;

    const factId = factIdFor(fact.label, currentFacts);
    if (!factId) continue;
    for (const link of links) {
      const connectsFact = link?.from === `fact:${factId}` || link?.to === `fact:${factId}`;
      if (connectsFact && tokenOverlap(sourceText, link.label) >= 0.5) score += 5;
    }
  }

  for (const treatment of localContext.treatments) {
    const treatmentName = normalize(treatment.name);
    const treatmentPurpose = normalize(treatment.purpose);
    if (treatmentName && containsPhrase(title, treatmentName)) score += 12;
    else if (treatmentName && containsPhrase(sourceText, treatmentName)) score += 6;
    if (treatmentPurpose && containsPhrase(sourceText, treatmentPurpose)) score += 2;
  }

  for (const question of recentQuestionCues) {
    const titleMatch = tokenOverlap(title, question);
    const sourceMatch = tokenOverlap(sourceText, question);
    score += Math.round(Math.max(titleMatch * 8, sourceMatch * 4));
  }

  const itemTopics = new Set(topicLabels(item?.topic).map(normalize));
  for (const brief of currentRegistryBriefs(registryBriefs)) {
    if (!itemTopics.has(normalize(brief?.topicLabel))) continue;
    for (const citation of brief?.citations ?? []) {
      const match = tokenOverlap(sourceText, citation?.title);
      if (match >= 0.6) score += 7;
    }
  }

  return score;
}

/**
 * Reorder an already-retrieved public feed locally using confirmed profile facts,
 * current treatments, user-recorded fact links, registry citations, and optional
 * recent Ask question cues. These signals remain on-device.
 * None of this context is returned or sent to the search provider.
 */
export function rankHealthFeedItemsByLocalContext(items, context = {}, excludedIdentifiers = []) {
  if (!Array.isArray(items) || items.length < 2) return Array.isArray(items) ? [...items] : [];

  const topics = Array.isArray(context.topics) ? context.topics : [];
  const preferredOrder = new Map(topics.map((topic, index) => [normalize(topic?.label ?? topic), index]));
  const buckets = new Map();
  items.forEach((item, index) => {
    const label = topicLabels(item?.topic)[0] || 'More reading';
    const key = normalize(label) || 'more-reading';
    if (!buckets.has(key)) buckets.set(key, { label, entries: [] });
    buckets.get(key).entries.push({ item, index, score: relevanceScore(item, context, excludedIdentifiers) });
  });

  return [...buckets.entries()]
    .sort((left, right) => (preferredOrder.get(left[0]) ?? Number.MAX_SAFE_INTEGER)
      - (preferredOrder.get(right[0]) ?? Number.MAX_SAFE_INTEGER))
    .flatMap(([, bucket]) => bucket.entries
      .sort((left, right) => Number(right.item?.saved) - Number(left.item?.saved)
        || right.score - left.score || left.index - right.index)
      .map(({ item }) => item));
}
