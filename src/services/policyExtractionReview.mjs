const POLICY_REVIEW_SECTIONS = Object.freeze([
  { id: 'identity', title: 'Policy identity & document version', match: /\b(?:insurer|insurance company|plan name|policy name|product name|policy type|certificate|schedule|endorsement|version|edition|jurisdiction|governing law)\b/i },
  { id: 'dates', title: 'Effective dates, renewal & status', match: /\b(?:effective|commencement|inception|renewal|expiry|expires|expiration|policy term|issued|in force|lapsed|grace period|cancellation|non.?renewal)\b/i },
  { id: 'eligibility', title: 'Who can be covered & eligibility', match: /\b(?:eligib|qualif|waiting period|enrol|dependent|age limit|residen|employee|covered person|pre.?existing|continuation|portability)\b/i },
  { id: 'benefits', title: 'Benefits & covered services', match: /\b(?:benefit|benefits|cover(?:age|ed)?|covered service|inpatient|outpatient|hospital|maternity|dental|vision|critical illness|medical treatment|emergency care|prescription|mental health|rehabilitation)\b/i },
  { id: 'limits', title: 'Limits, sub-limits & out-of-pocket maximums', match: /\b(?:limit|sub.?limit|maximum|max\.?|cap|annual|lifetime|room\s*(?:&|and)\s*board|sum assured|visit limit|out.?of.?pocket maximum)\b/i },
  { id: 'member_costs', title: 'Deductibles, copays & coinsurance', match: /\b(?:deductible|copay|co.?pay|coinsurance|co.?insurance|excess|reimburse|cost share|member contribution)\b/i },
  { id: 'premiums', title: 'Premiums & payment terms', match: /\b(?:premium|payment frequency|paid to date|payment term|projected premium|remaining premium|grace period)\b/i },
  { id: 'exclusions', title: 'Exclusions, conditions & exceptions', match: /\b(?:exclusion|excluded|not covered|pre.?existing|condition|exception|subject to|waiting period|limitation)\b/i },
  { id: 'network', title: 'Provider network & geographic scope', match: /\b(?:network|in.?network|out.?of.?network|provider panel|territor|geographic|worldwide|overseas|emergency abroad|area of cover)\b/i },
  { id: 'claims', title: 'Pre-approval, claims & appeals', match: /\b(?:claim|claims|appeal|pre.?authori[sz]|prior approval|notification|submit|filing deadline|claim deadline|supporting document|complaint|review process)\b/i },
  { id: 'coordination', title: 'Coordination with other coverage', match: /\b(?:coordination of benefits|other insurance|primary payer|secondary payer|duplicate cover|portability|continuation of cover)\b/i },
]);

function evidenceFor(claim) {
  const label = typeof claim?.label === 'string' ? claim.label.trim() : '';
  const value = typeof claim?.value === 'string' ? claim.value.trim() : '';
  const quote = typeof claim?.sourceLocation?.quote === 'string' ? claim.sourceLocation.quote.trim() : '';
  if (!label && !value) return null;
  const confidence = Number(claim?.confidence);
  const page = Number.isInteger(claim?.sourceLocation?.page) ? claim.sourceLocation.page : null;
  return {
    claimId: typeof claim?.id === 'string' ? claim.id : null,
    label: label || 'Policy wording',
    value,
    quote,
    page,
    needsReview: !quote || !Number.isFinite(confidence) || confidence < 0.72
      || /\b(?:unclear|ambiguous|subject to confirmation|not specified|not stated|depends on)\b/i.test(`${label} ${value}`),
  };
}

/**
 * Organize the already extracted, quoted policy terms into a consistent review.
 * “Not identified” describes this extraction only; it never means the policy
 * excludes a benefit or that a detail is absent from the full policy.
 * @param {{ claims?: Array<{ id?: string; kind?: string; label?: string; value?: string; confidence?: number | null; sourceLocation?: { quote?: string | null; page?: number | null } }>; documentContext?: { documentType?: string | null; entities?: Array<{ kind?: string; value?: string }> } | null }} input
 */
export function buildPolicyExtractionReview(input = {}) {
  const claims = input.claims;
  const documentContext = input.documentContext;
  const policyClaims = (Array.isArray(claims) ? claims : [])
    .filter((claim) => claim?.kind === 'coverage_term')
    .flatMap((claim) => {
      const item = evidenceFor(claim);
      return item ? [item] : [];
    });
  const sections = POLICY_REVIEW_SECTIONS.map((section) => {
    const evidence = policyClaims.filter((item) => section.match.test(`${item.label} ${item.value}`));
    const duplicateValues = new Map();
    for (const item of evidence) {
      const key = item.label.normalize('NFKC').toLowerCase();
      const values = duplicateValues.get(key) ?? new Set();
      values.add(item.value);
      duplicateValues.set(key, values);
    }
    const conflicting = [...duplicateValues.values()].some((values) => values.size > 1);
    const status = evidence.length === 0
      ? 'not_identified'
      : evidence.some((item) => item.needsReview) || conflicting
        ? 'needs_review'
        : 'identified';
    return { id: section.id, title: section.title, status, evidence };
  });
  const context = documentContext && typeof documentContext === 'object' ? documentContext : {};
  const insurer = Array.isArray(context.entities)
    ? context.entities.find((entity) => entity?.kind === 'insurer' && typeof entity.value === 'string' && entity.value.trim())?.value.trim() ?? null
    : null;
  const documentType = typeof context.documentType === 'string' && context.documentType.trim() ? context.documentType.trim() : null;
  const identifiedCount = sections.filter((section) => section.status === 'identified').length;
  const reviewCount = sections.filter((section) => section.status === 'needs_review').length;
  const notIdentifiedCount = sections.filter((section) => section.status === 'not_identified').length;
  return {
    insurer,
    documentType,
    sections,
    counts: { identified: identifiedCount, needsReview: reviewCount, notIdentified: notIdentifiedCount, total: sections.length },
    note: 'This checklist covers common health-policy terms; which items apply depends on the plan and jurisdiction, and it is not a completeness guarantee. “Not identified” means this extraction did not find evidence, not that the policy excludes or lacks the benefit. Check the full policy, schedules, endorsements, definitions, and current insurer confirmation.',
  };
}
