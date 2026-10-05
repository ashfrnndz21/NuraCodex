type FeedItemForRelevance = {
  id: string;
  title: string;
  detail?: string;
  topic: string;
  saved?: boolean;
};

type FeedRelevanceContext = {
  topics?: readonly (string | { label?: string })[];
  facts?: readonly unknown[];
  treatments?: readonly unknown[];
  links?: readonly unknown[];
  registryBriefs?: readonly unknown[];
  recentQuestionCues?: readonly string[];
};

export declare function rankHealthFeedItemsByLocalContext<T extends FeedItemForRelevance>(
  items: readonly T[],
  context?: FeedRelevanceContext,
  excludedIdentifiers?: readonly (string | undefined)[],
): T[];
