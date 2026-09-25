export const MAX_SELF_REPORT_CHARACTERS = 2_000;
export const MAX_SELF_REPORT_BYTES = 8_000;
const allowedKinds = new Set(['measurement', 'reported_condition', 'symptom', 'medication', 'allergy', 'care_event', 'other']);
const allowedUnknownReasons = new Set(['unclear', 'missing_detail', 'not_a_health_fact']);
const allowedRequestKeys = new Set(['consentForThisNote', 'syntheticDemoConfirmed', 'noteId', 'text', 'topic']);

function cleanText(value, limit) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, limit)
    : '';
}

function validateTopic(topic) {
  if (topic === null || topic === undefined) return null;
  if (!topic || typeof topic !== 'object' || Array.isArray(topic)) throw new Error('The selected health area could not be validated.');
  const id = typeof topic.id === 'string' ? topic.id.trim() : '';
  const rawLabel = typeof topic.label === 'string' ? topic.label.trim() : '';
  if (/[\u0000-\u001f\u007f]/.test(rawLabel)) throw new Error('The selected health area could not be validated.');
  const label = rawLabel.replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(id) || !/^[\p{L}\p{N}][\p{L}\p{N} &'()+/-]{0,59}$/u.test(label)) {
    throw new Error('The selected health area could not be validated.');
  }
  return { id, label };
}

/** Validates the one-note, fictional-demo consent before any model adapter is called. */
export function validateSelfReportRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('The description could not be validated.');
  if (Object.keys(body).some((key) => !allowedRequestKeys.has(key))) throw new Error('The description request included unsupported details.');
  if (body.consentForThisNote !== true) throw new Error('Approve this one description before Nura organizes it on the local demo service.');
  if (body.syntheticDemoConfirmed !== true) throw new Error('Use fictional sample information only in this preview.');
  const noteId = typeof body.noteId === 'string' ? body.noteId.trim() : '';
  if (!/^[A-Za-z0-9:_-]{1,96}$/.test(noteId)) throw new Error('The description could not be matched to this review.');
  if (typeof body.text !== 'string') throw new Error('Add a short description before asking Nura to organize it.');
  const text = cleanText(body.text, MAX_SELF_REPORT_CHARACTERS + 1);
  const characterCount = Array.from(text).length;
  const byteCount = new TextEncoder().encode(text).byteLength;
  if (!text || characterCount > MAX_SELF_REPORT_CHARACTERS || byteCount > MAX_SELF_REPORT_BYTES) {
    throw new Error('Keep your description under 2,000 characters.');
  }
  return { noteId, text, topic: validateTopic(body.topic) };
}

function evidenceQuote(text, candidate) {
  const quote = cleanText(candidate?.quote, 240);
  const label = cleanText(candidate?.label, 120);
  const value = cleanText(candidate?.value, 600);
  if (!quote || !label || !value || !text.includes(quote) || !quote.includes(label) || !quote.includes(value)) return null;
  return { quote, label, value };
}

/** Keeps only typed details that can be checked against a short, exact passage from the user's note. */
export function sanitizeSelfReportInterpretation(text, result) {
  const claims = [];
  const seen = new Set();
  for (const candidate of Array.isArray(result?.claims) ? result.claims.slice(0, 20) : []) {
    const kind = typeof candidate?.kind === 'string' ? candidate.kind : '';
    if (!allowedKinds.has(kind)) continue;
    const evidence = evidenceQuote(text, candidate);
    if (!evidence) continue;
    const unit = cleanText(candidate?.unit, 48);
    if (unit && !evidence.quote.includes(unit)) continue;
    const rawDate = cleanText(candidate?.effectiveAt, 32);
    const effectiveAt = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && evidence.quote.includes(rawDate) && !Number.isNaN(Date.parse(rawDate)) ? rawDate : null;
    const key = `${kind}\u0000${evidence.label}\u0000${evidence.value}\u0000${evidence.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const confidence = typeof candidate?.confidence === 'number' && Number.isFinite(candidate.confidence)
      ? Math.max(0, Math.min(1, candidate.confidence))
      : null;
    claims.push({ kind, label: evidence.label, value: evidence.value, unit: unit || null, effectiveAt, confidence, quote: evidence.quote });
  }

  const unknowns = [];
  const unknownKeys = new Set();
  for (const item of Array.isArray(result?.unknowns) ? result.unknowns.slice(0, 12) : []) {
    const quote = cleanText(item?.quote, 240);
    const reason = typeof item?.reason === 'string' && allowedUnknownReasons.has(item.reason) ? item.reason : 'unclear';
    if (!quote || !text.includes(quote) || unknownKeys.has(quote)) continue;
    unknownKeys.add(quote);
    unknowns.push({ quote, reason });
  }
  return { claims, unknowns };
}

/** Dependency injection keeps consent and evidence contracts testable without network/provider calls. */
export async function interpretSelfReportRequest(body, { interpret, signal } = {}) {
  const request = validateSelfReportRequest(body);
  if (typeof interpret !== 'function') throw new Error('The description service is unavailable.');
  const result = await interpret({ text: request.text, topic: request.topic, signal });
  return { ...request, ...sanitizeSelfReportInterpretation(request.text, result) };
}
