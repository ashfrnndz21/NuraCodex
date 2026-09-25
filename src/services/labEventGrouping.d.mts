export type LabEventGroupingEntry = {
  id: string;
  nodeId: string;
  kind: string;
  title: string;
  detail: string;
  date: string;
  timestamp: number;
  source: string;
  category: string;
  sourceId?: string;
  eventDateKey?: string | null;
};

export type GroupedLabEvent<T extends LabEventGroupingEntry> = T & {
  members?: T[];
};

export declare function groupLabEvents<T extends LabEventGroupingEntry>(entries: readonly T[]): GroupedLabEvent<T>[];
