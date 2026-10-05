import { selectFeedPersonalContext } from './feedPersonalization.mjs';

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Select up to two current, confirmed details and one current treatment for a selected public source. */
export function selectAskSourceContext(item, profile, excludedIdentifiers = []) {
  const safeSelection = selectFeedPersonalContext(item, profile?.facts ?? [], profile?.treatments ?? [], excludedIdentifiers);
  const facts = safeSelection.facts.flatMap((selected) => {
    const fact = (profile?.facts ?? []).find((candidate) => normalize(candidate.label) === normalize(selected.label)
      && normalize(candidate.value) === normalize(selected.value)
      && ['confirmed', 'reviewed'].includes(candidate.status)
      && candidate.reviewState === 'user_confirmed'
      && !candidate.validUntil);
    if (!fact) return [];
    return [{
      id: fact.id,
      label: selected.label,
      value: selected.value,
      date: selected.date,
      category: fact.category,
      source: 'Saved in your health profile',
      status: fact.status,
      sourceId: fact.sourceId,
      sourceClaimId: fact.sourceClaimId,
      reviewState: fact.reviewState,
    }];
  });
  const treatments = safeSelection.treatments.flatMap((selected) => {
    const treatment = (profile?.treatments ?? []).find((candidate) => normalize(candidate.name) === normalize(selected.name)
      && candidate.status === 'current');
    if (!treatment) return [];
    return [{
      id: treatment.id,
      name: selected.name,
      dose: '',
      schedule: '',
      purpose: selected.purpose,
      prescriber: '',
      careLocation: '',
      pharmacy: '',
      status: 'current',
      startedOn: '',
      endedOn: '',
      source: 'Saved treatment record',
    }];
  });
  const sourceTopic = String(item?.topic ?? '').split(/\s+[·|]\s+/)[0];
  const topics = (profile?.topics ?? [])
    .filter((topic) => normalize(topic.label) === normalize(sourceTopic))
    .slice(0, 1)
    .map(({ id, label }) => ({ id, label }));
  return { facts: facts.slice(0, 2), topics, treatments: treatments.slice(0, 1), links: [], visits: [] };
}
