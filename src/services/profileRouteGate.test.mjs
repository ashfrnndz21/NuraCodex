import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRedirectToProfileSetup } from './profileRouteGate.mjs';

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
  assert.equal(shouldRedirectToProfileSetup('/home', { country: 'Malaysia' }), false);
});

test('a trimmed display name unlocks all protected app routes', () => {
  assert.equal(shouldRedirectToProfileSetup('/intake', { name: ' Jordan ' }), false);
});
