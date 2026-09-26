export type IntakeBatchFinding = {
  id: string;
  kind: 'same_date_match' | 'possible_repeat' | 'same_date_difference' | 'date_uncertain_difference';
  label: string;
  unit: string | null;
  values: string[];
  eventDates: string[];
  documentDates: { kind: 'collected_at' | 'report_date'; value: string; sourceId: string; sourceName: string }[];
  claimIds: string[];
  sources: { id: string; name: string }[];
};
export function analyzeIntakeBatch(sources: Array<{
  sourceId: string;
  sourceName?: string;
  documentDates?: { kind: string; value: string }[];
  claims: Array<{
    id: string;
    label: string;
    value: string;
    unit?: string | null;
    effectiveAt?: string | null;
    evidenceState?: string;
  }>;
}>): IntakeBatchFinding[];
