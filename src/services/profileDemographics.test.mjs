import assert from 'node:assert/strict';
import test from 'node:test';
import { ageFromDateOfBirth, hasExistingProfileEvidence, validateRequiredProfileDetails } from './profileDemographics.mjs';

const today = new Date(2026, 8, 26, 12);
const completeProfile = { name: 'Jordan Sample', country: 'Malaysia', birthday: '1990-05-12' };

test('new profile setup requires display name and country while birth date remains optional', () => {
  assert.match(validateRequiredProfileDetails({ ...completeProfile, name: ' ' }, today), /name or nickname/);
  assert.match(validateRequiredProfileDetails({ ...completeProfile, country: '' }, today), /country/);
  assert.equal(validateRequiredProfileDetails({ ...completeProfile, birthday: '' }, today), null);
  assert.equal(validateRequiredProfileDetails(completeProfile, today), null);
});

test('Other country requires an entered country name and accepts a user-entered country', () => {
  assert.match(validateRequiredProfileDetails({ ...completeProfile, country: 'Other' }, today), /country/);
  assert.equal(validateRequiredProfileDetails({ ...completeProfile, country: 'Other', customCountry: 'Iceland' }, today), null);
});

test('an existing profile can continue without a newly required country', () => {
  assert.equal(validateRequiredProfileDetails({ ...completeProfile, country: '', requireCountry: false }, today), null);
  assert.equal(validateRequiredProfileDetails({ ...completeProfile, birthday: 'legacy-date', requireCountry: false, validateBirthday: false }, today), null);
});

test('new profiles require a display name while an existing profile can continue without adding one', () => {
  assert.match(validateRequiredProfileDetails({ ...completeProfile, name: '' }, today), /name or nickname/);
  assert.equal(validateRequiredProfileDetails({ ...completeProfile, name: '', requireName: false }, today), null);
});

test('fictional preview seed records do not make a new profile appear established', () => {
  assert.equal(hasExistingProfileEvidence({
    name: '',
    birthday: '',
    country: '',
    topics: [{ id: 'cholesterol', label: 'Cholesterol' }],
    treatments: [{ id: 'demo-treatment-01' }],
    visits: [{ id: 'demo-visit-upcoming' }, { id: 'demo-visit-completed' }],
  }), false);
});

test('partial demographics and topic choices do not bypass required profile setup', () => {
  for (const profile of [
    { country: 'Malaysia' },
    { birthday: '1990-05-12' },
    { name: 'Riley' },
    { country: 'Malaysia', topics: [{ id: 'cholesterol', label: 'Cholesterol' }] },
  ]) assert.equal(hasExistingProfileEvidence(profile), false);
  assert.equal(hasExistingProfileEvidence({ name: 'Riley', country: 'Malaysia' }), true);
});

test('existing user-authored records preserve access without requiring a new name', () => {
  assert.equal(hasExistingProfileEvidence({ treatments: [{ id: 'a-user-created-record' }] }), true);
  assert.equal(hasExistingProfileEvidence({ facts: [{ id: 'fact-01' }] }), true);
});

test('date of birth rejects malformed, impossible, future, and implausibly old dates', () => {
  for (const birthday of ['12/05/1990', '1990-02-30', '2026-09-27', '1800-01-01']) {
    assert.match(validateRequiredProfileDetails({ ...completeProfile, birthday }, today), /valid date of birth/);
    assert.equal(ageFromDateOfBirth(birthday, today), null);
  }
});

test('birth date age uses completed years without adding a stored age field', () => {
  assert.equal(ageFromDateOfBirth('2000-09-26', today), 26);
  assert.equal(ageFromDateOfBirth('2000-09-27', today), 25);
  assert.equal(ageFromDateOfBirth('2026-09-27', today), null);
  assert.equal(ageFromDateOfBirth('not-a-date', today), null);
});
