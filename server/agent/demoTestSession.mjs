import { previewIdentityInstructions } from '../../src/services/previewIdentity.mjs';

export async function createSyntheticDemoAuthorization(baseUrl) {
  const response = await fetch(baseUrl + '/v1/demo/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      channel: 'email',
      destination: previewIdentityInstructions.email,
      code: previewIdentityInstructions.code,
    }),
  });
  if (response.status !== 201) throw new Error('The synthetic session fixture could not sign in.');
  const body = await response.json();
  if (typeof body.accessToken !== 'string') throw new Error('The synthetic session fixture returned no opaque credential.');
  return 'Bearer ' + body.accessToken;
}

export async function fetchWithSyntheticDemoSession(url, authorization, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('authorization', authorization);
  return fetch(url, { ...options, headers });
}
