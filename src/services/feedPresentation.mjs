/** Turn a provider's long health summary into a short first view with an explicit full-detail path. */
/** @param {string} summary @param {string} [topic] @param {number} [maxLength] */
export function compactFeedBrief(summary, topic = '', maxLength = 420) {
  const raw = String(summary || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const escapedTopic = String(topic || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withoutLead = escapedTopic
    ? raw.replace(new RegExp(`^${escapedTopic}:\\s*brief health education\\s*[-–—:]\\s*`, 'i'), '')
    : raw;
  const sentences = withoutLead.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  let preview = sentences.slice(0, 2).join(' ');
  if (!preview) preview = withoutLead;
  if (preview.length > maxLength) {
    const clipped = preview.slice(0, maxLength + 1);
    const wordEnd = clipped.lastIndexOf(' ');
    preview = `${clipped.slice(0, wordEnd > maxLength * 0.55 ? wordEnd : maxLength).trimEnd()}…`;
  }
  return preview;
}

/**
 * Keep generated reading copy distinct from publisher-provided material.
 * When a personalized note is unavailable, show the real source title and
 * summary instead of presenting a deterministic template as Nura's analysis.
 */
export function feedCardCopy(item, brief, personalizedNote) {
  const headline = String(personalizedNote?.headline ?? '').trim();
  const learnFromSource = String(personalizedNote?.learnFromSource ?? '').trim();
  const sourceTitle = String(item?.title ?? '').trim();
  const sourceSummary = String(item?.detail ?? '').trim() || String(brief?.summary ?? '').trim();
  const hasPersonalizedNote = Boolean(headline || learnFromSource);
  return {
    headline: headline || sourceTitle,
    headlineLabel: hasPersonalizedNote ? 'NURA’S PERSONALIZED NOTE' : 'PUBLISHED HEADLINE',
    takeaway: learnFromSource || sourceSummary,
    takeawayLabel: learnFromSource ? 'LEARN FROM THIS SOURCE' : sourceSummary ? 'SOURCE SUMMARY' : '',
    personalized: hasPersonalizedNote,
  };
}

/** @param {Array<{id: string, label: string, status: 'started' | 'complete' | 'failed', detail?: string}>} activity
 * @returns {Array<{id: string, topic: string, status: 'started' | 'complete' | 'failed', detail: string}>}
 */
export function summarizeFeedActivity(activity) {
  return activity.map((item) => {
    const detail = String(item.detail || '');
    const selected = detail.match(/^Selected area:\s*(.+)$/i);
    const mediaCounts = detail.match(/^Found\s+(\d+)\s+articles?\s+·\s+(\d+)\s+videos?\s+for\s+(.+?)(?:\s+·\s+(.+))?$/i);
    const found = detail.match(/^Found\s+(\d+)\s+new sources?\s+for\s+(.+)$/i);
    const failed = detail.match(/^Search failed for\s+(.+?)\s+—\s+(.+)$/i);
    const topic = mediaCounts?.[3] || found?.[2] || failed?.[1] || selected?.[1] || detail || 'Selected area';
    return {
      id: item.id,
      topic,
      status: item.status,
      detail: mediaCounts ? `${mediaCounts[1]} article${mediaCounts[1] === '1' ? '' : 's'} · ${mediaCounts[2]} video${mediaCounts[2] === '1' ? '' : 's'}${mediaCounts[4] ? ` · ${mediaCounts[4]}` : ''}` : found ? `${found[1]} source${found[1] === '1' ? '' : 's'} found` : failed ? failed[2] : 'Checking trusted sources',
    };
  });
}

/** Keep the For you edition scoped to items retrieved on the user's local calendar day. */
export function isFeedItemFromLocalDay(retrievedAt, reference = new Date()) {
  const date = new Date(retrievedAt);
  if (!Number.isFinite(date.getTime()) || !(reference instanceof Date) || !Number.isFinite(reference.getTime())) return false;
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
}
