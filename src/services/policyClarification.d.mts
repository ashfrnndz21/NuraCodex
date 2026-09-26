type PolicyFact = {
  id: string;
  label: string;
  category: string;
  status?: 'confirmed' | 'reviewed';
  sourceId?: string;
  sourceClaimId?: string;
  validUntil?: string | null;
  reviewState?: string;
};

type PolicyAsset = { purpose?: string; serverSourceId?: string };

export type PolicyClarification = {
  id: string;
  sourceId: string;
  sourceClaimId: string;
  sourceFactId: string;
  termLabel: string;
  question: string;
  response: string;
  reportedAt: string;
  status: 'user_reported';
};

export function createPolicyClarification(input: {
  id: string;
  sourceId: string;
  sourceClaimId: string;
  question: string;
  response: string;
  reportedAt: string;
  facts: readonly PolicyFact[];
  assets: readonly PolicyAsset[];
}): PolicyClarification;

export function updatePolicyClarification(input: {
  clarification: PolicyClarification;
  response: string;
  facts: readonly PolicyFact[];
  assets: readonly PolicyAsset[];
}): PolicyClarification;

export function removePolicyClarification(clarifications: readonly PolicyClarification[], id: string): PolicyClarification[];
export function removePolicyClarificationFromList(clarifications: readonly PolicyClarification[], id: string): PolicyClarification[];

export function isPolicyClarificationSourceCurrent(input: {
  clarification: PolicyClarification;
  facts: readonly PolicyFact[];
  assets: readonly PolicyAsset[];
}): boolean;
