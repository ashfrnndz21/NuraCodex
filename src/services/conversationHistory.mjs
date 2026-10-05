const DEFAULT_TITLE = 'New conversation';
const DEFAULT_TITLE_WORDS = 6;
const DEFAULT_TITLE_CHARS = 48;
const DEFAULT_RECENT_TURNS = 6;
const DEFAULT_CONTEXT_CHARS = 6000;

const QUESTION_LEAD_INS = [
  /^(?:please\s+)?(?:can|could|would)\s+you\s+(?:please\s+)?/i,
  /^(?:please\s+)?(?:help\s+me\s+understand|tell\s+me|explain)\s+/i,
  /^(?:please\s+)?(?:what\s+should\s+i\s+know\s+about|what\s+do(?:es)?|what\s+is|what\s+are|is\s+my|are\s+my|should\s+i\s+be\s+concerned\s+about|should\s+i|how\s+is|how\s+can\s+i)\s+/i,
];

function normalizeLimit(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), maximum) : fallback;
}

function cleanQuestion(question) {
  if (typeof question !== 'string') return '';

  let text = question
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\b(?:email|phone|call|text)\s+me\s+at\b/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, ' ')
    .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, ' ')
    .replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:%|\bmmol\s*\/\s*mol|\bmmol\s*\/\s*l|\bmg\s*\/\s*dl|\bg\s*\/\s*l|\bkg\b|\bcm\b|\bmmhg\b|\byears?\s*old|\byrs?\s*old)/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(/(?:%|\bmmol\s*\/\s*mol|\bmmol\s*\/\s*l|\bmg\s*\/\s*dl|\bg\s*\/\s*l|\bmmhg\b|\bkg\b|\bcm\b)/gi, ' ')
    .replace(/[>*_`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?.!,;:]+$/g, '')
    .trim();

  for (const pattern of QUESTION_LEAD_INS) {
    text = text.replace(pattern, '').trim();
  }

  return text
    .replace(/\b(?:my|mine|i|me|you|your|please)\b/gi, ' ')
    .replace(/\b(?:from|at|is|mean)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    .trim();
}

/**
 * Create a short title locally from the user's opening question. This extracts
 * wording only: it adds no health facts, identities, or inferred profile data.
 * Numeric values, dates, contact details, and URLs are omitted from the title.
 */
export function createConversationTitle(firstQuestion, options = {}) {
  const normalizedQuestion = typeof firstQuestion === 'string'
    ? firstQuestion.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
    : '';
  if (/^(?:(?:please )?what do you know (?:of|about) me|what do you know about my health|tell me what you know about me)$/.test(normalizedQuestion)) {
    return 'Your health profile';
  }
  const maxWords = normalizeLimit(options.maxWords, DEFAULT_TITLE_WORDS, 12);
  const maxChars = normalizeLimit(options.maxChars, DEFAULT_TITLE_CHARS, 100);
  let text = cleanQuestion(firstQuestion);
  if (!text) return DEFAULT_TITLE;

  const words = text.split(/\s+/).slice(0, maxWords);
  text = words.join(' ');
  if (text.length > maxChars) {
    text = text.slice(0, maxChars + 1);
    const lastSpace = text.lastIndexOf(' ');
    text = text.slice(0, lastSpace > 0 ? lastSpace : maxChars);
  }
  text = text.trim().replace(/[.,;:!?]+$/g, '');
  if (!text) return DEFAULT_TITLE;
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function timestampValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
  if (typeof value !== 'string' || !value.trim()) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function latestActivity(conversation) {
  return Math.max(
    timestampValue(conversation?.lastActivityAt),
    timestampValue(conversation?.updatedAt),
    timestampValue(conversation?.lastMessageAt),
    timestampValue(conversation?.createdAt),
  );
}

/** Return conversations newest first without modifying the caller's array. */
export function sortConversationsByLatestActivity(conversations) {
  if (!Array.isArray(conversations)) return [];
  return conversations
    .map((conversation, index) => ({ conversation, index, activity: latestActivity(conversation) }))
    .sort((left, right) => right.activity - left.activity || left.index - right.index)
    .map(({ conversation }) => conversation);
}

function normalizeMessages(messages, conversationId) {
  if (!Array.isArray(messages) || typeof conversationId !== 'string' || !conversationId) return [];
  return messages.filter((message) => (
    message
    && message.conversationId === conversationId
    && (message.role === 'user' || message.role === 'assistant')
    && typeof message.text === 'string'
    && message.text.length > 0
  ));
}

function lastUserTurnStart(messages, maxTurns) {
  const userIndexes = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') userIndexes.push(index);
    if (userIndexes.length === maxTurns) return userIndexes[userIndexes.length - 1];
  }
  return userIndexes.length ? userIndexes[userIndexes.length - 1] : 0;
}

function fitCharacterLimit(messages, maxChars) {
  const selected = [...messages];
  let total = selected.reduce((sum, message) => sum + message.text.length, 0);
  while (selected.length > 1 && total > maxChars) {
    total -= selected.shift().text.length;
  }
  if (selected.length === 1 && total > maxChars) {
    const marker = '… [message shortened]';
    const available = Math.max(0, maxChars - marker.length);
    const text = Array.from(selected[0].text).slice(0, available).join('').trimEnd();
    selected[0] = { ...selected[0], text: `${text}${marker}`.slice(0, maxChars) };
  }
  return selected;
}

/**
 * Select only the requested conversation's most recent user turns and replies.
 * The returned text is conversation continuity context, never health evidence.
 */
export function selectRecentConversationMessages(messages, conversationId, options = {}) {
  const maxTurns = normalizeLimit(options.maxTurns, DEFAULT_RECENT_TURNS, 20);
  const maxChars = normalizeLimit(options.maxChars, DEFAULT_CONTEXT_CHARS, 20000);
  const scopedMessages = normalizeMessages(messages, conversationId);
  if (!scopedMessages.length) return [];
  const recent = scopedMessages.slice(lastUserTurnStart(scopedMessages, maxTurns));
  return fitCharacterLimit(recent, maxChars);
}

/**
 * Resolve an explicitly selected source conversation for continuity. It never
 * follows other links or incorporates messages from unrelated conversations.
 */
export function selectLinkedConversationContext({
  conversations,
  messages,
  currentConversationId,
  linkedConversationId,
  maxTurns,
  maxChars,
} = {}) {
  if (typeof linkedConversationId !== 'string' || !linkedConversationId) return null;
  if (linkedConversationId === currentConversationId || !Array.isArray(conversations)) return null;
  const source = conversations.find((conversation) => conversation?.id === linkedConversationId);
  if (!source) return null;
  const selectedMessages = selectRecentConversationMessages(messages, linkedConversationId, { maxTurns, maxChars });
  if (!selectedMessages.length) return null;

  return {
    kind: 'conversation-continuity',
    sourceConversationId: linkedConversationId,
    sourceTitle: typeof source.title === 'string' ? source.title : DEFAULT_TITLE,
    messages: selectedMessages,
    isHealthEvidence: false,
  };
}
