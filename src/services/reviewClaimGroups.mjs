const groupLabels = Object.freeze({
  measurement: 'Measurements and lab results',
  condition: 'Conditions and symptoms',
  medication: 'Medicines',
  allergy: 'Allergies',
  treatment: 'Treatments',
  care_event: 'Visits and care',
  coverage_term: 'Policy terms',
  other: 'Other source details',
});

/** Group claims by their extracted type, never by inferred free-text labels. */
export function groupReviewClaims(claims) {
  const groups = new Map();
  for (const claim of claims) {
    const kind = Object.prototype.hasOwnProperty.call(groupLabels, claim.kind) ? claim.kind : 'other';
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(claim);
  }
  return [...groups].map(([kind, items]) => ({ kind, title: groupLabels[kind], claims: items }));
}
