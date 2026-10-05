export type AskClarificationReply = {
  clarification: string;
  reply: string;
  requestedDetails: string;
  requestText: string | null;
  requiresExplicitConsent: true;
};

export function createAskClarificationReply(
  question: string,
  messages: { role: 'user' | 'assistant'; text: string }[],
  options?: { includeReply?: boolean },
): AskClarificationReply | null;
