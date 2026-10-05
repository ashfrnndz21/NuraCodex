export type ProfileRouteEvidence = {
  name?: string;
  country?: string;
  birthday?: string;
  setupProgress?: { started?: boolean; complete?: boolean };
  topics?: unknown[];
  facts?: unknown[];
  assets?: unknown[];
  treatments?: unknown[];
  visits?: unknown[];
  links?: unknown[];
  savedQuestions?: unknown[];
  agentMessages?: unknown[];
  registryBriefs?: unknown[];
  feedItems?: unknown[];
};

export function shouldRedirectToProfileSetup(pathname: string, profile?: ProfileRouteEvidence): boolean;
