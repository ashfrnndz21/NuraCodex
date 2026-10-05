import { selectFeedPersonalContext } from './feedPersonalization.mjs';

function uniqueLabels(values) {
  const seen = new Set();
  return values.map((value) => String(value ?? '').trim()).filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build the per-video relevance map shown on Home.
 * The search topic stays separate from saved context matched locally; health
 * values, dates, and source text are deliberately omitted from this projection.
 */
export function buildHomeVideoRelevance(item, facts = [], treatments = [], excludedIdentifiers = []) {
  const searchTopic = String(item?.topic ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
    || 'Selected health area';
  const context = selectFeedPersonalContext(item, facts, treatments, excludedIdentifiers);
  const matchedFacts = uniqueLabels(context.facts.map((fact) => fact.label));
  const matchedTreatments = uniqueLabels(context.treatments.map((treatment) => treatment.name));

  return {
    searchTopic,
    matchedFacts,
    matchedTreatments,
    matchCount: matchedFacts.length + matchedTreatments.length,
  };
}
