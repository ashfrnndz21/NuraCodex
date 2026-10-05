export type HealthMarkerOption = { label: string; unit: string };
export type HealthMarkerRangeGuide = {
  status: string;
  statusColor: string;
  unit: 'mg/dL' | 'mmol/L' | '%' | 'mmol/mol' | 'mmHg';
  positionPercent: number;
  segments: Array<{ widthPercent: number; color: string }>;
  ticks: Array<{ at: number; label: string; align?: 'start' | 'end' | 'before' | 'after'; convert?: number; row?: 0 | 1; positionPercent: number }>;
  caption: string;
};
export type HealthMarkerFact = {
  id: string;
  label: string;
  value: string;
  date: string;
  category: string;
  source: string;
  status: 'confirmed' | 'reviewed';
  reviewState?: 'user_confirmed' | 'user_retracted';
  validUntil?: string | null;
};

export function getHealthMarkersForTopic(topicLabel: string): HealthMarkerOption[];
export function canonicalHealthMarker(label: string): string | null;
export function getHealthMarkerUnitOptions(label: string): string[];
export function healthMarkerUnitNeedsReview(label: string, unit: string): boolean;
export function healthMarkerValueNeedsReview(label: string, value: string): boolean;
export function convertHba1cIfccToNgspPercent(value: number | string): number | null;
export function selectLatestMarkerSnapshots<T extends HealthMarkerFact>(facts: T[]): T[];
export function selectHomeMarkerSnapshots<T extends HealthMarkerFact>(facts: T[]): T[];
export function getHealthMarkerRangeGuide(input: {
  label: string;
  value: string;
  birthday: string;
  eventDate: string;
}): HealthMarkerRangeGuide | null;
export function findHealthMarkerDiscrepancy(input: {
  label: string;
  value: string;
  unit: string;
  eventDate: string;
  facts?: HealthMarkerFact[];
}): {
  fact: HealthMarkerFact;
  enteredValue: string;
  enteredUnit: string;
  date: string;
} | null;
