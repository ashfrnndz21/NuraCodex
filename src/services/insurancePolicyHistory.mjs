/** Group source-linked insurance assertions without conflating review history with current record entries. */
export function groupInsurancePolicyTerms(facts) {
  const groups = new Map();
  const timeOf = (fact) => {
    const time = Date.parse(fact.validFrom || fact.date || '');
    return Number.isFinite(time) ? time : 0;
  };

  for (const fact of facts) {
    if (fact.category !== 'Insurance coverage' || !fact.sourceId) continue;

    let group = groups.get(fact.sourceId);
    if (!group) {
      group = { sourceId: fact.sourceId, sourceName: fact.source, currentTerms: [], previousTerms: [], removedTerms: [] };
      groups.set(fact.sourceId, group);
    }

    if (fact.reviewState === 'user_retracted') group.removedTerms.push(fact);
    else if (fact.validUntil) group.previousTerms.push(fact);
    else group.currentTerms.push(fact);
    if (!group.sourceName && fact.source) group.sourceName = fact.source;
  }

  const newestFirst = (left, right) => timeOf(right) - timeOf(left);
  const dated = (terms) => terms.sort(newestFirst);
  const result = [...groups.values()].map((group) => ({
    ...group,
    currentTerms: dated(group.currentTerms),
    previousTerms: dated(group.previousTerms),
    removedTerms: dated(group.removedTerms),
  }));

  return result.sort((left, right) => {
    const leftDate = Math.max(0, ...[left.currentTerms, left.previousTerms, left.removedTerms].flat().map(timeOf));
    const rightDate = Math.max(0, ...[right.currentTerms, right.previousTerms, right.removedTerms].flat().map(timeOf));
    return rightDate - leftDate;
  });
}
