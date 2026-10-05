import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { shouldRedirectToProfileSetup } from './profileRouteGate.mjs';
import { validateRequiredProfileDetails } from './profileDemographics.mjs';

const setupRouteSource = await readFile(new URL('../../app/index.tsx', import.meta.url), 'utf8');
const registryRouteSource = await readFile(new URL('../../app/registry.tsx', import.meta.url), 'utf8');
const medicalRegistrySource = await readFile(new URL('../components/MedicalRegistry.tsx', import.meta.url), 'utf8');

test('new signed-in profile cannot deep-link around required name setup', () => {
  for (const route of ['/home', '/intake', '/insurance', '/ask']) {
    assert.equal(shouldRedirectToProfileSetup(route), true, route);
  }
  assert.equal(shouldRedirectToProfileSetup('/home', {
    treatments: [{ id: 'demo-treatment-01' }],
    visits: [{ id: 'demo-visit-upcoming' }],
  }), true);
});

test('profile setup route stays open so the new user can enter their required name', () => {
  assert.equal(shouldRedirectToProfileSetup('/'), false);
  assert.equal(shouldRedirectToProfileSetup('/setup'), true);
});

test('privacy controls stay reachable before profile setup is complete', () => {
  assert.equal(shouldRedirectToProfileSetup('/privacy'), false);
  assert.equal(shouldRedirectToProfileSetup('/home'), true);
});

test('existing profiles must add a valid birth date before protected routes open', () => {
  assert.equal(shouldRedirectToProfileSetup('/home', { facts: [{ id: 'saved-fact' }] }), true);
  assert.equal(shouldRedirectToProfileSetup('/home', { name: 'Riley', country: 'Malaysia' }), true);
  assert.equal(shouldRedirectToProfileSetup('/home', { facts: [{ id: 'saved-fact' }], birthday: '1990-05-12' }), false);
});

test('partial demographics and selected topics cannot deep-link past the required name', () => {
  for (const profile of [
    { country: 'Malaysia' },
    { birthday: '1990-05-12' },
    { name: 'Riley' },
    { country: 'Malaysia', topics: [{ id: 'cholesterol', label: 'Cholesterol' }] },
  ]) assert.equal(shouldRedirectToProfileSetup('/home', profile), true);
});

test('a complete required identity profile unlocks all protected app routes', () => {
  assert.equal(shouldRedirectToProfileSetup('/intake', { name: ' Jordan ', country: 'Malaysia', birthday: '1990-05-12' }), false);
});

test('a started setup cannot open Home until all registries and final review are complete', () => {
  const profile = { name: 'Riley', country: 'Malaysia', birthday: '1990-05-12', setupProgress: { started: true, healthRecords: 'none', medicines: 'saved', insurance: 'none', finalReview: false, complete: false } };
  assert.equal(shouldRedirectToProfileSetup('/home', profile), true);
  assert.equal(shouldRedirectToProfileSetup('/setup', profile), false);
  assert.equal(shouldRedirectToProfileSetup('/treatment?firstRun=true', profile), false);
  assert.equal(shouldRedirectToProfileSetup('/registry?topicId=cholesterol&marker=LDL%20cholesterol&firstRun=true', profile), false);
  assert.equal(shouldRedirectToProfileSetup('/home', { ...profile, setupProgress: { ...profile.setupProgress, finalReview: true, complete: true } }), false);
});

test('a first-run marker choice opens the registry without bypassing setup, then returns to setup', () => {
  assert.ok(setupRouteSource.includes("router.push({ pathname: '/registry', params: { topicId: area.id, marker: signal.markerLabel ?? signal.label,"));
  assert.ok(setupRouteSource.includes("setupProgress.started && !setupProgress.complete ? { firstRun: 'true' } : {}"));
  assert.ok(registryRouteSource.includes("firstRun={params.firstRun === 'true'}"));
  assert.ok(medicalRegistrySource.includes("accessibilityLabel={firstRun ? 'Back to profile setup' : 'Back to health history'}"));
  assert.ok(medicalRegistrySource.includes("onPress={() => firstRun ? router.back() : openHistory()}"));
});

test('a valid birth date is required before first-run intake, even with no selected areas', () => {
  const emptyFocusProfile = {
    name: 'Riley Sample',
    country: 'Malaysia',
    birthday: '1990-05-12',
    topics: [],
    facts: [],
    assets: [],
  };

  assert.equal(validateRequiredProfileDetails(emptyFocusProfile), null);
  assert.equal(shouldRedirectToProfileSetup('/intake?firstRun=true', emptyFocusProfile), false);
  assert.equal(shouldRedirectToProfileSetup('/intake?firstRun=true', { ...emptyFocusProfile, setupProgress: { started: true } }), false);
  assert.match(validateRequiredProfileDetails({ ...emptyFocusProfile, birthday: '' }), /date of birth/);
  assert.equal(shouldRedirectToProfileSetup('/intake?firstRun=true', { ...emptyFocusProfile, birthday: '' }), true);

  const continueHandler = setupRouteSource.match(/async function continueFocus\(\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(continueHandler, 'profile screen has a first-run continue handler');
  assert.match(continueHandler, /await commitProfileSetup\(\)/);
  assert.match(continueHandler, /await beginProfileSetup\(\)/);
  assert.match(continueHandler, /router\.push\('\/setup'\)/);
  assert.doesNotMatch(continueHandler, /selectedAreas|topics\.length/, 'focus-area selection is optional for continuing');
  assert.match(setupRouteSource, /accessibilityState=\{\{ disabled: savingProfile, busy: savingProfile \}\} disabled=\{savingProfile\} onPress=\{continueFocus\}/);
  assert.match(setupRouteSource, /<Text style=\{styles\.primaryButtonText\}>\{savingProfile \? 'SAVING YOUR PROFILE…' : 'ADD RECORDS OR A NOTE'\}<\/Text>/);
});
