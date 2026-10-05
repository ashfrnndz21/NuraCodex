export type RegistryHistoryItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  date: string;
};

export type RegistryMarkerHistoryGroup<T extends RegistryHistoryItem = RegistryHistoryItem> = {
  id: string;
  marker: string | null;
  title: string;
  records: T[];
  sameDayStatus: 'none' | 'equivalent' | 'needs_confirmation' | 'possible_difference';
};

export function groupRegistryMarkerHistory<T extends RegistryHistoryItem>(items?: T[]): RegistryMarkerHistoryGroup<T>[];
