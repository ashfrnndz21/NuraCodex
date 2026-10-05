export const INITIAL_PROFILE_SETUP_PROGRESS = Object.freeze({
  started: false,
  healthRecords: 'pending',
  medicines: 'pending',
  insurance: 'pending',
  finalReview: false,
  complete: false,
});

const sections = new Set(['healthRecords', 'medicines', 'insurance']);
const allSectionsResolved = (progress) => ['healthRecords', 'medicines', 'insurance']
  .every((section) => progress[section] === 'saved' || progress[section] === 'none' || progress[section] === 'deferred');

export function normalizeProfileSetupProgress(value) {
  if (!value || typeof value !== 'object') return { ...INITIAL_PROFILE_SETUP_PROGRESS };
  const status = (key) => ['pending', 'saved', 'none', 'deferred'].includes(value[key]) ? value[key] : 'pending';
  const normalized = {
    started: value.started === true,
    healthRecords: status('healthRecords'),
    medicines: status('medicines'),
    insurance: status('insurance'),
    finalReview: value.finalReview === true,
    complete: false,
  };
  normalized.complete = value.complete === true && normalized.finalReview === true && normalized.started && allSectionsResolved(normalized);
  return normalized;
}

export function setProfileSetupSection(progress, section, status) {
  if (!sections.has(section)) throw new Error('Unknown profile setup section.');
  if (!['saved', 'none', 'pending', 'deferred'].includes(status)) throw new Error('Invalid profile setup choice.');
  const normalized = normalizeProfileSetupProgress(progress);
  const finishingDeferredReview = normalized.complete && normalized[section] === 'deferred' && status === 'saved';
  return {
    ...normalized,
    started: true,
    [section]: status,
    finalReview: finishingDeferredReview ? normalized.finalReview : false,
    complete: finishingDeferredReview,
  };
}

export function canCompleteProfileSetup(progress) {
  const normalized = normalizeProfileSetupProgress(progress);
  return normalized.started && allSectionsResolved(normalized);
}

export function completeProfileSetupProgress(progress) {
  if (!canCompleteProfileSetup(progress)) throw new Error('Finish each profile section before completing setup.');
  return { ...normalizeProfileSetupProgress(progress), finalReview: true, complete: true };
}
