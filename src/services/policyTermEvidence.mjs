/** Resolve a reviewed policy term to the saved source and claim that contain its quote. */
export function policyTermEvidenceTarget(term, assets) {
  const sourceId = typeof term?.sourceId === 'string' ? term.sourceId.trim() : '';
  const claimId = typeof term?.sourceClaimId === 'string' ? term.sourceClaimId.trim() : '';
  if (!sourceId || !claimId || !Array.isArray(assets)) return null;

  const asset = assets.find((item) => item?.purpose === 'insurance' && item.serverSourceId === sourceId && typeof item.id === 'string');
  if (!asset) return null;

  return { assetId: asset.id, sourceId, claimId };
}


/** Return the honest action available for a reviewed policy term's evidence. */
export function policyTermEvidenceAction(term, assets) {
  const target = policyTermEvidenceTarget(term, assets);
  if (target) return { kind: 'quote', label: 'VIEW SOURCE QUOTE' };

  const sourceId = typeof term?.sourceId === 'string' ? term.sourceId.trim() : '';
  const hasSavedSource = sourceId && Array.isArray(assets)
    && assets.some((item) => item?.purpose === 'insurance' && item.serverSourceId === sourceId && typeof item.id === 'string');
  if (hasSavedSource) return { kind: 'source', label: 'OPEN ORIGINAL SOURCE' };
  return { kind: 'unavailable', label: null };
}


/** Resolve a policy source only within the insurance registry. */
export function policySourceAsset(sourceId, assets) {
  const normalizedSourceId = typeof sourceId === 'string' ? sourceId.trim() : '';
  if (!normalizedSourceId || !Array.isArray(assets)) return null;
  return assets.find((item) => item?.purpose === 'insurance' && item.serverSourceId === normalizedSourceId && typeof item.id === 'string') ?? null;
}
