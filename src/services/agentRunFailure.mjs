const failureMessages = Object.freeze({
  run_stopped: 'This run was stopped. Saved records were not changed.',
  ai_credential_rejected: 'OpenAI rejected the authentication used by Nura’s server. Your API credit balance is separate. Check that the key is active and belongs to the funded organization and project; if an IP allowlist is enabled, allow this server too. Replace the key if needed, then restart Nura. Your saved records were not changed.',
  ai_access_denied: 'The Ask provider cannot access the configured model. Check its account access, then try again.',
  ai_model_unavailable: 'The configured answer model is unavailable. The preview needs an updated model setting.',
  ai_request_rejected: 'The Ask provider rejected the request setup. The preview needs its model settings checked.',
  ai_rate_limited: 'The Ask provider is busy or has reached its usage limit. Please try again later.',
  ai_provider_unavailable: 'The Ask provider is temporarily unavailable. Your saved records were not changed; try again shortly.',
  ai_provider_unreachable: 'Nura could not reach its answer provider. Check the server connection, then try again.',
  answer_failed: 'Nura could not complete this answer. Your saved information was not changed. Please try again.',
});

export function agentRunFailureMessage(safeCode) {
  return typeof safeCode === 'string' && Object.hasOwn(failureMessages, safeCode)
    ? failureMessages[safeCode]
    : failureMessages.answer_failed;
}

/** Reduce an internal provider failure to an allowlisted code and user-safe message. */
export function presentAgentRunFailure(error, stopped = false) {
  if (stopped) return { safeCode: 'run_stopped', message: 'This run was stopped. Saved records were not changed.' };
  const code = typeof error?.code === 'string' && Object.hasOwn(failureMessages, error.code)
    ? error.code
    : 'answer_failed';
  return { safeCode: code, message: agentRunFailureMessage(code) };
}
