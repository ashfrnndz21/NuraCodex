export type TimelineEndpointEntry = {
  id: string;
  nodeId: string;
  kind: string;
};

export type TimelineEndpointEvent<T extends TimelineEndpointEntry = TimelineEndpointEntry> = T & {
  members?: T[];
};

export type TimelineEndpointTopic = { id: string };

export type TimelineEndpointNavigation = {
  filter: 'Everything' | 'Documents';
  expandedId: string | null;
  selectedNodeId: string;
  targetKind: 'entry' | 'topic';
  targetRenderId: string;
};

export declare function resolveTimelineEndpointNavigation<
  T extends TimelineEndpointEntry,
>(
  targetId: string,
  entries: readonly T[],
  timelineEvents: readonly TimelineEndpointEvent<T>[],
  topics: readonly TimelineEndpointTopic[],
): TimelineEndpointNavigation | null;
