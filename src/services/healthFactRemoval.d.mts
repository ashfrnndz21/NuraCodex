export function healthFactRemovalOptions(fact: {
  sourceId?: string;
  sourceClaimId?: string;
  validUntil?: string | null;
  reviewState?: 'user_confirmed' | 'user_retracted';
} | null | undefined): {
  canRemoveFromActiveProfile: boolean;
  canDeletePermanently: boolean;
  sourceLinked: boolean;
  sourceLinkNeedsAttention: boolean;
};
