import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_PROFILE_ID } from '../contracts.mjs';
import { LocalDemoProfileAccess, LOCAL_DEMO_PRINCIPAL } from '../adapters/localDemoProfileAccess.mjs';
import { createTrustedPrincipal, isTrustedPrincipal, ProfileAccess, profileAccessAllowed, profileAccessDenied } from './ProfileAccess.mjs';

// The unchanged request caller keeps verified identity separate from the
// untrusted HTTP-like body. Only the profile selector comes from that body.
function authorizeProfileRequest(accessPort, verifiedSession, requestBody) {
  return accessPort.authorize({
    principal: verifiedSession?.principal,
    requestedProfileId: requestBody?.profileId,
  });
}

async function assertProfileAccessConformance({ accessPort, principal, allowedProfileId, foreignPrincipal, unknownProfileId }) {
  const normalRequest = await authorizeProfileRequest(accessPort, { principal }, { profileId: allowedProfileId });
  assert.deepEqual(normalRequest, profileAccessAllowed(allowedProfileId));

  const unknownProfile = await authorizeProfileRequest(accessPort, { principal }, { profileId: unknownProfileId });
  assert.deepEqual(unknownProfile, profileAccessDenied('profile_not_available'));

  const foreignActor = await authorizeProfileRequest(accessPort, { principal: foreignPrincipal }, { profileId: allowedProfileId });
  assert.deepEqual(foreignActor, profileAccessDenied('profile_not_available'));

  const missingSession = await authorizeProfileRequest(accessPort, null, { profileId: allowedProfileId });
  assert.deepEqual(missingSession, profileAccessDenied('untrusted_principal'));

  // A JSON client cannot mint the in-process principal capability or promote
  // a client-supplied principal/profile pair into trusted identity.
  const spoofedBody = JSON.parse(JSON.stringify({
    profileId: allowedProfileId,
    principal: { issuer: principal.issuer, subject: principal.subject },
  }));
  const clientSpoof = await authorizeProfileRequest(accessPort, null, spoofedBody);
  assert.deepEqual(clientSpoof, profileAccessDenied('untrusted_principal'));

  // Even if a request body claims the demo identity, the server's verified
  // principal remains the only principal passed to the port.
  const foreignSessionWithSpoofedBody = await authorizeProfileRequest(
    accessPort,
    { principal: foreignPrincipal },
    { profileId: allowedProfileId, principal: spoofedBody.principal },
  );
  assert.deepEqual(foreignSessionWithSpoofedBody, profileAccessDenied('profile_not_available'));
}

test('local demo adapter authorizes only the synthetic demo profile and is not production identity', async () => {
  const accessPort = new LocalDemoProfileAccess();
  const foreignPrincipal = createTrustedPrincipal({ issuer: 'nura-local-synthetic-demo', subject: 'another-actor' });

  assert.equal(accessPort.identityMode, 'synthetic_demo_only');
  assert.equal(accessPort.productionIdentity, false);
  assert.equal(isTrustedPrincipal(LOCAL_DEMO_PRINCIPAL), true);
  await assertProfileAccessConformance({
    accessPort,
    principal: LOCAL_DEMO_PRINCIPAL,
    allowedProfileId: DEMO_PROFILE_ID,
    foreignPrincipal,
    unknownProfileId: 'synthetic-unknown-profile',
  });
});

class AlternateFixtureProfileAccess extends ProfileAccess {
  #principal;
  #profileId;

  constructor(principal, profileId) {
    super();
    this.#principal = principal;
    this.#profileId = profileId;
  }

  async authorize(request) {
    if (!isTrustedPrincipal(request?.principal)) return profileAccessDenied('untrusted_principal');
    if (request.principal !== this.#principal || request.requestedProfileId !== this.#profileId) {
      return profileAccessDenied('profile_not_available');
    }
    return profileAccessAllowed(this.#profileId);
  }
}

test('same request caller and port conformance suite work after swapping the adapter', async () => {
  const alternatePrincipal = createTrustedPrincipal({ issuer: 'synthetic-test-issuer', subject: 'synthetic-test-user' });
  const foreignPrincipal = createTrustedPrincipal({ issuer: 'synthetic-test-issuer', subject: 'synthetic-other-user' });
  const alternateProfileId = 'synthetic-test-profile';
  const accessPort = new AlternateFixtureProfileAccess(alternatePrincipal, alternateProfileId);

  await assertProfileAccessConformance({
    accessPort,
    principal: alternatePrincipal,
    allowedProfileId: alternateProfileId,
    foreignPrincipal,
    unknownProfileId: 'synthetic-unknown-profile',
  });
});
