import { healthMarkerUnitNeedsReview } from './healthMarkers.mjs';
import { parseHealthDate } from '../utils/healthDate.mjs';

/** Format saved health dates for the first-run review without changing the stored value. */
export function formatSetupReviewDate(value, locale = 'en-GB') {
  if (typeof value !== 'string' || !value.trim()) return '';
  const parsed = parseHealthDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Keep a saved fact verbatim and add a caution only when its HbA1c unit is missing or unfamiliar. */
export function setupHealthFactReview(fact, locale = 'en-GB') {
  const value = typeof fact?.value === 'string' ? fact.value : String(fact?.value ?? '');
  const valueMatch = value.trim().match(/^[+-]?\d+(?:[.,]\d+)?\s*(.*)$/);
  const unit = valueMatch?.[1] ?? '';
  const date = formatSetupReviewDate(fact?.date, locale);
  const source = typeof fact?.source === 'string' ? fact.source : '';
  const unitNeedsConfirmation = healthMarkerUnitNeedsReview(fact?.label, unit);

  return {
    title: typeof fact?.label === 'string' ? fact.label : 'Saved health detail',
    detail: [value, date, source].filter(Boolean).join(' · '),
    notice: unitNeedsConfirmation ? 'CHECK UNIT · Confirm the unit on the original report before interpreting this result.' : undefined,
    unitNeedsConfirmation,
  };
}
