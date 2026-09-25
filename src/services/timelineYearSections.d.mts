export type TimelineDatedEntry = { eventDateKey?: string | null };
export type TimelineYearSection<T extends TimelineDatedEntry> = {
  key: string;
  year: string | null;
  entries: T[];
};

export declare function groupTimelineByYear<T extends TimelineDatedEntry>(entries: readonly T[]): TimelineYearSection<T>[];
