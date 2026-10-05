import assert from 'node:assert/strict';
import test from 'node:test';
import { agentRunFailureMessage, presentAgentRunFailure } from './agentRunFailure.mjs';

test('known Ask provider failures have specific, safe recovery guidance', () => {
  const rejectedKey = new Error('private provider body and secret key');
  rejectedKey.code = 'ai_credential_rejected';
  assert.deepEqual(presentAgentRunFailure(rejectedKey), {
    safeCode: 'ai_credential_rejected',
    message: 'OpenAI rejected the authentication used by Nura’s server. Your API credit balance is separate. Check that the key is active and belongs to the funded organization and project; if an IP allowlist is enabled, allow this server too. Replace the key if needed, then restart Nura. Your saved records were not changed.',
  });
  assert.match(agentRunFailureMessage('ai_rate_limited'), /usage limit/);
  assert.match(agentRunFailureMessage('ai_provider_unreachable'), /server connection/);
});

test('unknown Ask failures never expose internal error text or codes', () => {
  const internal = new Error('private health text or credential material');
  internal.code = 'private-health-code';
  const result = presentAgentRunFailure(internal);
  assert.equal(result.safeCode, 'answer_failed');
  assert.match(result.message, /saved information was not changed/);
  assert.doesNotMatch(JSON.stringify(result), /private health text|credential material|private-health-code/);
});

test('stopped Ask runs tell the person no saved record was changed', () => {
  const result = presentAgentRunFailure(new Error('abort'), true);
  assert.equal(result.safeCode, 'run_stopped');
  assert.match(result.message, /run was stopped/);
  assert.match(result.message, /Saved records were not changed/);
});
