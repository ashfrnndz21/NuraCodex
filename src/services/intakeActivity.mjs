/** @typedef {{id: string, label: string, status: 'started' | 'progress' | 'complete' | 'failed' | 'cancelled'}} IntakeActivity */

/**
 * Append a real intake milestone and settle earlier in-flight milestones for the same file.
 * Each SSE event is immutable; the review timeline projects later events onto prior stages so
 * a completed upload never leaves stale activity indicators spinning.
 * @param {Array<{id: string, label: string, status: 'started' | 'progress' | 'complete' | 'failed' | 'cancelled'}>} current
 * @param {{id: string, label: string, status: 'started' | 'progress' | 'complete' | 'failed' | 'cancelled'}} incoming
 * @param {string} assetId
 * @param {string} fileName
 * @returns {IntakeActivity[]}
 */
export function appendIntakeActivity(current, incoming, assetId, fileName) {
  const prefix = `${assetId}:`;
  /** @type {IntakeActivity['status']} */
  const settledStatus = incoming.status === 'failed' ? 'failed'
    : incoming.status === 'cancelled' ? 'cancelled' : 'complete';
  const settled = current.map((item) => item.id.startsWith(prefix) && item.status === 'started'
    ? { ...item, status: settledStatus }
    : item);
  return [...settled, { ...incoming, id: `${prefix}${incoming.id}`, label: `${fileName} · ${incoming.label}` }];
}
