import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { shouldRedirectToProfileSetup } from './profileRouteGate.mjs';
import { validateRequiredProfileDetails } from './profileDemographics.mjs';

const setupRouteSource = await readFile(new URL('../../app/index.tsx', import.meta.url), 'utf8');

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
});

test('a populated current profile is not blocked for lacking a new name', () => {
  assert.equal(shouldRedirectToProfileSetup('/home', { facts: [{ id: 'saved-fact' }] }), false);
  assert.equal(shouldRedirectToProfileSetup('/home', { name: 'Riley', country: 'Malaysia' }), false);
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
  assert.equal(shouldRedirectToProfileSetup('/intake', { name: ' Jordan ', country: 'Malaysia' }), false);
});

test('required name and country are enough to continue directly to first-run record intake with no selected areas', () => {
  const emptyFocusProfile = {
    name: 'Riley Sample',
    country: 'Malaysia',
    birthday: '',
    topics: [],
    facts: [],
    assets: [],
  };

  assert.equal(validateRequiredProfileDetails(emptyFocusProfile), null);
  assert.equal(shouldRedirectToProfileSetup('/intake?firstRun=true', emptyFocusProfile), false);

  const continueHandler = setupRouteSource.match(/async function continueFocus\(\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(continueHandler, 'profile screen has a first-run continue handler');
  assert.match(continueHandler, /await commitProfileSetup\(\)/);
  assert.match(continueHandler, /router\.push\(\{ pathname: '\/intake', params: \{ firstRun: 'true' \} \}\)/);
  assert.doesNotMatch(continueHandler, /selectedAreas|topics\.length/, 'focus-area selection is optional for continuing');
  assert.match(setupRouteSource, /accessibilityState=\{\{ disabled: savingProfile, busy: savingProfile \}\} disabled=\{savingProfile\} onPress=\{continueFocus\}/);
  assert.match(setupRouteSource, /<Text style=\{styles\.primaryButtonText\}>\{savingProfile \? 'SAVING YOUR PROFILE…' : 'ADD RECORDS OR A NOTE'\}<\/Text>/);
});
