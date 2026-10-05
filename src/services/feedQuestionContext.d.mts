export type FeedQuestionContext = { title: string; questions: string[] };

export declare function sanitizeFeedQuestionCue(value: unknown, knownIdentifiers?: readonly (string | undefined)[]): string;

export declare function selectRecentFeedQuestionContext(
  conversations?: readonly unknown[],
  messages?: readonly unknown[],
  knownIdentifiers?: readonly (string | undefined)[],
  maxQuestions?: number,
): FeedQuestionContext;
