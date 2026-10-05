import { canonicalHealthMarker } from './healthMarkers.mjs';
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

function hasSameDayDifferences(records) {
  const byDate = new Map();
  for (const record of records) {
    const day = eventDay(record.date);
    if (!day) continue;
    const values = byDate.get(day) ?? new Set();
    values.add(String(record.detail ?? '').trim());
    byDate.set(day, values);
  }
  return [...byDate.values()].some((values) => values.size > 1);
}

/** Group marker facts into one registry concept while retaining every dated, source-linked reading. */
export function groupRegistryMarkerHistory(items = []) {
  const groups = [];
  const markerGroups = new Map();

  for (const item of items) {
    const marker = item?.kind === 'fact' ? canonicalHealthMarker(item.title) : null;
    if (!marker || !markerNames[marker] || !numericValue.test(String(item.detail ?? '').trim())) {
      groups.push({ id: `record:${item?.id ?? groups.length}`, marker: null, title: String(item?.title ?? 'Saved detail'), records: [item], hasSameDayDifferences: false });
      continue;
    }

    let group = markerGroups.get(marker);
    if (!group) {
      group = { id: `marker:${marker}`, marker, title: markerNames[marker], records: [], hasSameDayDifferences: false };
      markerGroups.set(marker, group);
      groups.push(group);
    }
    group.records.push(item);
  }

  for (const group of groups) {
    if (group.marker) group.hasSameDayDifferences = hasSameDayDifferences(group.records);
  }
  return groups;
}
