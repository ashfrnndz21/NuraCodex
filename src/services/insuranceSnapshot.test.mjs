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
  ]);
  assert.ok(snapshot.notFoundMedicalDetails.some((field) => field.label === 'Room & board limit'));
  assert.equal(snapshot.exclusions.length, 0);
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
