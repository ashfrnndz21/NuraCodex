const DATE_OF_BIRTH_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ageFromDateOfBirth(value, now = new Date()) {
  const match = DATE_OF_BIRTH_PATTERN.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > now) return null;
  let age = now.getFullYear() - year;
  if (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

/** Sample fixtures must not make a new demo profile look like an existing person's profile. */
export function hasExistingProfileEvidence(profile = {}) {
  if (String(profile.name || '').trim() || String(profile.birthday || '').trim() || String(profile.country || '').trim()) return true;
  const userCreated = (items) => Array.isArray(items) && items.length > 0;
  const savedRecords = [profile.facts, profile.assets, profile.links, profile.savedQuestions, profile.agentMessages, profile.registryBriefs, profile.feedItems];
  if (profile.topics?.length || savedRecords.some(userCreated)) return true;

  // The preview ships with these fictional rows so the app is explorable. They are not user history.
  const hasNonSampleRecord = (items) => Array.isArray(items) && items.some((item) => !String(item?.id || '').startsWith('demo-'));
  return hasNonSampleRecord(profile.treatments) || hasNonSampleRecord(profile.visits);
}

export function validateRequiredProfileDetails({ name, country, customCountry = '', birthday, requireName = true, requireCountry = true, validateBirthday = true }, now = new Date()) {
  if (requireName && !String(name ?? '').trim()) return 'Add a name or nickname to continue.';
  const selectedCountry = String(country ?? '').trim();
  const enteredCountry = String(customCountry).trim();
  const countryValue = enteredCountry || selectedCountry;
  if (requireCountry && (!countryValue || countryValue === 'Other')) return 'Choose or enter your country to continue.';
  if (validateBirthday && String(birthday ?? '').trim() && ageFromDateOfBirth(birthday, now) === null) return 'Enter a valid date of birth in YYYY-MM-DD format. It must be a real date and cannot be in the future.';
  return null;
}
