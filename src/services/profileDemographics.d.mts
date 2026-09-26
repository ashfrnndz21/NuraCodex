export function ageFromDateOfBirth(value: string, now?: Date): number | null;
export function hasExistingProfileEvidence(profile?: Record<string, unknown>): boolean;
export function validateRequiredProfileDetails(
  profile: { name: string; country: string; customCountry?: string; birthday: string; requireName?: boolean; requireCountry?: boolean; validateBirthday?: boolean },
  now?: Date,
): string | null;
