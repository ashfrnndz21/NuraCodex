const sections = [
  { id: 'policy', title: 'Policy details', match: /insurer|insurance company|policy name|plan name|policy number|policy no\b|commencement|effective date|inception|policy term|policy status/i, fields: [
    ['Insurance company', /insurer|insurance company/i], ['Policy name / plan', /policy name|plan name/i], ['Policy number', /policy number|policy no\b/i], ['Commencement date', /commencement|effective date|inception/i], ['Policy term', /policy term/i], ['Policy status', /policy status/i],
  ] },
  { id: 'life', title: 'Life cover', match: /sum assured|death benefit|accidental death|permanent disability|total permanent|critical illness|life cover|life coverage|rider/i, fields: [
    ['Sum assured / death benefit', /sum assured|death benefit/i], ['Accidental death cover', /accidental death/i], ['Permanent disability cover', /permanent disability|total permanent/i], ['Critical illness cover', /critical illness/i], ['Other riders / benefits', /rider|other life benefit/i],
  ] },
  { id: 'medical', title: 'Medical cover', match: /medical|hospital|room\s*(?:&|and)\s*board|deductible|co-?insurance|copay|co-pay|outpatient|inpatient|cancer|dialysis|pre[- ]?hospital|post[- ]?hospital|prescription|medicine|exclusion|limitation/i, fields: [
    ['Annual medical limit', /annual.{0,24}medical.{0,20}limit|medical.{0,20}annual.{0,20}limit/i], ['Lifetime medical limit', /lifetime.{0,24}medical.{0,20}limit|medical.{0,20}lifetime.{0,20}limit/i], ['Room & board limit', /room\s*(?:&|and)\s*board/i], ['Deductible / co-insurance', /deductible|co-?insurance/i], ['Outpatient benefits', /outpatient/i], ['Cancer / dialysis cover', /cancer|dialysis/i], ['Pre- / post-hospital care', /pre[- ]?hospital|post[- ]?hospital/i], ['Other medical benefits', /other medical|medical rider/i], ['Major exclusions / limitations', /exclusion|limitation/i],
  ] },
  { id: 'premium', title: 'Premium & payment', match: /premium|payment frequency|paid to date|payment term|projected premium|remaining premium/i, fields: [
    ['Original / current premium', /original premium|current premium|new premium/i], ['Payment frequency', /payment frequency|pay frequency/i], ['Premiums paid to date', /premium.{0,20}paid|paid to date/i], ['Premium payment term', /premium.{0,15}payment term|premium term/i], ['Remaining payment term', /remaining.{0,20}premium|remaining.{0,20}term/i], ['Projected premiums', /projected premium|total premium/i],
  ] },
  { id: 'value', title: 'Policy value', match: /cash value|guaranteed value|non.?guaranteed value|surrender value|maturity value/i, fields: [
    ['Current cash value', /current cash value|cash value/i], ['Guaranteed value', /guaranteed value/i], ['Non-guaranteed value', /non.?guaranteed value/i], ['Surrender value', /surrender value/i], ['Maturity value', /maturity value/i],
  ] },
  { id: 'other', title: 'Other terms', match: null, fields: [] },
];

const keyMedicalDetails = [
  { label: 'Annual medical limit', match: /\bannual.{0,24}\bmedical.{0,20}\blimit\b|\bmedical.{0,20}\bannual.{0,20}\blimit\b|\bannual\s+(?:overall\s+)?limit\b/i },
  { label: 'Lifetime medical limit', match: /\blifetime.{0,24}\bmedical.{0,20}\blimit\b|\bmedical.{0,20}\blifetime.{0,20}\blimit\b|\blifetime\s+(?:overall\s+)?limit\b/i },
  { label: 'Room & board limit', match: /room\s*(?:&|and)\s*board/i },
  { label: 'Deductible or co-insurance', match: /deductible|co-?insurance/i },
  { label: 'Outpatient benefits', match: /outpatient/i },
  { label: 'Cancer / dialysis benefits', match: /cancer|dialysis/i },
  { label: 'Pre- and post-hospital care', match: /pre[- ]?hospital|post[- ]?hospital/i },
];

const keyDetailFields = [
  { key: 'insurer', match: /insurance company|insurer/i },
  { key: 'policy-name', match: /policy name|plan name/i },
  { key: 'policy-number', match: /policy number|policy no\b/i },
  { key: 'commencement-date', match: /commencement date|effective date|inception date/i },
  { key: 'policy-term', match: /policy term/i },
  { key: 'policy-status', match: /policy status/i },
  { key: 'life-cover', match: /sum assured|death benefit|life cover/i },
  { key: 'accidental-death', match: /accidental death/i },
  { key: 'permanent-disability', match: /permanent disability|total permanent/i },
  { key: 'critical-illness', match: /critical illness/i },
  { key: 'other-life-riders', match: /other riders?|other life benefit/i },
  { key: 'annual-medical-limit', match: /annual.{0,24}medical.{0,20}limit|medical.{0,20}annual.{0,20}limit/i },
  { key: 'lifetime-medical-limit', match: /lifetime.{0,24}medical.{0,20}limit|medical.{0,20}lifetime.{0,20}limit/i },
  { key: 'room-board', match: /room\s*(?:&|and)\s*board/i },
  { key: 'cost-share', match: /deductible|co-?insurance|copay|co-pay/i },
  { key: 'outpatient', match: /outpatient/i },
  { key: 'cancer-dialysis', match: /cancer|dialysis/i },
  { key: 'pre-post-hospital', match: /pre[- ]?hospital|post[- ]?hospital/i },
  { key: 'other-medical-benefits', match: /other medical benefits?/i },
  { key: 'premium-amount', match: /annual premium|current premium|original premium|new premium|premium amount|premium per (?:year|month|annum)/i },
  { key: 'payment-frequency', match: /payment frequency|pay frequency/i },
  { key: 'premiums-paid', match: /premium.{0,20}paid|paid to date/i },
  { key: 'premium-term', match: /premium.{0,15}payment term|premium term/i },
  { key: 'remaining-term', match: /remaining.{0,20}premium|remaining.{0,20}term/i },
  { key: 'projected-premiums', match: /projected premium|total premium/i },
  { key: 'cash-value', match: /current cash value|cash value/i },
  { key: 'non-guaranteed-value', match: /non.?guaranteed value/i },
  { key: 'guaranteed-value', match: /guaranteed value/i },
  { key: 'surrender-value', match: /surrender value/i },
  { key: 'maturity-value', match: /maturity value/i },
];

function textOf(term) {
  return [term?.label, term?.value].filter(Boolean).join(' · ').normalize('NFKC').trim();
}

export function classifyInsuranceTerm(term) {
  const text = textOf(term);
  const value = String(term?.value ?? '');
  // A schedule saying that exclusions were not listed is an evidence gap, not
  // proof that the benefit is excluded (or that no exclusion applies).
  if (/\b(?:no|none)\s+(?:specific\s+)?exclusions?\s+(?:are\s+)?(?:listed|stated|specified|shown|found|noted|identified|recorded)\b|\bexclusions?\s+(?:are\s+)?not\s+(?:listed|stated|specified|shown|found|noted|identified|recorded)\b/i.test(text)) {
    return 'needs_clarification';
  }
  // An exclusion with an exception or approval condition is not a blanket
  // denial. Keep it in the clarification list so the overview does not imply
  // that the care is always outside cover.
  const hasExclusionWording = /\b(?:excluded|excludes|not covered|no coverage|ineligible)\b/i.test(text);
  const hasExceptionOrCondition = /\b(?:unless|except(?:\s+(?:for|where|when))?|subject to|only if|provided that|on condition that)\b/i.test(text);
  if (hasExclusionWording && hasExceptionOrCondition) return 'needs_clarification';
  // Negated exclusion wording must not be surfaced as a confirmed exclusion.
  const positiveExclusionText = text.replace(/\b(?:not|never)\s+excluded\b|\bno\s+(?:specific\s+)?exclusions?\s+(?:apply|applies)\b/gi, '');
  if (/\b(?:excluded|excludes|not covered|no coverage|ineligible)\b/i.test(positiveExclusionText)) return 'explicit_exclusion';
  if (/\bno\s+(?:specific\s+)?exclusions?\s+(?:apply|applies)\b|\b(?:not|never)\s+excluded\b/i.test(value)) return 'stated';
  if (/\bexclusions?\b/i.test(text)) return 'needs_clarification';
  if (/\b(unclear|ambiguous|not specified|not stated|subject to confirmation|depends on|reasonable and customary|usual and customary|medically necessary|medical necessity|pre[- ]existing|waiting period|prior authorization|prior approval|subject to insurer approval|as determined by the insurer)\b/i.test(text)) return 'needs_clarification';
  return 'stated';
}

export function clarificationQuestion(term) {
  const text = textOf(term);
  if (/reasonable and customary|usual and customary/i.test(text)) return 'Ask how the insurer sets the allowed charge, which rate schedule it uses and how to appeal a lower allowance.';
  if (/medically necessary|medical necessity/i.test(text)) return 'Ask which clinical criteria define medical necessity and what documents are required for review.';
  if (/pre[- ]existing/i.test(text)) return 'Ask how the policy defines a pre-existing condition, which dates matter and whether any waiting period or exception applies.';
  if (/waiting period/i.test(text)) return 'Ask when the period starts and which benefits, conditions and dependants it applies to.';
  if (/prior authorization|prior approval/i.test(text)) return 'Ask which services need approval, how to request it and what happens if care is urgent.';
  return 'Ask the insurer to define this wording, list its exceptions and limits, and explain what evidence or approval is required.';
}

export function interpretInsuranceTerm(term) {
  const label = String(term?.label ?? '');
  if (/exclusion|excluded|not covered/i.test(label + ' ' + String(term?.value ?? ''))) return 'This wording describes a limit on cover. Check the exact scope, exceptions and definitions in the full policy.';
  if (/deductible/i.test(label)) return 'The amount you may need to pay before the plan starts sharing eligible costs. Check how often it applies.';
  if (/co-?insurance/i.test(label)) return 'A share of eligible costs you may pay. Check what amount the percentage is based on and whether a cap applies.';
  if (/copay|co-pay/i.test(label)) return 'A fixed amount shown for an eligible service. Check which providers, visits and conditions it applies to.';
  if (/reimburse/i.test(label) || /percent(?:age)?\s+after\s+(?:the\s+)?deductible/i.test(String(term?.value ?? ''))) return 'The stated share of eligible costs the policy may reimburse after the deductible. Confirm which costs qualify, how claims are paid and what limits or exclusions apply.';
  if (/visit.{0,24}limit|limit.{0,24}visit/i.test(label)) return 'A maximum number of visits in the stated period. Confirm which visit types, providers and conditions count toward it.';
  if (/annual.{0,24}limit|medical.{0,24}limit/i.test(label)) return 'A maximum stated for the named period or benefit. Check whether it is per person, per family or per condition.';
  if (/lifetime/i.test(label)) return 'A maximum across the policy lifetime for the named benefit. Check what counts toward it.';
  if (/room\s*(?:&|and)\s*board/i.test(label)) return 'A daily hospital accommodation limit. Check whether choosing a higher room changes other payable benefits.';
  if (/premium/i.test(label)) return 'The payment stated for keeping the policy in force. Confirm the amount, frequency and any renewal changes.';
  if (/waiting period/i.test(label)) return 'A period during which some benefits may not yet apply. Check the start date and which benefits it affects.';
  if (/reasonable and customary|usual and customary/i.test(label + ' ' + String(term?.value ?? ''))) return 'The insurer may compare a charge with its own usual-rate benchmark. Ask which benchmark applies and how to challenge it.';
  if (/medically necessary|medical necessity/i.test(label + ' ' + String(term?.value ?? ''))) return 'The policy uses a clinical-need test. Ask which criteria and supporting documents the insurer requires.';
  if (/pre[- ]existing/i.test(label + ' ' + String(term?.value ?? ''))) return 'This refers to health conditions or symptoms before cover began. Confirm the policy definition, relevant dates and any waiting period.';
  return 'A plain-language guide to the saved wording; the complete policy terms and definitions control.';
}

/** Build a compact view from user-approved entries only. Missing means absent from this summary, never excluded. */
export function buildInsuranceSnapshot(terms) {
  const approved = Array.isArray(terms) ? terms : [];
  const groups = sections.map((section) => ({
    id: section.id,
    title: section.title,
    terms: approved.filter((term) => section.match ? section.match.test(textOf(term)) : !sections.some((candidate) => candidate.match?.test(textOf(term)))),
    notFound: section.fields.filter(([, matcher]) => !approved.some((term) => matcher.test(String(term?.label ?? '')))).map(([label]) => label),
  }));
  const exclusions = approved.filter((term) => classifyInsuranceTerm(term) === 'explicit_exclusion');
  const clarifications = approved.filter((term) => classifyInsuranceTerm(term) === 'needs_clarification');
  const notFoundMedicalDetails = keyMedicalDetails.filter((field) => !approved.some((term) => field.match.test(String(term?.label ?? ''))));
  const usedKeyTerms = new Set();
  const keyDetails = keyDetailFields.flatMap((field) => {
    const term = approved.find((candidate) => !usedKeyTerms.has(candidate) && field.match.test(String(candidate?.label ?? '')));
    if (!term) return [];
    usedKeyTerms.add(term);
    return [{ key: field.key, label: term.label, term }];
  });
  return { groups, exclusions, clarifications, notFoundMedicalDetails, keyDetails };
}
