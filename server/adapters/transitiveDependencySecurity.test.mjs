import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('Expo Xcode helper loads with the security-patched uuid v4 API', () => {
  const uuidPackage = require('uuid/package.json');
  const uuid = require('uuid');
  const xcode = require('xcode');

  assert.equal(uuidPackage.version, '11.1.1');
  assert.equal(typeof uuid.v4, 'function');
  assert.match(uuid.v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(typeof xcode.project, 'function');
});
