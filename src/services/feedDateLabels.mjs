function parseFeedDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (dateOnly && (date.getFullYear() !== Number(dateOnly[1]) || date.getMonth() !== Number(dateOnly[2]) - 1 || date.getDate() !== Number(dateOnly[3]))) return null;
  return date;
}

export function formatFeedRetrievalDate(value, locale) {
  const date = parseFeedDate(value);
  return date ? `Found by Nura · ${date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Search date unavailable';
}
