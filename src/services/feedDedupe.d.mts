export type FeedItemForGrouping = {
  id: string;
  title: string;
  detail: string;
  url: string;
  publisher: string;
  topic: string;
  retrievedAt: string;
  saved: boolean;
  dismissed: boolean;
};

export type GroupedHealthFeedItem<T extends FeedItemForGrouping> = T & {
  topicLabels: string[];
  duplicateIds: string[];
  activeIds: string[];
};

export type HealthFeedCategory<T extends FeedItemForGrouping> = {
  id: string;
  label: string;
  items: T[];
};

export declare function groupHealthFeedItems<T extends FeedItemForGrouping>(items: readonly T[]): GroupedHealthFeedItem<T>[];

export declare function groupHealthFeedCategories<T extends Pick<FeedItemForGrouping, 'id' | 'topic'>>(
  items: readonly T[],
  preferredTopics?: readonly (string | { label: string })[],
): HealthFeedCategory<T>[];

export declare function mergeHealthFeedItems<T extends FeedItemForGrouping>(
  current: readonly T[],
  incoming: readonly Omit<T, 'saved' | 'dismissed'>[],
): T[];
