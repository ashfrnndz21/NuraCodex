const statements = [
  { label: 'Self-reported condition', pattern: /^I\s+(?:was|have been)\s+diagnosed with\s+([^.!?;,\n]{2,100})/i },
  { label: 'Self-reported condition', pattern: /^I(?:\s+am|['’]m)\s+living with\s+([^.!?;,\n]{2,100})/i },
  { label: 'Self-reported allergy', pattern: /^I(?:\s+am|['’]m)\s+allergic to\s+([^.!?;,\n]{2,100})/i },
  { label: 'Self-reported medicine', pattern: /^I\s+(?:take|use|am prescribed|am taking|am on)\s+([^.!?;,\n]{2,100})|^I['’]m\s+(?:prescribed|taking|on)\s+([^.!?;,\n]{2,100})/i },
];

/** Detect only clear, first-person declarations. Questions, negations, and symptoms are intentionally excluded. */
export function detectUserHealthSignal(question) {
  if (typeof question !== 'string') return null;
  const text = question.trim();
  if (!text || text.length > 2000) return null;

  for (const { label, pattern } of statements) {
    const match = text.match(pattern);
    const value = (match?.[1] ?? match?.[2])?.trim().replace(/\s+/g, ' ');
    if (!value || value.length < 2) continue;
    const statement = text.slice(0, match[0].length).trim().replace(/[.!?,;:]+$/, '');
    return {
      label,
      value,
      statement,
      reason: `You mentioned “${statement}” in your question. Review it before saving; this is your self-reported context, not a verified medical conclusion.`,
    };
  }
  return null;
}
