/** Keep the date a user wrote a note distinct from the health-event date. */
export function timelineDatePresentation(entry) {
  const isEntryDate = entry.kind === 'fact'
    && entry.source === 'Written by you'
    && !entry.sourceClaimId
    && /event date was not provided/i.test(entry.note ?? '');

  return {
    isEntryDate,
    cardDate: isEntryDate ? `Added ${entry.date}` : entry.date,
    accessibilityLabel: isEntryDate
      ? `Added ${entry.date}. Event date not provided.`
      : entry.date,
  };
}
