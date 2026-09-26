import test from 'node:test';
import assert from 'node:assert/strict';
import { profileMapSummary } from './profileMapSummary.mjs';

test('reports timeline items, chosen areas and selected details separately', () => {
  assert.equal(profileMapSummary({ timelineItems: 12, selectedAreas: 5, selectedDetails: 2 }), '12 current timeline items · 5 chosen health areas · 2 selected details');
});

test('uses singular labels for one timeline item, area or selected detail', () => {
  assert.equal(profileMapSummary({ timelineItems: 1, selectedAreas: 1, selectedDetails: 1 }), '1 current timeline item · 1 chosen health area · 1 selected detail');
});

test('normalizes missing and invalid counts to zero without implying saved information', () => {
  assert.equal(profileMapSummary({ timelineItems: -2, selectedAreas: 'unknown' }), '0 current timeline items · 0 chosen health areas');
});
