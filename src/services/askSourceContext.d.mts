export type AskSourceContextFact = {
  id: string;
  label: string;
  value: string;
  date: string;
  category: string;
  source: string;
  status: string;
  sourceId?: string;
  sourceClaimId?: string;
  reviewState?: string;
  validUntil?: string | null;
};

export type AskSourceContextTreatment = {
  id: string;
  name: string;
  dose: string;
  schedule: string;
  purpose: string;
  prescriber: string;
  careLocation: string;
  pharmacy: string;
  status: 'current';
  startedOn: string;
  endedOn: string;
  source: string;
};

export function selectAskSourceContext(
  item: { title?: string; detail?: string; topic?: string; url?: string },
  profile: {
    facts: Array<AskSourceContextFact & { validUntil?: string | null }>;
    topics: Array<{ id: string; label: string }>;
    treatments: Array<AskSourceContextTreatment | (Omit<AskSourceContextTreatment, 'status'> & { status: 'current' | 'past' })>;
  },
  excludedIdentifiers?: string[],
): {
  facts: AskSourceContextFact[];
  topics: Array<{ id: string; label: string }>;
  treatments: AskSourceContextTreatment[];
  links: [];
  visits: [];
};
