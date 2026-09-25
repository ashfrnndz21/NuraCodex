export type PreviewIdentityChannel = 'email' | 'phone';
export type PreviewIdentityChallenge = {
  challengeId: string;
  channel: PreviewIdentityChannel;
  destination: string;
  code: string;
  expiresAt: number;
  mode: 'synthetic_preview';
};
export type PreviewIdentitySession = {
  profileId: 'fictional-preview-profile';
  mode: 'synthetic_preview';
  authenticatedAt: string;
};
export function createPreviewIdentityAdapter(options?: { now?: () => number }): {
  requestCode(channel: PreviewIdentityChannel, destination: string): PreviewIdentityChallenge;
  verifyCode(challengeId: string, code: string): PreviewIdentitySession;
  restoreSession(value: unknown): PreviewIdentitySession | null;
};
export const previewIdentityInstructions: Readonly<{
  email: string;
  phone: string;
  code: string;
  expiresInMinutes: number;
}>;
