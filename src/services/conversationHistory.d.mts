export type ConversationHistoryMessage = {
  conversationId?: string;
  role: 'user' | 'assistant' | string;
  text: string;
  [key: string]: unknown;
};

export type ConversationHistoryRecord = {
  id: string;
  title?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  lastActivityAt?: string | number;
  lastMessageAt?: string | number;
  [key: string]: unknown;
};

export function createConversationTitle(
  firstQuestion: unknown,
  options?: { maxWords?: number; maxChars?: number },
): string;

export function sortConversationsByLatestActivity<T extends ConversationHistoryRecord>(
  conversations: readonly T[],
): T[];

export function selectRecentConversationMessages<T extends ConversationHistoryMessage>(
  messages: readonly T[],
  conversationId: string,
  options?: { maxTurns?: number; maxChars?: number },
): T[];

export function selectLinkedConversationContext<T extends ConversationHistoryRecord, M extends ConversationHistoryMessage>(
  selection: {
    conversations: readonly T[];
    messages: readonly M[];
    currentConversationId: string;
    linkedConversationId: string;
    maxTurns?: number;
    maxChars?: number;
  },
): {
  kind: 'conversation-continuity';
  sourceConversationId: string;
  sourceTitle: string;
  messages: M[];
  isHealthEvidence: false;
} | null;
