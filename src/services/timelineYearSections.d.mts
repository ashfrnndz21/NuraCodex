export type TimelineDatedEntry = { eventDateKey?: string | null };
export type TimelineYearSection<T extends TimelineDatedEntry> = {
  key: string;
  year: string | null;
  entries: T[];
};
export type TimelineDateGroup<T extends TimelineDatedEntry> = {
  key: string;
  date: string | null;
  entries: T[];
  categories: { label: string; count: number }[];
};

export declare function groupTimelineByYear<T extends TimelineDatedEntry>(entries: readonly T[]): TimelineYearSection<T>[];
export declare function groupTimelineByDate<T extends TimelineDatedEntry & { kind?: string; category?: string; title?: string }>(entries: readonly T[]): TimelineDateGroup<T>[];
export declare function timelineGroupExpandedByDefault(sectionIndex: number, dateGroupIndex: number, eventCount: number): boolean;
