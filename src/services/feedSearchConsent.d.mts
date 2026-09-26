export type FeedSearchConsentTopic = { id: string; label: string };

export declare function createHealthFeedSearchPayload(
  topics: readonly FeedSearchConsentTopic[],
  consentConfirmed: boolean,
): { consentConfirmed: true; topics: FeedSearchConsentTopic[] };
