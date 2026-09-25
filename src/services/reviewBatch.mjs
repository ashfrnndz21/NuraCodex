/** Save explicitly staged review decisions in order and keep item-level failures retryable. */
export async function commitReviewBatch(operations, commit) {
  if (!Array.isArray(operations)) throw new Error('Review actions must be a list.');
  if (typeof commit !== 'function') throw new Error('A review save operation is required.');
  const ids = new Set();
  for (const operation of operations) {
    if (!operation || typeof operation.id !== 'string' || !operation.id.trim()) throw new Error('Each review action needs an ID.');
    if (ids.has(operation.id)) throw new Error('A review action can only be saved once per batch.');
    ids.add(operation.id);
  }
  const results = [];
  for (const operation of operations) {
    try {
      await commit(operation);
      results.push({ id: operation.id, status: 'saved' });
    } catch (error) {
      results.push({ id: operation.id, status: 'failed', message: error instanceof Error ? error.message : 'This item could not be saved.' });
    }
  }
  return results;
}
