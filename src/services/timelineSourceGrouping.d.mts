export type TimelineSourceAsset = { id: string; serverSourceId?: string };
export type TimelineSourceEntry = {
  id: string;
  nodeId?: string;
  kind: 'fact' | 'asset' | string;
  sourceId?: string;
  eventDateKey?: string | null;
  category?: string;
  [key: string]: unknown;
};
export type GroupedSourceFactEvent<T extends TimelineSourceEntry> = T & { members?: T[] };

export declare function resolveTimelineSourceAsset<T extends TimelineSourceAsset>(sourceId: string | undefined, assets: readonly T[]): T | null;
export declare function omitAssetsRepresentedByDetails<T extends TimelineSourceEntry>(entries: readonly T[], assets?: readonly TimelineSourceAsset[]): T[];
export declare function groupSourceFactEvents<T extends TimelineSourceEntry>(entries: readonly T[], assets?: readonly TimelineSourceAsset[]): GroupedSourceFactEvent<T>[];
