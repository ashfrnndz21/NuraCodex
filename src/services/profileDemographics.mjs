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
  // A new profile is only past the required identity step once both fields
  // have been entered. A partial country or birth-date save must not make its
  // name optional or unlock protected routes.
  if (String(profile.name || '').trim() && String(profile.country || '').trim()) return true;

  // Preserve access for genuinely established profiles, but ignore sample
  // fixtures and topic selections: neither is user-authored health history.
  const hasNonSampleRecord = (items) => Array.isArray(items) && items.some((item) => {
    if (typeof item === 'string') return Boolean(item.trim());
    const id = String(item?.id || '');
    return Boolean(id) && !id.startsWith('demo-') && item?.permissionScope !== 'demo_only';
  });
  const savedRecords = [profile.facts, profile.assets, profile.links, profile.savedQuestions, profile.agentMessages, profile.registryBriefs, profile.feedItems, profile.treatments, profile.visits, profile.policyReplacements, profile.policyClarifications];
  return savedRecords.some(hasNonSampleRecord);
}

export function validateRequiredProfileDetails({ name, country, customCountry = '', birthday, requireName = true, requireCountry = true }, now = new Date()) {
  if (requireName && !String(name ?? '').trim()) return 'Add a name or nickname to continue.';
  const selectedCountry = String(country ?? '').trim();
  const enteredCountry = String(customCountry).trim();
  const countryValue = enteredCountry || selectedCountry;
  if (requireCountry && (!countryValue || countryValue === 'Other')) return 'Choose or enter your country to continue.';
  if (!String(birthday ?? '').trim()) return 'Enter your date of birth to continue.';
  if (ageFromDateOfBirth(birthday, now) === null) return 'Enter a valid date of birth in YYYY-MM-DD format. It must be a real date and cannot be in the future.';
  return null;
}

function measurementNumber(value, unit) {
  const normalized = String(value ?? '').trim().replace(new RegExp('\\s*' + unit + '$', 'i'), '').replace(',', '.');
  return normalized ? Number(normalized) : NaN;
}

export function validateRequiredMeasurements({ heightCm, weightKg }) {
  if (!String(heightCm ?? '').trim()) return 'Enter your height to continue.';
  const height = measurementNumber(heightCm, 'cm');
  if (!Number.isFinite(height) || height < 30 || height > 275) return 'Enter a valid height between 30 and 275 cm.';
  if (!String(weightKg ?? '').trim()) return 'Enter your weight to continue.';
  const weight = measurementNumber(weightKg, 'kg');
  if (!Number.isFinite(weight) || weight < 0.5 || weight > 700) return 'Enter a valid weight between 0.5 and 700 kg.';
  return null;
}
