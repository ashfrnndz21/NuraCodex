import { sortConversationsByLatestActivity } from './conversationHistory.mjs';

const LEAD_INS = /^(?:(?:please\s+)?(?:can|could|would)\s+you\s+|(?:please\s+)?(?:tell\s+me|explain|what\s+should\s+i\s+know\s+about|what\s+do\s+i\s+need\s+to\s+know\s+about|what\s+is|what\s+are|how\s+does|how\s+do|why\s+does|why\s+is|should\s+i\s+be\s+concerned\s+about)\s+)/i;

export function sanitizeFeedQuestionCue(value, knownIdentifiers = []) {
  let text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, ' ')
    .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, ' ')
    .replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:%|mmol\s*\/\s*mol|mmol\s*\/\s*l|mg\s*\/\s*dl|g\s*\/\s*l|kg|cm|mmhg|years?\s*old|yrs?\s*old)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(LEAD_INS, ' ')
    .replace(/\b(?:my|mine|i|me|you|your|mom|mother|dad|father|husband|wife|partner|child|son|daughter|please|is|are|was|were|the|and|or|at|from|about|email|phone|contact)\b/gi, ' ')
    .replace(/[>*_`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?.!,;:]+$/g, '')
    .trim();
  for (const identifier of knownIdentifiers) {
    const clean = String(identifier ?? '').trim();
    if (clean.length > 1) text = text.replace(new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  }
  return text.replace(/\s+/g, ' ').trim().replace(/^[\s.,;:!?-]+|[\s.,;:!?-]+$/g, '').slice(0, 140).toLowerCase();
}

/**
 * Select only safe, recent question cues from the most recently active Ask chat.
 * Chat replies and profile records are never included; cues are still opt-in at search time.
 */
export function selectRecentFeedQuestionContext(conversations = [], messages = [], knownIdentifiers = [], maxQuestions = 3) {
  const latest = sortConversationsByLatestActivity(conversations)[0];
  if (!latest?.id || !Array.isArray(messages)) return { title: '', questions: [] };
  const safeKnown = Array.isArray(knownIdentifiers) ? knownIdentifiers : [];
  const questions = messages
    .filter((message) => message?.conversationId === latest.id && message?.role === 'user' && typeof message?.text === 'string')
    .slice(-Math.max(1, Math.min(3, Number.isInteger(maxQuestions) ? maxQuestions : 3)))
    .map((message) => sanitizeFeedQuestionCue(message.text, safeKnown))
    .filter((question, index, all) => question.length > 2 && all.indexOf(question) === index);
  return { title: String(latest.title ?? '').slice(0, 48), questions };
}
