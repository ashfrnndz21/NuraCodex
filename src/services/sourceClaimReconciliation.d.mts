export type ReconciliationClaim = {
  id: string;
  sourceId: string;
  evidenceState: string;
  acceptedAssertionId: string | null;
  retractedAt?: string | null;
};

export type ReconciliationFact = {
  id?: string;
  date?: string;
  sourceId?: string;
  sourceClaimId?: string;
  validUntil?: string | null;
};

export declare function findMissingAcceptedClaims<T extends ReconciliationClaim>(
  claims: readonly T[],
  facts: readonly ReconciliationFact[],
  sourceId: string | null | undefined,
): T[];

export declare function findMisdatedAcceptedClaims<T extends ReconciliationClaim & { effectiveAt?: string | null }>(
  claims: readonly T[],
  facts: readonly (ReconciliationFact & { id: string; date: string })[],
  sourceId: string | null | undefined,
): { claim: T; factId: string; effectiveAt: string }[];


export declare function findMissingRetractions<T extends ReconciliationClaim>(
  claims: readonly T[],
  facts: readonly ReconciliationFact[],
  sourceId: string | null | undefined,
): { claim: T; factId: string; retractedAt: string }[];
