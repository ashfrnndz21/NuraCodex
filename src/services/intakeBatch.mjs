const isCancelled = (error) => error?.name === 'IntakeCancelledError' || error?.name === 'AbortError';

/** Process a user-approved group of staged files one at a time, retaining partial results. */
export async function processIntakeBatch(assets, processOne, { signal, onStatus = () => {} } = {}) {
  const results = [];
  for (const asset of assets) {
    if (signal?.aborted) break;
    onStatus({ assetId: asset.id, status: 'reading' });
    try {
      const value = await processOne(asset);
      const result = { assetId: asset.id, status: 'complete', value };
      results.push(result);
      onStatus(result);
    } catch (error) {
      if (signal?.aborted || isCancelled(error)) {
        const result = { assetId: asset.id, status: 'cancelled' };
        results.push(result);
        onStatus(result);
        break;
      }
      const result = { assetId: asset.id, status: 'failed', error };
      results.push(result);
      onStatus(result);
    }
  }
  return results;
}
