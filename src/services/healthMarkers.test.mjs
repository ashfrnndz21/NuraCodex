import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHealthMarker, convertHba1cIfccToNgspPercent, findHealthMarkerDiscrepancy, getHealthMarkerRangeGuide, getHealthMarkerUnitOptions, getHealthMarkersForTopic, healthMarkerUnitNeedsReview, healthMarkerValueNeedsReview, selectHomeMarkerSnapshots, selectLatestMarkerSnapshots } from './healthMarkers.mjs';

test('offers specific manual markers for a selected health area', () => {
  assert.deepEqual(getHealthMarkersForTopic('Cholesterol').map(({ label }) => label), [
    'Total cholesterol', 'LDL cholesterol', 'HDL cholesterol', 'Triglycerides', 'Non-HDL cholesterol', 'Apolipoprotein B (ApoB)',
  ]);
  assert.ok(getHealthMarkersForTopic('Blood pressure').some(({ label }) => label === 'Systolic blood pressure'));
  assert.deepEqual(getHealthMarkersForTopic('Something else'), [{ label: 'Health marker', unit: '' }]);
});

test('canonicalizes common source labels without conflating HDL, LDL, and total cholesterol', () => {
  assert.equal(canonicalHealthMarker('LDL-C'), 'ldl');
  assert.equal(canonicalHealthMarker('HDL Cholesterol'), 'hdl');
  assert.equal(canonicalHealthMarker('Total cholesterol'), 'total-cholesterol');
  assert.equal(canonicalHealthMarker('cholesterol'), 'cholesterol-unspecified');
  assert.equal(getHealthMarkerRangeGuide({ label: 'cholesterol', value: '7.9', birthday: '1980-06-15', eventDate: '2026-10-02' }), null);
  assert.notEqual(canonicalHealthMarker('LDL Cholesterol'), canonicalHealthMarker('HDL Cholesterol'));
});

test('asks users to verify unfamiliar or missing HbA1c units without changing the saved value', () => {
  assert.equal(healthMarkerUnitNeedsReview('HbA1c', 'mmil'), true);
  assert.equal(healthMarkerUnitNeedsReview('HbA1c', 'mg/dL'), true);
  assert.equal(healthMarkerUnitNeedsReview('HbA1c', ''), true);
  assert.equal(healthMarkerUnitNeedsReview('HbA1c', '%'), false);
  assert.equal(healthMarkerUnitNeedsReview('HbA1c', 'mmol/mol'), false);
  assert.equal(healthMarkerUnitNeedsReview('Total cholesterol', 'mmil'), false);
});

test('offers at most two familiar units for common manual marker entries', () => {
  assert.deepEqual(getHealthMarkerUnitOptions('Total cholesterol'), ['mg/dL', 'mmol/L']);
  assert.deepEqual(getHealthMarkerUnitOptions('HbA1c'), ['%', 'mmol/mol']);
  assert.deepEqual(getHealthMarkerUnitOptions('Blood pressure'), []);
  assert.deepEqual(getHealthMarkerUnitOptions('Systolic blood pressure'), ['mmHg']);
  assert.deepEqual(getHealthMarkerUnitOptions('Weight'), ['kg', 'lb']);
  assert.deepEqual(getHealthMarkerUnitOptions('Unlisted marker'), []);
});

test('shows the two newest distinct markers first and keeps one current result per marker', () => {
  const facts = [
    { id: 'new-ldl', label: 'LDL-C', value: '128 mg/dL', date: '2026-10-02T12:00:00Z' },
    { id: 'hdl', label: 'HDL cholesterol', value: '52 mg/dL', date: '2026-10-02T11:00:00Z' },
    { id: 'old-ldl', label: 'LDL cholesterol', value: '115 mg/dL', date: '2026-06-02' },
    { id: 'total', label: 'Total cholesterol', value: '195 mg/dL', date: '2026-04-02' },
  ];
  assert.deepEqual(selectLatestMarkerSnapshots(facts).map(({ id }) => id), ['new-ldl', 'hdl', 'total']);
  assert.deepEqual(selectLatestMarkerSnapshots(facts).slice(0, 2).map(({ id }) => id), ['new-ldl', 'hdl']);
});

test('keeps the newest reading first and surfaces cholesterol in the initial Home preview', () => {
  const facts = [
    { id: 'systolic', label: 'Systolic blood pressure', value: '100 mmHg', date: '2026-10-04' },
    { id: 'hba1c', label: 'HbA1c', value: '6.4 mmol/mol', date: '2026-10-03' },
    { id: 'triglycerides', label: 'Triglycerides', value: '1.4 mg/dL', date: '2026-10-03T09:00:00Z' },
    { id: 'cholesterol', label: 'Total cholesterol', value: '8.5 mmol/L', date: '2026-10-02' },
    { id: 'weight', label: 'Weight', value: '80 kg', date: '2026-10-01' },
  ];

  const firstFour = selectHomeMarkerSnapshots(facts).slice(0, 4).map(({ id }) => id);
  assert.equal(firstFour[0], 'systolic');
  assert.equal(firstFour[1], 'cholesterol');
  assert.deepEqual(new Set(firstFour), new Set(['systolic', 'cholesterol', 'hba1c', 'triglycerides']));
});

test('groups multiple dated HbA1c readings under one latest marker without rewriting their source values', () => {
  const facts = [
    { id: 'a1c-typo', label: 'HbA1c', value: '5.7 mmil', date: '2026-10-02' },
    { id: 'a1c-percent', label: 'HbA1c', value: '5.9%', date: '2026-10-02' },
    { id: 'a1c-mmol', label: 'HbA1c', value: '6.4 mmol/mol', date: '2026-10-03' },
  ];
  const latest = selectLatestMarkerSnapshots(facts);
  assert.equal(latest.filter((fact) => canonicalHealthMarker(fact.label) === 'hba1c').length, 1);
  assert.equal(latest.find((fact) => canonicalHealthMarker(fact.label) === 'hba1c').id, 'a1c-mmol');
  assert.equal(facts[0].value, '5.7 mmil');
  assert.equal(facts[1].value, '5.9%');
});

test('keeps a bare cholesterol result visible without conflating it with total cholesterol', () => {
  const facts = [
    { id: 'unspecified', label: 'cholesterol', value: '7.9', date: '2026-10-02' },
    { id: 'total', label: 'Total cholesterol', value: '195 mg/dL', date: '2026-09-20' },
    { id: 'older-unspecified', label: 'Cholesterol', value: '6.8 mmol/L', date: '2026-08-01' },
  ];
  assert.deepEqual(selectLatestMarkerSnapshots(facts).map(({ id }) => id), ['unspecified', 'total']);
});

test('excludes invalid, expired and retracted marker rows before selecting the newest snapshot', () => {
  const facts = [
    { id: 'retracted', label: 'LDL cholesterol', value: '90 mg/dL', date: '2026-10-02', reviewState: 'user_retracted' },
    { id: 'expired', label: 'LDL cholesterol', value: '91 mg/dL', date: '2026-09-02', validUntil: '2026-09-03' },
    { id: 'narrative', label: 'HDL cholesterol', value: 'not recorded', date: '2026-09-01' },
    { id: 'current', label: 'LDL cholesterol', value: '110 mg/dL', date: '2026-08-02' },
  ];
  assert.deepEqual(selectLatestMarkerSnapshots(facts).map(({ id }) => id), ['current']);
});

test('uses common adult lipid categories and the display value threshold, not a guessed personal target', () => {
  const input = { birthday: '1980-06-15', eventDate: '2026-10-02' };
  assert.equal(getHealthMarkerRangeGuide({ ...input, label: 'Total cholesterol', value: '195 mg/dL' }).status, 'DESIRABLE');
  assert.equal(getHealthMarkerRangeGuide({ ...input, label: 'Total cholesterol', value: '200 mg/dL' }).status, 'BORDERLINE HIGH');
  assert.equal(getHealthMarkerRangeGuide({ ...input, label: 'LDL cholesterol', value: '128 mg/dL' }).status, 'NEAR OPTIMAL');
  assert.equal(getHealthMarkerRangeGuide({ ...input, label: 'Triglycerides', value: '110 mg/dL' }).status, 'NORMAL');
  assert.equal(getHealthMarkerRangeGuide({ ...input, label: 'HDL cholesterol', value: '52 mg/dL' }).status, 'COMPARE WITH REPORT');
});

test('allows Ask to use an explicitly framed adult guide when age is unknown, while the default stays age-gated', () => {
  const input = { label: 'Total cholesterol', value: '7.9 mmol/L', eventDate: '2026-10-03' };
  assert.equal(getHealthMarkerRangeGuide(input), null);
  assert.equal(getHealthMarkerRangeGuide({ ...input, allowAdultGuideWhenAgeUnknown: true }).status, 'HIGH');
  assert.equal(getHealthMarkerRangeGuide({ ...input, ageAtMeasurement: 17, allowAdultGuideWhenAgeUnknown: true }), null);
});

test('converts lipid value units for the guide and withholds ranges when age, marker or unit is unsupported', () => {
  const adult = { birthday: '1980-06-15', eventDate: '2026-10-02' };
  const mmol = getHealthMarkerRangeGuide({ ...adult, label: 'Total cholesterol', value: '5.0 mmol/L' });
  assert.equal(mmol.unit, 'mmol/L');
  assert.equal(mmol.ticks[0].label, '<5.2');
  const highCholesterol = getHealthMarkerRangeGuide({ ...adult, label: 'Total cholesterol', value: '8.5 mmol/L' });
  assert.equal(highCholesterol.status, 'HIGH');
  assert.equal(highCholesterol.positionPercent, 100);
  assert.deepEqual(highCholesterol.ticks.map((tick) => tick.label), ['<5.2', '5.2', '6.2+']);
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'HbA1c', value: '5.7 mg/dL' }), null);
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'HbA1c', value: '5.7 mmil' }), null);
  assert.equal(healthMarkerUnitNeedsReview('HbA1c', 'mmil'), true);
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'cholesterol', value: '7.9 mmol/L' }), null);
  assert.equal(getHealthMarkerRangeGuide({ birthday: '2010-06-15', eventDate: '2026-10-02', label: 'LDL cholesterol', value: '128 mg/dL' }), null);
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'LDL cholesterol', value: '128 mmol/mol' }), null);
});


test('uses the NGSP master equation for IFCC HbA1c conversion', () => {
  assert.equal(convertHba1cIfccToNgspPercent(41), 5.90268);
  assert.equal(convertHba1cIfccToNgspPercent('not a number'), null);
});

test('uses safe common screening guides for HbA1c and fasting glucose in either supported unit', () => {
  const adult = { birthday: '1980-06-15', eventDate: '2026-10-02' };
  const a1cPercent = getHealthMarkerRangeGuide({ ...adult, label: 'HbA1c', value: '5.7%' });
  assert.equal(a1cPercent.status, 'AT-RISK RANGE');
  assert.equal(a1cPercent.unit, '%');
  assert.deepEqual(a1cPercent.ticks.map(({ label }) => label), ['<5.7', '5.7', '6.5+']);
  const a1cMmol = getHealthMarkerRangeGuide({ ...adult, label: 'HbA1c', value: '48 mmol/mol' });
  assert.equal(a1cMmol.status, 'ABOVE DIAGNOSTIC CUTOFF');
  assert.equal(a1cMmol.unit, 'mmol/mol');
  assert.deepEqual(a1cMmol.ticks.map(({ label }) => label), ['<39', '39', '48+']);
  const glucoseMg = getHealthMarkerRangeGuide({ ...adult, label: 'Fasting glucose', value: '105 mg/dL' });
  assert.equal(glucoseMg.status, 'IMPAIRED FASTING RANGE');
  const glucoseMmol = getHealthMarkerRangeGuide({ ...adult, label: 'Fasting glucose', value: '7.0 mmol/L' });
  assert.equal(glucoseMmol.status, 'ABOVE DIAGNOSTIC CUTOFF');
  assert.deepEqual(glucoseMmol.ticks.map(({ label }) => label), ['<5.6', '5.6', '7.0+']);
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'Blood glucose', value: '5.6 mmol/L' }), null);
});

test('shows the same range-band structure for adult systolic readings and avoids interpreting incomplete values', () => {
  const adult = { birthday: '1980-06-15', eventDate: '2026-10-02' };
  const systolic = getHealthMarkerRangeGuide({ ...adult, label: 'Systolic blood pressure', value: '100 mmHg' });
  assert.equal(systolic.status, 'UNDER 120');
  assert.equal(systolic.unit, 'mmHg');
  assert.match(systolic.caption, /systolic only.*both numbers/i);
  assert.deepEqual(systolic.ticks.map(({ label }) => label), ['<90', '90', '120', '130', '140+']);
  assert.equal(systolic.ticks.find(({ label }) => label === '120').row, 1, 'stagger clustered BP thresholds across label lines on narrow cards');
  assert.equal(systolic.ticks.find(({ label }) => label === '130').row, undefined);
  assert.equal(systolic.ticks.find(({ label }) => label === '140+').row, 1);
  assert.equal(systolic.ticks.find(({ label }) => label === '140+').align, 'end', 'anchor the final BP threshold to the card edge so it cannot clip');
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'Systolic blood pressure', value: '130 mmHg' }).status, '130–139');
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'Systolic blood pressure', value: '100' }), null);
  assert.equal(getHealthMarkerRangeGuide({ birthday: '2010-06-15', eventDate: '2026-10-02', label: 'Systolic blood pressure', value: '100 mmHg' }), null);
});

test('flags suspicious unit and value pairings instead of coloring them as reassuring', () => {
  const adult = { birthday: '1980-06-15', eventDate: '2026-10-02' };
  assert.equal(healthMarkerValueNeedsReview('HbA1c', '6.4 mmol/mol'), true);
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'HbA1c', value: '6.4 mmol/mol' }), null);
  assert.equal(healthMarkerValueNeedsReview('Total cholesterol', '7.9 mg/dL'), true);
  assert.equal(getHealthMarkerRangeGuide({ ...adult, label: 'Total cholesterol', value: '7.9 mg/dL' }), null);
  assert.equal(healthMarkerUnitNeedsReview('Systolic blood pressure', ''), true);
  assert.equal(healthMarkerUnitNeedsReview('Systolic blood pressure', 'mmHg'), false);
});

test('flags a same-day manual versus saved report mismatch and keeps the source fact intact', () => {
  const saved = { id: 'report-ldl', label: 'LDL Cholesterol', value: '93 mg/dL', date: '2026-04-22', status: 'reviewed', reviewState: 'user_confirmed' };
  const discrepancy = findHealthMarkerDiscrepancy({ label: 'LDL cholesterol', value: '104', unit: 'mg/dL', eventDate: '2026-04-22', facts: [saved] });
  assert.equal(discrepancy.fact, saved);
  assert.equal(discrepancy.date, '2026-04-22');
  assert.equal(saved.value, '93 mg/dL');
});

test('compares equivalent cholesterol units, but ignores different dates and non-comparable evidence', () => {
  const facts = [{ id: 'old', label: 'LDL cholesterol', value: '3.0 mmol/L', date: '2026-04-22', status: 'reviewed', reviewState: 'user_confirmed' }];
  assert.ok(findHealthMarkerDiscrepancy({ label: 'LDL cholesterol', value: '116', unit: 'mg/dL', eventDate: '2026-04-22', facts }));
  assert.equal(findHealthMarkerDiscrepancy({ label: 'LDL cholesterol', value: '116', unit: 'mg/dL', eventDate: '2026-04-23', facts }), null);
  assert.equal(findHealthMarkerDiscrepancy({ label: 'LDL cholesterol', value: '116', unit: '', eventDate: '2026-04-22', facts }), null);
});

test('does not flag an identical measurement or a retracted/superseded fact', () => {
  const base = { label: 'Systolic blood pressure', value: '120 mmHg', date: '2026-04-22', status: 'reviewed', reviewState: 'user_confirmed' };
  assert.equal(findHealthMarkerDiscrepancy({ label: 'Systolic', value: '120', unit: 'mmHg', eventDate: '2026-04-22', facts: [base] }), null);
  assert.equal(findHealthMarkerDiscrepancy({ label: 'Systolic', value: '140', unit: 'mmHg', eventDate: '2026-04-22', facts: [{ ...base, validUntil: '2026-05-01' }] }), null);
  assert.equal(findHealthMarkerDiscrepancy({ label: 'Systolic', value: '140', unit: 'mmHg', eventDate: '2026-04-22', facts: [{ ...base, reviewState: 'user_retracted' }] }), null);
});

test('does not compare candidate or otherwise unconfirmed extracted details', () => {
  const candidate = { label: 'LDL cholesterol', value: '93 mg/dL', date: '2026-04-22', status: 'reviewed', reviewState: 'candidate' };
  const discrepancy = findHealthMarkerDiscrepancy({ label: 'LDL cholesterol', value: '104', unit: 'mg/dL', eventDate: '2026-04-22', facts: [candidate] });
  assert.equal(discrepancy, null);
  const legacyConfirmed = { label: 'LDL cholesterol', value: '93 mg/dL', date: '2026-04-22', status: 'confirmed' };
  assert.ok(findHealthMarkerDiscrepancy({ label: 'LDL cholesterol', value: '104', unit: 'mg/dL', eventDate: '2026-04-22', facts: [legacyConfirmed] }));
});
