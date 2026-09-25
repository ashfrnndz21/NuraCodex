const PREVIEW_EMAIL = 'preview@nura.test';
const PREVIEW_PHONE = '+15555550100';
const PREVIEW_CODE = '720720';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** A local-only sign-in rehearsal. It never sends a message or verifies ownership. */
export function createPreviewIdentityAdapter({ now = Date.now } = {}) {
  const challenges = new Map();
  let sequence = 0;

  function requestCode(channel, destination) {
    const normalized = String(destination || '').trim();
    const valid = channel === 'email'
      ? normalized.toLowerCase() === PREVIEW_EMAIL
      : channel === 'phone' && normalized.replace(/[\s()-]/g, '') === PREVIEW_PHONE;
    if (!valid) {
      throw new Error(channel === 'email'
        ? `Use the sample preview address ${PREVIEW_EMAIL}. No message is sent.`
        : `Use the sample preview number +1 555 555 0100. No message is sent.`);
    }
    const createdAt = now();
    const challengeId = `preview-${createdAt}-${++sequence}`;
    const expiresAt = createdAt + CHALLENGE_TTL_MS;
    challenges.set(challengeId, { channel, expiresAt, used: false });
    return { challengeId, channel, destination: normalized, code: PREVIEW_CODE, expiresAt, mode: 'synthetic_preview' };
  }

  function verifyCode(challengeId, code) {
    const challenge = challenges.get(String(challengeId));
    if (!challenge) throw new Error('Request a new preview code to continue.');
    if (challenge.used) throw new Error('This preview code has already been used. Request a new one.');
    if (now() >= challenge.expiresAt) throw new Error('This preview code has expired. Request a new one.');
    if (String(code).trim() !== PREVIEW_CODE) throw new Error('That preview code is not correct.');
    challenge.used = true;
    return {
      profileId: 'fictional-preview-profile',
      mode: 'synthetic_preview',
      authenticatedAt: new Date(now()).toISOString(),
    };
  }

  function restoreSession(value) {
    if (!value || value.mode !== 'synthetic_preview' || value.profileId !== 'fictional-preview-profile') return null;
    return { profileId: value.profileId, mode: value.mode, authenticatedAt: String(value.authenticatedAt || '') };
  }

  return { requestCode, verifyCode, restoreSession };
}

export const previewIdentityInstructions = Object.freeze({
  email: PREVIEW_EMAIL,
  phone: '+1 555 555 0100',
  code: PREVIEW_CODE,
  expiresInMinutes: CHALLENGE_TTL_MS / 60000,
});
