import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOriginsFromEnv, applyCorsHeaders, isAllowedOrigin } from './cors.mjs';

test('development defaults allow the current Nura preview ports and hosts', () => {
  const allowed = allowedOriginsFromEnv(undefined);
  assert.equal(allowed.has('http://localhost:8094'), true);
  assert.equal(allowed.has('http://127.0.0.1:8094'), true);
  assert.equal(allowed.has('http://nura.localhost:8094'), true);
  assert.equal(allowed.has('http://localhost:8095'), true);
  assert.equal(allowed.has('http://127.0.0.1:8095'), true);
  assert.equal(allowed.has('http://nura.localhost:8095'), true);
  assert.equal(allowed.has('http://localhost:8092'), true);
  assert.equal(isAllowedOrigin(undefined, allowed), true);
  assert.equal(isAllowedOrigin('http://localhost:8094', allowed), true);
  assert.equal(isAllowedOrigin('http://localhost:8095', allowed), true);
  assert.equal(isAllowedOrigin('http://nura.localhost:8095', allowed), true);
  assert.equal(isAllowedOrigin('http://localhost:9999', allowed), false);
});

test('explicit allowed-origin configuration stays an exact override', () => {
  const allowed = allowedOriginsFromEnv('https://preview.example.test, http://localhost:8081');
  assert.deepEqual([...allowed], ['https://preview.example.test', 'http://localhost:8081']);
  assert.equal(isAllowedOrigin('http://localhost:8094', allowed), false);
});

test('CORS headers echo only an allowed origin', () => {
  const allowed = allowedOriginsFromEnv(undefined);
  const headers = new Map();
  const response = { setHeader: (name, value) => headers.set(name, value) };
  applyCorsHeaders('http://nura.localhost:8095', response, allowed);
  assert.equal(headers.get('access-control-allow-origin'), 'http://nura.localhost:8095');
  assert.equal(headers.get('vary'), 'Origin');
  headers.clear();
  applyCorsHeaders('http://localhost:8094', response, allowed);
  assert.equal(headers.get('access-control-allow-origin'), 'http://localhost:8094');
  assert.equal(headers.get('vary'), 'Origin');
  headers.clear();
  applyCorsHeaders('http://localhost:9999', response, allowed);
  assert.equal(headers.has('access-control-allow-origin'), false);
  assert.equal(headers.get('access-control-allow-methods'), 'GET, POST, PUT, DELETE, OPTIONS');
});
