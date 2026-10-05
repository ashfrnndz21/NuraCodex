export function healthFactRemovalOptions(fact) {
  const sourceLinked = Boolean(fact?.sourceId || fact?.sourceClaimId);
  const sourceLinkNeedsAttention = Boolean(fact?.sourceClaimId && !fact?.sourceId);
  const current = Boolean(fact) && !fact.validUntil && fact.reviewState !== 'user_retracted';

  return {
    canRemoveFromActiveProfile: current && !sourceLinkNeedsAttention,
    canDeletePermanently: Boolean(fact) && !sourceLinked,
    sourceLinked,
    sourceLinkNeedsAttention,
  };
}
