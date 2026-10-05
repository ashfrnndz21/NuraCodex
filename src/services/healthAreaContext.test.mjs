import assert from 'node:assert/strict';
import test from 'node:test';
import { getHealthAreaContext } from './healthAreaContext.mjs';

test('health-area context accepts only known profile topics and returns canonical labels', () => {
  assert.deepEqual(getHealthAreaContext('bp-topic'), { id: 'bp-topic', label: 'Blood pressure' });
  assert.deepEqual(getHealthAreaContext('cholesterol'), { id: 'cholesterol', label: 'Cholesterol' });
  assert.equal(getHealthAreaContext('a user supplied prompt'), null);
  assert.equal(getHealthAreaContext(''), null);
  assert.equal(getHealthAreaContext(null), null);
});
