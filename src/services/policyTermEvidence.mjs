/** Resolve a reviewed policy term to the saved source and claim that contain its quote. */
export function policyTermEvidenceTarget(term, assets) {
  const sourceId = typeof term?.sourceId === 'string' ? term.sourceId : '';
  const claimId = typeof term?.sourceClaimId === 'string' ? term.sourceClaimId : '';
  if (!sourceId || !claimId || !Array.isArray(assets)) return null;

  const asset = assets.find((item) => item?.purpose === 'insurance' && item.serverSourceId === sourceId && typeof item.id === 'string');
  if (!asset) return null;

  return { assetId: asset.id, sourceId, claimId };
}
