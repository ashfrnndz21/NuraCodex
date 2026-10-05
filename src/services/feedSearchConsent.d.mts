export type FeedSearchConsentTopic = { id: string; label: string };
export type FeedSearchOptions = { excludeUrls?: string[] };

export declare function createHealthFeedSearchPayload(
  topics: readonly FeedSearchConsentTopic[],
  consentConfirmed: boolean,
  options?: FeedSearchOptions,
): { consentConfirmed: true; topics: FeedSearchConsentTopic[]; excludeUrls?: string[] };
