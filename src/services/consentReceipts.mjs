export const CONSENT_RECEIPT_LIMIT = 100;

export const CONSENT_PURPOSE_LABELS = Object.freeze({
  ask: 'Ask Nura',
  profile_summary: 'Profile summary',
  symptom_support: 'Symptom support',
  health_search: 'Health search',
  document_review: 'Document review',
});

export const CONSENT_SCOPE_LABELS = Object.freeze({
  user_question: 'Your question',
  ask_clarification_reply: 'Reply to Nura’s clarification',
  saved_details: 'Saved health details',
  health_areas: 'Health areas',
  record_links: 'Record connections',
  earlier_values: 'Earlier values',
  recent_messages: 'Recent Ask messages',
  treatments: 'Medicines and treatment',
  visits: 'Visits and care',
  linked_report_text: 'Text from linked reports',
  policy_terms: 'Policy terms',
  public_health_search: 'Public health search',
  derived_age: 'Age calculated for selected measurements',
  selected_public_source: 'Selected public source',
  symptom_description: 'Symptom details',
  selected_files: 'Selected files',
  ai_service_review: 'AI service review',
  on_device_sample: 'On-device sample review',
  self_report_note: 'Your written note',
});

const purposes = new Set(Object.keys(CONSENT_PURPOSE_LABELS));
const scopes = new Set(Object.keys(CONSENT_SCOPE_LABELS));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeConsentReceipt(input) {
  if (!isPlainObject(input) || typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.id)) return null;
  if (!purposes.has(input.purpose)) return null;
  if (typeof input.approvedAt !== 'string' || !Number.isFinite(Date.parse(input.approvedAt))) return null;
  const receiptScopes = Array.isArray(input.scopes)
    ? [...new Set(input.scopes.filter((scope) => typeof scope === 'string' && scopes.has(scope))) ]
    : [];
  if (!receiptScopes.length) return null;
  return {
    id: input.id,
    purpose: input.purpose,
    scopes: receiptScopes,
    approvedAt: new Date(input.approvedAt).toISOString(),
  };
}

export function normalizeConsentReceipts(receipts) {
  if (!Array.isArray(receipts)) return [];
  const normalized = receipts.map(normalizeConsentReceipt).filter(Boolean);
  const unique = new Map();
  for (const receipt of normalized) {
    const previous = unique.get(receipt.id);
    if (!previous || receipt.approvedAt >= previous.approvedAt) unique.set(receipt.id, receipt);
  }
  return [...unique.values()]
    .sort((left, right) => right.approvedAt.localeCompare(left.approvedAt))
    .slice(0, CONSENT_RECEIPT_LIMIT);
}

export function appendConsentReceipt(receipts, input) {
  const receipt = normalizeConsentReceipt(input);
  if (!receipt) throw new Error('A valid consent receipt is required before the request can continue.');
  return normalizeConsentReceipts([receipt, ...(Array.isArray(receipts) ? receipts : [])]);
}
