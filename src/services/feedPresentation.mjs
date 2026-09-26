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

/** @param {Array<{id: string, label: string, status: 'started' | 'complete', detail?: string}>} activity
 * @returns {Array<{id: string, topic: string, status: 'started' | 'complete', detail: string}>}
 */
export function summarizeFeedActivity(activity) {
  return activity.map((item) => {
    const detail = String(item.detail || '');
    const selected = detail.match(/^Selected area:\s*(.+)$/i);
    const found = detail.match(/^Found\s+(\d+)\s+new sources?\s+for\s+(.+)$/i);
    const topic = found?.[2] || selected?.[1] || detail || 'Selected area';
    return {
      id: item.id,
      topic,
      status: item.status,
      detail: found ? `${found[1]} source${found[1] === '1' ? '' : 's'} found` : 'Checking trusted sources',
    };
  });
}
