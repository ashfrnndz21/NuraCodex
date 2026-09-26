import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsuranceSnapshot, clarificationQuestion, classifyInsuranceTerm, interpretInsuranceTerm } from './insuranceSnapshot.mjs';

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
