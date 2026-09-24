export type InsuranceFactForHistory = {
  id: string;
  sourceId?: string;
  source: string;
  category: string;
  date: string;
  validFrom?: string;
  validUntil?: string | null;
  reviewState?: 'user_confirmed' | 'user_retracted';
};

export type InsurancePolicyTerms<T extends InsuranceFactForHistory> = {
  sourceId: string;
  sourceName: string;
  currentTerms: T[];
  previousTerms: T[];
  removedTerms: T[];
};

export declare function groupInsurancePolicyTerms<T extends InsuranceFactForHistory>(facts: readonly T[]): InsurancePolicyTerms<T>[];
