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
