import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsuranceRegistryOverview, buildInsuranceSnapshot, clarificationQuestion, classifyInsuranceTerm, interpretInsuranceTerm } from './insuranceSnapshot.mjs';
import { buildPolicyExtractionReview } from './policyExtractionReview.mjs';

const term = (label, value) => ({ label, value });

test('groups approved policy fields into the five useful registry sections', () => {
  const snapshot = buildInsuranceSnapshot([
    term('Policy number', 'P-100'),
    term('Critical illness cover', 'MYR 100,000'),
    term('Annual medical limit', 'MYR 80,000'),
    term('Current premium', 'MYR 300 monthly'),
    term('Cash value', 'MYR 2,000'),
  ]);
  assert.deepEqual(snapshot.groups.filter((group) => group.terms.length).map((group) => group.id), ['policy', 'life', 'medical', 'premium', 'value']);
});

test('keeps explicit exclusions separate from unclear wording and missing details', () => {
  const snapshot = buildInsuranceSnapshot([
    term('Major exclusions', 'Experimental treatment is excluded'),
    term('Outpatient benefit', 'Not specified in the schedule'),
  ]);
  assert.equal(snapshot.exclusions.length, 1);
  assert.equal(snapshot.clarifications.length, 1);
  assert.ok(snapshot.notFoundMedicalDetails.some((field) => field.label === 'Annual medical limit'));
  assert.ok(!snapshot.exclusions.some((item) => item.label === 'Annual medical limit'));
});

test('does not turn a missing policy detail into an exclusion', () => {
  const snapshot = buildInsuranceSnapshot([term('Copay', 'MYR 60 per visit')]);
  assert.equal(snapshot.exclusions.length, 0);
  assert.ok(snapshot.notFoundMedicalDetails.some((field) => field.label === 'Lifetime medical limit'));
  assert.equal(classifyInsuranceTerm(term('Copay', 'MYR 60 per visit')), 'stated');
});

test('keeps absent or negated exclusion wording out of the explicit-exclusion list', () => {
  const notListed = term('Exclusions', 'No exclusions are listed in this schedule.');
  const noExclusionApplies = term('Exclusions', 'No exclusion applies to outpatient visits.');
  const excluded = term('Cancer treatment', 'The plan excludes this treatment.');

  assert.equal(classifyInsuranceTerm(notListed), 'needs_clarification');
  assert.equal(classifyInsuranceTerm(noExclusionApplies), 'stated');
  assert.equal(classifyInsuranceTerm(excluded), 'explicit_exclusion');

  const snapshot = buildInsuranceSnapshot([notListed, noExclusionApplies, excluded]);
  assert.deepEqual(snapshot.exclusions.map((item) => item.label), ['Cancer treatment']);
  assert.deepEqual(snapshot.clarifications.map((item) => item.label), ['Exclusions']);
});

test('routes conditional exclusions to clarification instead of the confirmed not-covered list', () => {
  const conditional = term('Cancer treatment', 'The plan excludes this treatment unless approved in advance.');
  const exception = term('Emergency care', 'Not covered except for emergency stabilization.');
  const explicit = term('Cosmetic procedures', 'Cosmetic procedures are excluded.');

  const snapshot = buildInsuranceSnapshot([conditional, exception, explicit]);
  assert.deepEqual(snapshot.exclusions.map((item) => item.label), ['Cosmetic procedures']);
  assert.deepEqual(snapshot.clarifications.map((item) => item.label), ['Cancer treatment', 'Emergency care']);
});

test('builds compact highlights from approved key terms without inventing missing values', () => {
  const annualLimit = { id: 'limit-1', label: 'Annual medical limit', value: 'MYR 80,000' };
  const copay = { id: 'copay-1', label: 'Outpatient copay', value: 'MYR 40 per visit' };
  const premiumTerm = { id: 'term-1', label: 'Premium payment term', value: '20 years' };
  const premium = { id: 'premium-1', label: 'Current premium', value: 'MYR 300 monthly' };
  const snapshot = buildInsuranceSnapshot([annualLimit, copay, premiumTerm, premium]);

  assert.deepEqual(snapshot.keyDetails.map(({ key, term: savedTerm }) => [key, savedTerm.id]), [
    ['annual-medical-limit', annualLimit.id],
    ['cost-share', copay.id],
    ['premium-amount', premium.id],
    ['premium-term', premiumTerm.id],
  ]);
  assert.ok(snapshot.notFoundMedicalDetails.some((field) => field.label === 'Room & board limit'));
  assert.equal(snapshot.exclusions.length, 0);
});

test('keeps the full requested policy summary fields available for the expandable highlights', () => {
  const terms = [
    term('Insurance company', 'Northstar Mutual'),
    term('Policy name / plan', 'Example Comprehensive'),
    term('Policy number', 'SYN-2042'),
    term('Policy commencement date', '2026-01-01'),
    term('Policy term', '20 years'),
    term('Policy status', 'In force'),
    term('Sum assured', 'MYR 100,000'),
    term('Accidental death coverage', 'MYR 50,000'),
    term('Total permanent disability', 'MYR 40,000'),
    term('Critical illness coverage', 'MYR 20,000'),
    term('Other riders', 'Hospital cash benefit'),
    term('Annual medical limit', 'MYR 80,000'),
    term('Lifetime medical limit', 'MYR 500,000'),
    term('Room and board limit', 'MYR 250 per day'),
    term('Deductible', 'MYR 500'),
    term('Outpatient benefits', 'MYR 1,000 per year'),
    term('Cancer / dialysis coverage', 'Included, subject to terms'),
    term('Pre-hospital care', '60 days'),
    term('Other medical benefits', 'Emergency assistance'),
    term('Current premium', 'MYR 300 monthly'),
    term('Payment frequency', 'Monthly'),
    term('Premiums paid to date', 'MYR 3,600'),
    term('Premium payment term', '20 years'),
    term('Remaining premium term', '19 years'),
    term('Projected premiums', 'MYR 72,000'),
    term('Current cash value', 'MYR 2,000'),
    term('Guaranteed value', 'MYR 1,500'),
    term('Non-guaranteed value', 'MYR 500'),
    term('Surrender value', 'MYR 1,200'),
    term('Maturity value', 'MYR 5,000'),
  ];
  const snapshot = buildInsuranceSnapshot(terms);

  assert.deepEqual(snapshot.keyDetails.map(({ key }) => key), [
    'insurer', 'policy-name', 'policy-number', 'commencement-date', 'policy-term', 'policy-status',
    'life-cover', 'accidental-death', 'permanent-disability', 'critical-illness', 'other-life-riders',
    'annual-medical-limit', 'lifetime-medical-limit', 'room-board', 'cost-share', 'outpatient',
    'cancer-dialysis', 'pre-post-hospital', 'other-medical-benefits', 'premium-amount',
    'payment-frequency', 'premiums-paid', 'premium-term', 'remaining-term', 'projected-premiums',
    'cash-value', 'non-guaranteed-value', 'guaranteed-value', 'surrender-value', 'maturity-value',
  ]);
  assert.equal(snapshot.keyDetails.length, terms.length);
});

test('builds a compact coverage overview without folding exclusions or unclear wording into coverage', () => {
  const annualLimit = { id: 'annual', label: 'Annual medical limit', value: 'MYR 80,000' };
  const criticalIllness = { id: 'ci', label: 'Critical illness cover', value: 'MYR 20,000' };
  const excluded = { id: 'excluded', label: 'Cancer treatment', value: 'Excluded under this policy' };
  const unclear = { id: 'unclear', label: 'Pre-existing condition', value: 'Subject to insurer confirmation' };
  const nonCoverage = { id: 'premium', label: 'Current premium', value: 'MYR 300 monthly' };
  const overview = buildInsuranceRegistryOverview([annualLimit, criticalIllness, excluded, unclear, nonCoverage]);

  assert.deepEqual(overview.coverageDetails.map(({ id }) => id), ['ci', 'annual']);
  assert.deepEqual(overview.exclusions.map(({ id }) => id), ['excluded']);
  assert.deepEqual(overview.clarifications.map(({ id }) => id), ['unclear']);
  assert.ok(overview.missingDetails.some(({ label }) => label === 'Room & board limit'));
  assert.ok(!overview.coverageDetails.some(({ id }) => ['excluded', 'unclear', 'premium'].includes(id)));
});

test('deduplicates overlapping life and medical terms in the compact overview', () => {
  const sharedTerm = { id: 'rider', label: 'Critical illness medical rider', value: 'MYR 20,000' };
  const overview = buildInsuranceRegistryOverview([sharedTerm]);

  assert.equal(overview.coverageDetails.filter(({ id }) => id === 'rider').length, 1);
});

test('keeps annual visit caps distinct from annual and lifetime medical limits', () => {
  const visitCap = buildInsuranceSnapshot([term('Annual visit limit', '8 cardiology visits')]);
  assert.ok(visitCap.notFoundMedicalDetails.some((field) => field.label === 'Annual medical limit'));
  assert.ok(visitCap.notFoundMedicalDetails.some((field) => field.label === 'Lifetime medical limit'));

  const annualLimit = buildInsuranceSnapshot([term('Annual overall limit', 'MYR 80,000')]);
  assert.ok(!annualLimit.notFoundMedicalDetails.some((field) => field.label === 'Annual medical limit'));
});

test('offers cautious plain-language explanations for common cost-sharing terms', () => {
  assert.match(interpretInsuranceTerm(term('Deductible', 'MYR 500')), /before the plan starts sharing/i);
  assert.match(interpretInsuranceTerm(term('Copay', 'MYR 60')), /eligible service/i);
});

test('explains visit caps without implying which services qualify', () => {
  assert.match(interpretInsuranceTerm(term('Outpatient cardiology visit limit', '2 visits per year')), /maximum number of visits/i);
});

test('flags policy phrases that need definitions and suggests a concrete follow-up', () => {
  const unclear = term('Usual and customary charges', 'Subject to the insurer’s usual and customary rate');
  assert.equal(classifyInsuranceTerm(unclear), 'needs_clarification');
  assert.match(clarificationQuestion(unclear), /which rate schedule/i);
  assert.match(interpretInsuranceTerm(term('Generic prescription reimbursement', '80 percent after deductible')), /eligible costs/i);
});

const extractedPolicyClaim = (label, value, options = {}) => ({
  id: options.id ?? `${label}-${value}`,
  kind: options.kind ?? 'coverage_term',
  label,
  value,
  confidence: options.confidence ?? 0.94,
  sourceLocation: { quote: Object.hasOwn(options, 'quote') ? options.quote : `${label}: ${value}`, page: options.page ?? 2 },
});

test('organizes source-quoted extracted insurance terms into a stable coverage review', () => {
  const review = buildPolicyExtractionReview({
    claims: [
      extractedPolicyClaim('Outpatient benefit', 'MYR 10,000 a year'),
      extractedPolicyClaim('Annual medical limit', 'MYR 80,000'),
      extractedPolicyClaim('Deductible', 'MYR 500'),
      extractedPolicyClaim('Pre-existing condition waiting period', '24 months'),
      extractedPolicyClaim('Claims notification deadline', '30 days'),
      extractedPolicyClaim('HbA1c', '5.8%', { kind: 'measurement' }),
    ],
    documentContext: { documentType: 'Medical insurance policy', entities: [{ kind: 'insurer', value: 'Example Mutual' }] },
  });

  assert.equal(review.insurer, 'Example Mutual');
  assert.equal(review.documentType, 'Medical insurance policy');
  assert.deepEqual(review.sections.filter((section) => section.status === 'identified').map((section) => section.id), ['eligibility', 'benefits', 'limits', 'member_costs', 'exclusions', 'claims']);
  assert.ok(review.sections.every((section) => section.evidence.every((item) => item.quote && item.page === 2)));
  assert.equal(review.counts.total, 11);
  assert.match(review.note, /not a completeness guarantee/i);
});

test('labels gaps as not identified in the extraction, never as policy exclusions', () => {
  const review = buildPolicyExtractionReview({ claims: [extractedPolicyClaim('Annual medical limit', 'MYR 80,000')] });
  const gap = review.sections.find((section) => section.id === 'claims');

  assert.equal(gap.status, 'not_identified');
  assert.equal(gap.evidence.length, 0);
  assert.match(review.note, /Check the full policy/);
  assert.equal(review.sections.find((section) => section.id === 'exclusions').status, 'not_identified');
});

test('marks weakly sourced, ambiguous, or conflicting extracted terms for review', () => {
  const review = buildPolicyExtractionReview({ claims: [
    extractedPolicyClaim('Deductible', 'MYR 500', { id: 'deductible-1' }),
    extractedPolicyClaim('Deductible', 'MYR 1,000', { id: 'deductible-2', quote: null }),
    extractedPolicyClaim('Exclusion wording', 'Subject to confirmation', { confidence: 0.55 }),
  ] });

  assert.equal(review.sections.find((section) => section.id === 'member_costs').status, 'needs_review');
  assert.equal(review.sections.find((section) => section.id === 'exclusions').status, 'needs_review');
  assert.equal(review.sections.find((section) => section.id === 'member_costs').evidence.length, 2);
});

test('handles absent or malformed source details without fabricating evidence', () => {
  const review = buildPolicyExtractionReview({ claims: null, documentContext: null });
  assert.equal(review.insurer, null);
  assert.equal(review.documentType, null);
  assert.equal(review.counts.notIdentified, 11);
  assert.ok(review.sections.every((section) => section.status === 'not_identified' && section.evidence.length === 0));
});


test('the policy checklist recognizes the common fields needed for a health policy brief', () => {
  const review = buildPolicyExtractionReview({
    claims: [
      extractedPolicyClaim('Plan edition', '2026 schedule and endorsement 2'),
      extractedPolicyClaim('Renewal date and policy status', 'Renews 1 Jan 2027; in force'),
      extractedPolicyClaim('Dependent eligibility', 'Spouse and children under 21'),
      extractedPolicyClaim('Emergency and outpatient benefits', 'Covered subject to schedule'),
      extractedPolicyClaim('Annual limit and out-of-pocket maximum', 'MYR 100,000 annual; MYR 5,000 maximum'),
      extractedPolicyClaim('Copay and coinsurance', 'MYR 50 per visit; 10%'),
      extractedPolicyClaim('Premium payment frequency', 'MYR 200 monthly'),
      extractedPolicyClaim('Pre-existing exclusions and waiting period', '12 months'),
      extractedPolicyClaim('Provider network and overseas scope', 'Panel providers in Malaysia'),
      extractedPolicyClaim('Claims submission and appeal deadline', 'Submit within 30 days; appeal within 60 days'),
      extractedPolicyClaim('Coordination of benefits with other coverage', 'This plan is secondary payer'),
    ],
  });

  assert.deepEqual(review.sections.filter((section) => section.status === 'identified').map((section) => section.id), [
    'identity', 'dates', 'eligibility', 'benefits', 'limits', 'member_costs', 'premiums', 'exclusions', 'network', 'claims', 'coordination',
  ]);
  assert.equal(review.counts.total, 11);
  assert.ok(review.sections.every((section) => section.evidence.every((item) => item.quote && item.page === 2)));
  assert.match(review.note, /which items apply depends on the plan and jurisdiction/i);
});
