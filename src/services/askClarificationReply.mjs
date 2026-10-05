const AGE_CLARIFICATION = /\b(?:how old are you|what(?:'s| is) your age|could you (?:tell|share) your age|do you know your age)\b/i;
const BLOOD_PRESSURE_CLARIFICATION = /\b(?:blood pressure|\bbp\b)\b/i;
const AGE_REPLY = /^\s*(?:(?:i(?:'m| am)|my age is|age is)\s*)?\d{1,3}(?:\s*(?:years?|yrs?|yo|y\/o)(?:\s*old)?)?[.!]?\s*$/i;
const BLOOD_PRESSURE_REPLY = /\b\d{2,3}\s*(?:\/|over)\s*\d{2,3}\b/i;
const UNKNOWN_REPLY = /^\s*(?:i\s+)?(?:don['’]?t know|do not know|not sure|haven['’]?t checked|have not checked|can['’]?t remember|cannot remember|no recent reading|prefer not to say|unknown)\s*[.!]?\s*$/i;

function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function clarificationQuestionSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(normalizeText)
    .filter((sentence) => sentence.includes('?') && (AGE_CLARIFICATION.test(sentence) || BLOOD_PRESSURE_CLARIFICATION.test(sentence)));
}

/**
 * Carry only a direct reply to Nura's latest age/blood-pressure clarification
 * into the next Ask request. The reply remains transient and self-reported.
 */
export function createAskClarificationReply(question, messages, { includeReply = false } = {}) {
  const reply = normalizeText(question);
  if (!reply || !Array.isArray(messages) || messages.length === 0) return null;

  let latest = messages[messages.length - 1];
  if (latest?.role === 'user' && normalizeText(latest.text) === reply) latest = messages[messages.length - 2];
  if (latest?.role !== 'assistant') return null;

  const clarificationQuestions = clarificationQuestionSentences(normalizeText(latest.text));
  if (clarificationQuestions.length === 0) return null;

  const clarification = clarificationQuestions.join(' ');
  const askedAge = clarificationQuestions.some((sentence) => AGE_CLARIFICATION.test(sentence));
  const askedBloodPressure = clarificationQuestions.some((sentence) => BLOOD_PRESSURE_CLARIFICATION.test(sentence));
  const isDirectValueReply = (askedAge && AGE_REPLY.test(reply)) || (askedBloodPressure && BLOOD_PRESSURE_REPLY.test(reply));
  if (!isDirectValueReply && !UNKNOWN_REPLY.test(reply)) return null;

  const requestedDetails = [askedAge ? 'age' : '', askedBloodPressure ? 'blood pressure' : ''].filter(Boolean).join(' and ');
  const requestText = includeReply ? [
    `The user is answering Nura's previous clarification about ${requestedDetails}.`,
    `Nura asked: “${clarification}”`,
    `The user replied: “${reply}”`,
    'Treat this reply as self-reported context for this answer only. It is not a verified or saved health record. Do not add it to the profile or propose saving it. Use only this explicit reply and other information separately approved for this run.',
  ].join('\n') : null;

  return { clarification, reply, requestedDetails, requestText, requiresExplicitConsent: true };
}
