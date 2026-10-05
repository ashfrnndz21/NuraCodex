import { canonicalHealthMarker, convertHba1cIfccToNgspPercent, healthMarkerUnitNeedsReview, healthMarkerValueNeedsReview } from './healthMarkers.mjs';
import { parseHealthDate } from '../utils/healthDate.mjs';

const markerNames = {
  hba1c: 'HbA1c',
  'total-cholesterol': 'Total cholesterol',
  'cholesterol-unspecified': 'Cholesterol',
  ldl: 'LDL cholesterol',
  hdl: 'HDL cholesterol',
  triglycerides: 'Triglycerides',
  'non-hdl': 'Non-HDL cholesterol',
  apob: 'Apolipoprotein B',
  systolic: 'Systolic blood pressure',
  diastolic: 'Diastolic blood pressure',
  'fasting-glucose': 'Fasting glucose',
  glucose: 'Blood glucose',
  'resting-heart-rate': 'Resting heart rate',
  'heart-rate': 'Heart rate',
  weight: 'Weight',
  waist: 'Waist circumference',
  'sleep-duration': 'Sleep duration',
};
const numericValue = /^-?\d+(?:[.,]\d+)?\s*.*$/;

function eventDay(value) {
  const parsed = parseHealthDate(String(value ?? ''));
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function parseMeasurement(record) {
  const text = String(record?.detail ?? '').trim();
  const match = text.match(/^(-?\d+(?:[.,]\d+)?)\s*(.*?)$/);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  return { value, unit: String(match[2] ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '') };
}

function comparableMeasurement(record, marker) {
  const parsed = parseMeasurement(record);
  if (!parsed || !parsed.unit) return null;
  if (marker === 'hba1c') {
    if (healthMarkerUnitNeedsReview('HbA1c', parsed.unit) || healthMarkerValueNeedsReview('HbA1c', record.detail)) return null;
    if (parsed.unit === '%' || parsed.unit === 'percent') return { value: parsed.value, unit: '%' };
    if (parsed.unit === 'mmol/mol') return { value: convertHba1cIfccToNgspPercent(parsed.value), unit: '%' };
    return null;
  }
  if (healthMarkerUnitNeedsReview(record.title, parsed.unit)) return null;
  return parsed;
}

function sameDayReviewStatus(records, marker) {
  const byDate = new Map();
  for (const record of records) {
    const day = eventDay(record.date);
    if (!day) continue;
    const sameDay = byDate.get(day) ?? [];
    sameDay.push(record);
    byDate.set(day, sameDay);
  }

  let status = 'none';
  for (const sameDay of byDate.values()) {
    if (sameDay.length < 2) continue;
    const measurements = sameDay.map((record) => comparableMeasurement(record, marker));
    if (measurements.some((measurement) => !measurement)) return 'needs_confirmation';
    if (measurements.some((measurement) => measurement.unit !== measurements[0].unit)) return 'needs_confirmation';
    const tolerance = marker === 'hba1c' ? 0.15 : Math.max(0.0001, Math.abs(measurements[0].value) * 0.000001);
    if (measurements.some((measurement) => Math.abs(measurement.value - measurements[0].value) > tolerance)) return 'possible_difference';
    if (sameDay.some((record) => String(record.detail ?? '').trim() !== String(sameDay[0].detail ?? '').trim())) status = 'equivalent';
  }
  return status;
}

/** Group marker facts into one registry concept while retaining every dated, source-linked reading. */
export function groupRegistryMarkerHistory(items = []) {
  const groups = [];
  const markerGroups = new Map();

  for (const item of items) {
    const marker = item?.kind === 'fact' ? canonicalHealthMarker(item.title) : null;
    if (!marker || !markerNames[marker] || !numericValue.test(String(item.detail ?? '').trim())) {
      groups.push({ id: `record:${item?.id ?? groups.length}`, marker: null, title: String(item?.title ?? 'Saved detail'), records: [item], sameDayStatus: 'none' });
      continue;
    }

    let group = markerGroups.get(marker);
    if (!group) {
      group = { id: `marker:${marker}`, marker, title: markerNames[marker], records: [], sameDayStatus: 'none' };
      markerGroups.set(marker, group);
      groups.push(group);
    }
    group.records.push(item);
  }

  for (const group of groups) {
    if (group.marker) group.sameDayStatus = sameDayReviewStatus(group.records, group.marker);
  }
  return groups;
}
