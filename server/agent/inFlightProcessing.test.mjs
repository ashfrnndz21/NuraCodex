import assert from 'node:assert/strict';
import test from 'node:test';
import { InFlightProcessing } from './inFlightProcessing.mjs';

test('withdrawal aborts only matching purposes for the matching profile', () => {
  const registry = new InFlightProcessing();
  const ask = registry.begin({ profileId: 'person-a', purposes: ['ai_processing'] });
  const search = registry.begin({ profileId: 'person-a', purposes: ['public_health_search'] });
  const otherPerson = registry.begin({ profileId: 'person-b', purposes: ['ai_processing'] });

  assert.equal(registry.abortPurposes('person-a', ['ai_processing']), 1);
  assert.equal(ask.signal.aborted, true);
  assert.equal(search.signal.aborted, false);
  assert.equal(otherPerson.signal.aborted, false);
  ask.finish();
  search.finish();
  otherPerson.finish();
});

test('an active operation can add a newly consented purpose and is cancelled for either purpose', () => {
  const registry = new InFlightProcessing();
  const operation = registry.begin({ profileId: 'person-a', purposes: ['ai_processing'] });
  operation.addPurposes(['public_health_search']);

  assert.equal(registry.abortPurposes('person-a', ['public_health_search']), 1);
  assert.equal(operation.signal.aborted, true);
  operation.finish();
  assert.equal(registry.abortPurposes('person-a', ['ai_processing']), 0);
});
