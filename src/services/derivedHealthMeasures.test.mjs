import assert from 'node:assert/strict';
import test from 'node:test';
import { ageAtDateOfBirth, deriveAgeForMeasurements, deriveBmiFromFacts } from './derivedHealthMeasures.mjs';

const facts = [
  { id: 'w1', label: 'Weight', value: '70 kg', date: '2026-10-03T00:00:00.000Z', status: 'confirmed' },
  { id: 'h1', label: 'Height', value: '163 cm', date: '2026-10-03', status: 'confirmed' },
];

test('calculates BMI from one current, confirmed weight and height recorded on the same day', () => {
  const result = deriveBmiFromFacts(facts);
  assert.equal(result?.bmi, 26.3);
  assert.equal(result?.measurementDate, '2026-10-03');
  assert.equal(result?.weightFactId, 'w1');
  assert.equal(result?.heightFactId, 'h1');
});

test('normalizes pounds and inches before calculating BMI', () => {
  const result = deriveBmiFromFacts([
    { ...facts[0], value: '154.3 lb' },
    { ...facts[1], value: '64.2 in' },
  ]);
  assert.equal(result?.bmi, 26.3);
});

test('does not calculate BMI from different dates, retracted, historical, ambiguous, or unitless measurements', () => {
  assert.equal(deriveBmiFromFacts([facts[0], { ...facts[1], date: '2026-10-02' }]), null);
  assert.equal(deriveBmiFromFacts([facts[0], { ...facts[1], reviewState: 'user_retracted' }]), null);
  assert.equal(deriveBmiFromFacts([facts[0], { ...facts[1], validUntil: '2026-10-04' }]), null);
  assert.equal(deriveBmiFromFacts([facts[0], facts[0], facts[1]]), null);
  assert.equal(deriveBmiFromFacts([facts[0], { ...facts[1], value: '163' }]), null);
});

test('derives age at the same measurement date but never needs the birth date after the calculation', () => {
  assert.deepEqual(deriveAgeForMeasurements('1987-10-04', facts), {
    ageAtMeasurement: 38,
    measurementDate: '2026-10-03',
  });
  assert.equal(ageAtDateOfBirth('1987-10-03', '2026-10-03'), 39);
  assert.equal(ageAtDateOfBirth('2027-01-01', '2026-10-03'), null);
  assert.equal(ageAtDateOfBirth('1987-10-03 invalid', '2026-10-03'), null);
});
