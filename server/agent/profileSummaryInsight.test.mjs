import assert from 'node:assert/strict';
import test from 'node:test';
import { applyProfileResultCheck, applyProfileSummaryInsight, applySelectedReadingInsight } from './profileSummaryInsight.mjs';

const sources = [
  { id: 'fact:w', reference: 'R1', kind: 'user_record', title: 'Weight', detail: '88 kg', status: 'confirmed' },
  { id: 'fact:h', reference: 'R2', kind: 'user_record', title: 'Height', detail: '163 cm', status: 'confirmed' },
  { id: 'fact:a1c', reference: 'R3', kind: 'user_record', title: 'HbA1c', detail: '5.7 mmol/mol', status: 'confirmed' },
  { id: 'fact:chol', reference: 'R4', kind: 'user_record', title: 'Total cholesterol', detail: '7.9 mg/dL', status: 'confirmed' },
  { id: 'web:bmi', reference: 'W1', kind: 'external_source', title: 'Adult BMI Categories', status: 'external_reference' },
  { id: 'web:a1c', reference: 'W2', kind: 'external_source', title: 'The A1C Test & Diabetes', status: 'external_reference' },
  { id: 'web:chol', reference: 'W3', kind: 'external_source', title: 'Cholesterol Levels: MedlinePlus Medical Test', status: 'external_reference' },
];
const baseAnswer = { answer: 'The records reviewed show weight and height.', citations: ['R1'], unknowns: ['Other data was missing.'], nextSteps: [], memoryProposal: null };
const bmi = (ageAtMeasurement = 38) => [{
  kind: 'calculated_bmi', value: '33.1 kg/m²', rawValue: 33.1, ageAtMeasurement,
  weightReference: 'R1', heightReference: 'R2', educationalReference: 'W1', a1cEducationalReference: 'W2',
}];

test('combines BMI, cholesterol and HbA1c into a natural, source-linked health insight', () => {
  const result = applyProfileSummaryInsight(baseAnswer, bmi(), sources);
  assert.match(result.answer, /At 88 kg and 163 cm, your BMI is 33\.1, in the adult obesity screening range/);
  assert.match(result.answer, /adult obesity screening range\. BMI is a screening measure, not a health verdict/);
  assert.match(result.answer, /total cholesterol entry \(7\.9 mg\/dL\).*unusual or unclear value\/unit pairing/);
  assert.doesNotMatch(result.answer, /7\.9 mmol\/L|if the report says/);
  assert.match(result.answer, /HbA1c is recorded as 5\.7 mmol\/mol, below the common adult screening cutoffs/);
  assert.match(result.answer, /Could you confirm the cholesterol unit on the original report\?/);
  assert.doesNotMatch(result.answer, /not enough to rate|records alone cannot establish|not a diagnosis or substitute/i);
  assert.deepEqual(result.citations, ['R4', 'W3', 'R1', 'R2', 'W1', 'R3', 'W2']);
  assert.deepEqual(result.nextSteps, ['How do I confirm the cholesterol unit?', 'What does a full lipid panel show?']);
  assert.deepEqual(result.unknowns, []);
});

test('does not apply adult BMI categories to a person under 20', () => {
  const childGuidance = sources.map((source) => source.reference === 'W1' ? { ...source, title: 'Child and Teen BMI Categories' } : source);
  const result = applyProfileSummaryInsight(baseAnswer, bmi(17), childGuidance);
  assert.match(result.answer, /BMI is 33\.1; for people under 20, it is read against age- and sex-specific growth charts/);
  assert.doesNotMatch(result.answer, /adult obesity screening range/);
  assert.ok(result.citations.includes('W1'));
});

test('keeps BMI informative when age was not shared and makes any adult comparison conditional', () => {
  const result = applyProfileSummaryInsight(baseAnswer, bmi(null), sources);
  assert.match(result.answer, /if you are 20 or older, it is in the adult obesity screening range/i);
  assert.match(result.answer, /Could you confirm the cholesterol unit on the original report\?/);
  assert.ok(result.citations.includes('W1'));
});

test('keeps valid and suspicious HbA1c readings in one history without calling different dates a discrepancy', () => {
  const entries = [
    sources.find((source) => source.reference === 'R3'),
    { id: 'fact:a1c-percent', reference: 'R7', kind: 'user_record', title: 'HbA1c', detail: '5.8%', status: 'confirmed' },
    sources.find((source) => source.reference === 'W2'),
  ];
  const result = applyProfileSummaryInsight(baseAnswer, [], entries);
  assert.match(result.answer, /HbA1c result of 5\.8% is in the range commonly used to flag increased diabetes risk/);
  assert.match(result.answer, /5\.7 mmol\/mol; this value is unusually low for mmol\/mol/i);
  assert.match(result.answer, /These readings stay grouped under one HbA1c marker/i);
  assert.doesNotMatch(result.answer, /more than one HbA1c entry is dated/i, 'do not claim a same-day conflict when source dates are missing');
  assert.doesNotMatch(result.answer, /differs from another saved entry/i);
  assert.match(result.answer, /average blood sugar over about three months/);
  assert.ok(result.citations.includes('R3') && result.citations.includes('R7'));
  assert.ok(result.nextSteps.some((step) => /original report/i.test(step)));
  assert.doesNotMatch(result.answer, /you have prediabetes|you have diabetes/i);
});

test('interprets an adult systolic result as a top number and asks for the missing part of the reading', () => {
  const pressure = { reference: 'R8', kind: 'user_record', title: 'Systolic blood pressure', detail: '100 mmHg', date: '2026-10-03', status: 'confirmed' };
  const result = applyProfileSummaryInsight(baseAnswer, [], [pressure]);
  assert.match(result.answer, /systolic reading is 100 mmHg, below the common adult top-number threshold of 120/i);
  assert.match(result.answer, /bottom number and repeat readings complete the picture/i);
  assert.deepEqual(result.citations, ['R8']);
  assert.deepEqual(result.nextSteps, ['What does my systolic number mean?', 'How do I complete this blood-pressure reading?']);
});

test('does not label a single-digit mg/dL cholesterol entry as healthy or high', () => {
  const cholesterolOnly = sources.filter((source) => ['R4', 'W3'].includes(source.reference));
  const result = applyProfileSummaryInsight(baseAnswer, [], cholesterolOnly);
  assert.match(result.answer, /total cholesterol entry \(7\.9 mg\/dL\).*unusual or unclear value\/unit pairing/);
  assert.doesNotMatch(result.answer, /7\.9 mmol\/L|Under-20 guidance differs/);
  assert.doesNotMatch(result.answer, /healthy|high cholesterol|desirable/i);
  assert.deepEqual(result.nextSteps, ['How do I confirm the cholesterol unit?', 'What does a full lipid panel show?']);
});

test('compares a mmol/L cholesterol entry with the cited general adult guide', () => {
  const cholesterolSource = { ...sources.find((item) => item.reference === 'R4'), detail: '7.9 mmol/L' };
  const result = applyProfileSummaryInsight(baseAnswer, [], [cholesterolSource, sources.find((item) => item.reference === 'W3')]);
  assert.match(result.answer, /Your total cholesterol is high at 7\.9 mmol\/L on a common adult guide/);
  assert.deepEqual(result.nextSteps[0], 'What does this cholesterol result mean?');
});

test('connects BMI, elevated cholesterol and in-range triglycerides, then asks for key context', () => {
  const selected = [
    ...sources.filter((source) => !['R3', 'R4'].includes(source.reference)),
    { id: 'fact:total', reference: 'R4', kind: 'user_record', title: 'Total cholesterol', detail: '7.9 mmol/L', date: '2026-10-03', status: 'confirmed' },
    { id: 'fact:ldl', reference: 'R5', kind: 'user_record', title: 'LDL cholesterol', detail: '5.6 mmol/L', date: '2026-10-03', status: 'confirmed' },
    { id: 'fact:tg', reference: 'R6', kind: 'user_record', title: 'Triglycerides', detail: '1.4 mmol/L', date: '2026-10-03', status: 'confirmed' },
  ];
  const bodyMeasures = [{
    ...bmi(null)[0], value: '26.3 kg/m²', rawValue: 26.3,
    weightReference: 'R1', heightReference: 'R2',
  }];
  selected[0] = { ...selected[0], detail: '70 kg' };
  selected[1] = { ...selected[1], detail: '163 cm' };
  const result = applyProfileSummaryInsight(baseAnswer, bodyMeasures, selected);

  assert.match(result.answer, /At 70 kg and 163 cm, your BMI is 26\.3\. If you are 20 or older, it is in the adult overweight screening range; BMI is one clue, not a diagnosis/);
  assert.ok(result.answer.startsWith('Your cholesterol stands out: total cholesterol is high at 7.9 mmol/L and LDL cholesterol is very high at 5.6 mmol/L'), 'lead with the finding that needs follow-up');
  assert.match(result.answer, /triglycerides are within guide at 1\.4 mmol\/L/i);
  assert.doesNotMatch(result.answer, /very high LDL|LDL is .*very high/i);
  assert.match(result.answer, /A routine clinician review is sensible/);
  assert.match(result.answer, /Your age helps tailor next steps; how old are you\?/);
  assert.equal((result.answer.match(/\?/g) ?? []).length, 1, 'ask one useful clarification at a time');
  assert.equal(result.answer.split(/\n\n/).length, 2, 'keep the lead finding separate from related context and next step');
  assert.deepEqual(result.nextSteps, ['What does my LDL result mean?', 'What should I ask at a cholesterol review?']);
  for (const reference of ['R1', 'R2', 'R4', 'R5', 'R6', 'W3']) assert.ok(result.citations.includes(reference));
});

test('discusses a cholesterol result even when BMI could not be calculated', () => {
  const cholesterolSource = sources.find((item) => item.reference === 'R4');
  const education = sources.find((item) => item.reference === 'W3');
  const result = applyProfileSummaryInsight(baseAnswer, [], [cholesterolSource, education]);
  assert.match(result.answer, /7\.9 mg\/dL/);
  assert.doesNotMatch(result.answer, /records reviewed show weight and height/);
});

test('uses HbA1c percent ranges as education without turning a result into a diagnosis', () => {
  const a1cSource = { ...sources.find((item) => item.reference === 'R3'), detail: '5.8%' };
  const result = applyProfileSummaryInsight(baseAnswer, [], [a1cSource, sources.find((item) => item.reference === 'W2')]);
  assert.match(result.answer, /5\.8%.*range used to identify increased diabetes risk/);
  assert.match(result.answer, /5\.7–6\.4% range/);
  assert.match(result.answer, /reflects average blood sugar over about three months/);
  assert.deepEqual(result.nextSteps, ['What does my HbA1c say about blood sugar?', 'What does HbA1c measure over time?']);
});

test('leaves the model answer intact when no usable derived measure or supported marker is available', () => {
  const unmarked = sources.filter((source) => ['R1', 'R2'].includes(source.reference));
  assert.equal(applyProfileSummaryInsight(baseAnswer, [{
    kind: 'calculated_bmi', value: '33.1 kg/m²', rawValue: 33.1, ageAtMeasurement: 38,
    weightReference: 'missing-weight', heightReference: 'R2',
  }], unmarked), baseAnswer);
});

test('assesses each usable result separately when current records contain mixed units', () => {
  const mixedRecords = [
    { reference: 'R1', kind: 'user_record', title: 'Total cholesterol', detail: '8.5 mmol/L', date: '2026-10-03', status: 'confirmed' },
    { reference: 'R2', kind: 'user_record', title: 'Total cholesterol', detail: '7.9 mg/dL', date: '2026-10-03', status: 'confirmed' },
    { reference: 'R3', kind: 'user_record', title: 'Triglycerides', detail: '1.4 mg/dL', date: '2026-10-03', status: 'confirmed' },
    { reference: 'R4', kind: 'user_record', title: 'HbA1c', detail: '5.9%', date: '2026-10-03', status: 'confirmed' },
    { reference: 'R5', kind: 'user_record', title: 'HbA1c', detail: '5.7 mmil', date: '2026-10-02', status: 'confirmed' },
    { reference: 'R6', kind: 'user_record', title: 'HbA1c', detail: '6.4 mmol/mol', date: '2026-10-03', status: 'confirmed' },
    { reference: 'R7', kind: 'user_record', title: 'Weight', detail: '80 kg', date: '2026-10-03', status: 'confirmed' },
    { reference: 'R8', kind: 'user_record', title: 'Height', detail: '157 cm', date: '2026-10-03', status: 'confirmed' },
    { reference: 'W1', kind: 'external_source', title: 'Cholesterol Levels: MedlinePlus Medical Test', status: 'external_reference' },
    { reference: 'W2', kind: 'external_source', title: 'The A1C Test & Diabetes', status: 'external_reference' },
    { reference: 'W3', kind: 'external_source', title: 'Adult BMI Categories', status: 'external_reference' },
  ];
  const bodyMeasures = [{
    kind: 'calculated_bmi', value: '32.5 kg/m²', rawValue: 32.5, ageAtMeasurement: 39,
    weightReference: 'R7', heightReference: 'R8', educationalReference: 'W3', a1cEducationalReference: 'W2',
  }];
  const summary = applyProfileSummaryInsight(baseAnswer, bodyMeasures, mixedRecords);
  assert.match(summary.answer, /total cholesterol is high at 8\.5 mmol\/L/);
  assert.match(summary.answer, /unusual or unclear value\/unit pairings: total cholesterol 7\.9 mg\/dL; triglycerides 1\.4 mg\/dL/);
  assert.match(summary.answer, /HbA1c result of 5\.9% is in the range commonly used to flag increased diabetes risk/);
  assert.match(summary.answer, /HbA1c history also includes 5\.7 mmil \(2026-10-02\) with unclear units/i);
  assert.match(summary.answer, /6\.4 mmol\/mol.*unusually low for mmol\/mol/i);
  assert.match(summary.answer, /more than one HbA1c entry is dated 2026-10-03/i);
  assert.doesNotMatch(summary.answer, /differs from another saved entry|saved entries differ/i);
  assert.match(summary.answer, /BMI is 32\.5, in the adult obesity screening range/);
  for (const reference of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'W1', 'W2', 'W3']) assert.ok(summary.citations.includes(reference));
  assert.equal(summary.nextSteps.length, 2);

  const resultCheck = applyProfileResultCheck(baseAnswer, bodyMeasures, mixedRecords);
  assert.match(resultCheck.answer, /total cholesterol is high at 8\.5 mmol\/L/);
  assert.match(resultCheck.answer, /HbA1c result of 5\.9%.*increased diabetes risk/);
  assert.match(resultCheck.answer, /HbA1c history includes 6\.4 mmol\/mol.*check the value and unit/i);
  assert.match(resultCheck.answer, /HbA1c history also includes 5\.7 mmil \(2026-10-02\) with unclear units/i);
  assert.equal(resultCheck.nextSteps.length, 2);
});

test('selected video answers use supplied description, relate supported results, and provide contextual choices', () => {
  const video = {
    mediaType: 'video', topic: 'Cholesterol', title: 'Cholesterol Numbers - Mayo Clinic',
    publisher: 'Mayo Clinic', summary: 'Explains what total cholesterol, LDL, HDL, and triglycerides can indicate.',
    url: 'https://youtu.be/abcdefghijk',
  };
  const personalSources = [
    { reference: 'R1', kind: 'user_record', title: 'Total cholesterol', detail: '8.5 mmol/L', date: '2026-10-03', status: 'confirmed' },
    { reference: 'R2', kind: 'user_record', title: 'LDL cholesterol', detail: '5.6 mmol/L', date: '2026-10-03', status: 'confirmed' },
    { reference: 'W1', kind: 'external_source', title: 'Cholesterol Levels: MedlinePlus Medical Test', status: 'external_reference' },
  ];
  const answer = applySelectedReadingInsight(baseAnswer, video, personalSources);
  assert.match(answer.answer, /Cholesterol Numbers - Mayo Clinic.*video description highlights what total cholesterol, LDL, HDL, and triglycerides can indicate/);
  assert.match(answer.answer, /total cholesterol is high at 8\.5 mmol\/L/);
  assert.doesNotMatch(answer.answer, /I (?:watched|viewed) (?:the )?video/i);
  assert.deepEqual(answer.nextSteps, ['Explain LDL vs HDL', 'How does my cholesterol result compare?']);
  assert.ok(answer.citations.includes('R1') && answer.citations.includes('R2') && answer.citations.includes('W1'));

  const titleOnly = applySelectedReadingInsight(baseAnswer, { ...video, summary: '' }, []);
  assert.match(titleOnly.answer, /full transcript, so this is topic guidance rather than a summary of exact video claims/);
  assert.deepEqual(titleOnly.nextSteps, ['Explain LDL vs HDL', 'What does a full lipid panel show?']);
});
