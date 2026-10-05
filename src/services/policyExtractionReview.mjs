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
    needsReviewReason: null,
    needsReview: !quote || !Number.isFinite(confidence) || confidence < 0.72
      || /\b(?:unclear|ambiguous|subject to confirmation|not specified|not stated|depends on)\b/i.test(`${label} ${value}`),
  };
}

function findAlternativePlanChoices(items) {
  const groups = new Map();
  for (const item of items) {
    const text = `${item.label} ${item.value}`;
    const match = text.match(/\bplan\s+([a-z0-9]+)\b/i);
    if (!match) continue;
    const plan = match[1].toUpperCase();
    const baseLabel = item.label
      .replace(/[|,;:–—-]?\s*plan\s+[a-z0-9]+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!baseLabel) continue;
    const key = baseLabel.normalize('NFKC').toLowerCase();
    const group = groups.get(key) ?? { benefit: baseLabel, options: new Map() };
    const option = group.options.get(plan) ?? { plan, claimIds: [], values: [] };
    if (item.claimId && !option.claimIds.includes(item.claimId)) option.claimIds.push(item.claimId);
    if (item.value && !option.values.includes(item.value)) option.values.push(item.value);
    group.options.set(plan, option);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.options.size > 1)
    .map((group) => ({ benefit: group.benefit, options: [...group.options.values()] }));
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
  const planChoices = findAlternativePlanChoices(policyClaims);
  const alternativeClaimIds = new Set(planChoices.flatMap((group) => group.options.flatMap((option) => option.claimIds)));
  for (const item of policyClaims) {
    if (item.claimId && alternativeClaimIds.has(item.claimId)) {
      item.needsReview = true;
      item.needsReviewReason = 'This source lists multiple plan options. Confirm which option appears on your policy schedule.';
    }
  }
  const context = documentContext && typeof documentContext === 'object' ? documentContext : {};
  const contextEvidence = (entries, prefix) => (Array.isArray(entries) ? entries : []).flatMap((entry) => {
    const value = typeof entry?.value === 'string' ? entry.value.trim() : '';
    if (!value) return [];
    return [{
      claimId: null,
      label: `${prefix}: ${String(entry.kind ?? 'source detail').replaceAll('_', ' ')}`,
      kind: typeof entry.kind === 'string' ? entry.kind : '',
      value,
      quote: typeof entry.quote === 'string' ? entry.quote.trim() : '',
      page: Number.isInteger(entry.page) ? entry.page : null,
      needsReviewReason: null,
      needsReview: !(typeof entry.quote === 'string' && entry.quote.trim()),
    }];
  });
  const policyIdentityEvidence = contextEvidence(context.entities, 'Policy detail').filter((item) => ['insurer', 'plan_name', 'policy_type', 'document_version', 'jurisdiction'].includes(item.kind));
  const policyDateEvidence = contextEvidence(context.dates, 'Policy date').filter((item) => ['issued_at', 'effective_period', 'policy_effective_date', 'renewal_date', 'expiry_date'].includes(item.kind));
  const sections = POLICY_REVIEW_SECTIONS.map((section) => {
    const contextItems = section.id === 'identity' ? policyIdentityEvidence : section.id === 'dates' ? policyDateEvidence : [];
    // Match extracted benefit labels, not arbitrary wording in the value or
    // source quote. A benefit sentence mentioning “the schedule” is not a
    // policy-identity finding.
    const evidence = [...policyClaims.filter((item) => section.match.test(item.label)), ...contextItems];
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
    planChoices,
    sections,
    counts: { identified: identifiedCount, needsReview: reviewCount, notIdentified: notIdentifiedCount, total: sections.length },
    note: 'This checklist covers common health-policy terms; which items apply depends on the plan and jurisdiction, and it is not a completeness guarantee. “Not identified” means this extraction did not find evidence, not that the policy excludes or lacks the benefit. Check the full policy, schedules, endorsements, definitions, and current insurer confirmation.',
  };
}
