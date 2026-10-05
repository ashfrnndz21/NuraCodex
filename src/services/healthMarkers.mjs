import { parseHealthDate } from '../utils/healthDate.mjs';

const markerGroups = [
  { match: /cholesterol|lipid|\bldl\b|\bhdl\b|triglyceride|apolipoprotein|\bapo\s*b\b/i, markers: [
    { label: 'Total cholesterol', unit: 'mg/dL' }, { label: 'LDL cholesterol', unit: 'mg/dL' },
    { label: 'HDL cholesterol', unit: 'mg/dL' }, { label: 'Triglycerides', unit: 'mg/dL' },
    { label: 'Non-HDL cholesterol', unit: 'mg/dL' }, { label: 'Apolipoprotein B (ApoB)', unit: 'mg/dL' },
  ] },
  { match: /blood pressure|\bsystolic\b|\bdiastolic\b|hypertension/i, markers: [
    { label: 'Systolic blood pressure', unit: 'mmHg' }, { label: 'Diastolic blood pressure', unit: 'mmHg' }, { label: 'Resting pulse', unit: 'bpm' },
  ] },
  { match: /blood sugar|glucose|diabetes|\ba1c\b/i, markers: [
    { label: 'HbA1c', unit: '%' }, { label: 'Fasting glucose', unit: 'mg/dL' }, { label: 'Blood glucose', unit: 'mg/dL' },
  ] },
  { match: /heart|cardiac|cardiovascular/i, markers: [
    { label: 'Resting heart rate', unit: 'bpm' }, { label: 'Heart rate', unit: 'bpm' },
  ] },
  { match: /weight|body composition/i, markers: [{ label: 'Weight', unit: 'kg' }, { label: 'Waist circumference', unit: 'cm' }] },
  { match: /sleep/i, markers: [{ label: 'Sleep duration', unit: 'hours' }] },
];

export function getHealthMarkersForTopic(topicLabel) {
  const group = markerGroups.find((item) => item.match.test(String(topicLabel ?? '')));
  return group ? group.markers.map((item) => ({ ...item })) : [{ label: 'Health marker', unit: '' }];
}

export function canonicalHealthMarker(label) {
  const value = String(label ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (/\b(?:apo b|apolipoprotein b)\b/.test(value)) return 'apob';
  if (/\bnon hdl\b/.test(value)) return 'non-hdl';
  if (/\btriglycerides?\b/.test(value)) return 'triglycerides';
  if (/\bldl\b/.test(value)) return 'ldl';
  if (/\bhdl\b/.test(value)) return 'hdl';
  if (/\btotal cholesterol\b/.test(value)) return 'total-cholesterol';
  // Keep an unqualified cholesterol label visible without assuming it is total cholesterol.
  if (/\bcholesterol\b/.test(value)) return 'cholesterol-unspecified';
  if (/\b(?:systolic|sbp)\b/.test(value)) return 'systolic';
  if (/\b(?:diastolic|dbp)\b/.test(value)) return 'diastolic';
  if (/\b(?:hba1c|a1c|glycated hemoglobin)\b/.test(value)) return 'hba1c';
  if (/\b(?:fasting glucose|fasting blood sugar)\b/.test(value)) return 'fasting-glucose';
  if (/\b(?:blood glucose|blood sugar|glucose)\b/.test(value)) return 'glucose';
  if (/\b(?:resting heart rate|resting pulse)\b/.test(value)) return 'resting-heart-rate';
  if (/\b(?:heart rate|pulse)\b/.test(value)) return 'heart-rate';
  if (/\bweight\b/.test(value)) return 'weight';
  if (/\bwaist circumference\b/.test(value)) return 'waist';
  if (/\bsleep duration\b/.test(value)) return 'sleep-duration';
  return null;
}

/** Restrict common manual entries to the two units people are most likely to see on a lab report. */
export function getHealthMarkerUnitOptions(label) {
  const marker = canonicalHealthMarker(label);
  if (['total-cholesterol', 'ldl', 'hdl', 'non-hdl', 'triglycerides', 'glucose', 'fasting-glucose'].includes(marker ?? '')) return ['mg/dL', 'mmol/L'];
  if (marker === 'hba1c') return ['%', 'mmol/mol'];
  if (marker === 'apob') return ['mg/dL', 'g/L'];
  if (marker === 'weight') return ['kg', 'lb'];
  if (marker === 'waist') return ['cm', 'in'];
  if (marker === 'sleep-duration') return ['hours', 'minutes'];
  if (['systolic', 'diastolic'].includes(marker ?? '')) return ['mmHg'];
  if (['resting-heart-rate', 'heart-rate'].includes(marker ?? '')) return ['bpm'];
  return [];
}

/** HbA1c is shown without interpretation when its reported unit is missing or unfamiliar. */
export function healthMarkerUnitNeedsReview(label, unit) {
  const marker = canonicalHealthMarker(label);
  const normalized = String(unit ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (marker === 'hba1c') return !['%', 'percent', 'mmol/mol'].includes(normalized);
  if (marker === 'systolic' || marker === 'diastolic') return normalized !== 'mmhg';
  if (marker === 'resting-heart-rate' || marker === 'heart-rate') return normalized !== 'bpm';
  return false;
}

/** Keep values with a recognized unit from receiving a misleading guide when the pairing is implausible. */
export function healthMarkerValueNeedsReview(label, value) {
  const marker = canonicalHealthMarker(label);
  const measure = parsedMeasure(value);
  if (!measure || measure.number < 0) return false;
  if (marker === 'hba1c' && measure.unit === 'mmol/mol' && measure.number < 20) return true;
  if (marker === 'total-cholesterol' && measure.unit === 'mg/dl' && measure.number < 20) return true;
  if (marker === 'triglycerides' && measure.unit === 'mg/dl' && measure.number < 10) return true;
  return false;
}

/** Convert IFCC HbA1c (mmol/mol) to NGSP percent using the NGSP master equation. */
export function convertHba1cIfccToNgspPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? (0.09148 * number) + 2.152 : null;
}

/** Returns one current numeric snapshot per marker, newest first. */
export function selectLatestMarkerSnapshots(facts = []) {
  const seenMarkers = new Set();
  return [...facts]
    .sort((a, b) => (parseHealthDate(b.date)?.getTime() ?? 0) - (parseHealthDate(a.date)?.getTime() ?? 0))
    .filter((fact) => {
      if (!fact || fact.validUntil || fact.reviewState === 'user_retracted'
        || !/^-?\d+(?:[.,]\d+)?\s*.*$/.test(String(fact.value ?? '').trim())) return false;
      const marker = canonicalHealthMarker(fact.label);
      if (!marker || seenMarkers.has(marker)) return false;
      seenMarkers.add(marker);
      return true;
    });
}

/** Keep the newest reading first, then surface a saved cholesterol result in Home's initial preview. */
export function selectHomeMarkerSnapshots(facts = []) {
  const snapshots = selectLatestMarkerSnapshots(facts);
  const cholesterolIndex = snapshots.findIndex((fact) => ['total-cholesterol', 'cholesterol-unspecified'].includes(canonicalHealthMarker(fact.label)));
  if (cholesterolIndex > 1) {
    const [cholesterol] = snapshots.splice(cholesterolIndex, 1);
    snapshots.splice(1, 0, cholesterol);
  }
  return snapshots;
}

const adultLipidGuides = {
  'total-cholesterol': {
    max: 300, factor: 38.67, boundaries: [200, 240],
    categories: [
      { below: 200, label: 'DESIRABLE', color: '#79C99F' },
      { below: 240, label: 'BORDERLINE HIGH', color: '#E9BE70' },
      { label: 'HIGH', color: '#E47D72' },
    ],
    ticks: [{ at: 0, convert: 200, label: '<200', align: 'start' }, { at: 200, label: '200' }, { at: 240, label: '240+' }],
    caption: 'Common adult guide · personal targets vary',
  },
  ldl: {
    max: 220, factor: 38.67, boundaries: [100, 130, 160, 190],
    categories: [
      { below: 100, label: 'OPTIMAL', color: '#79C99F' },
      { below: 130, label: 'NEAR OPTIMAL', color: '#9ACD9F' },
      { below: 160, label: 'BORDERLINE HIGH', color: '#E9BE70' },
      { below: 190, label: 'HIGH', color: '#E99A6E' },
      { label: 'VERY HIGH', color: '#E47D72' },
    ],
    ticks: [{ at: 0, convert: 100, label: '<100', align: 'start' }, { at: 100, label: '100' }, { at: 130, label: '130' }, { at: 160, label: '160' }, { at: 190, label: '190+' }],
    caption: 'Common adult guide · personal LDL goals vary',
  },
  triglycerides: {
    max: 600, factor: 88.57, boundaries: [150, 200, 500],
    categories: [
      { below: 150, label: 'NORMAL', color: '#79C99F' },
      { below: 200, label: 'BORDERLINE HIGH', color: '#E9BE70' },
      { below: 500, label: 'HIGH', color: '#E99A6E' },
      { label: 'VERY HIGH', color: '#E47D72' },
    ],
    ticks: [{ at: 0, convert: 150, label: '<150', align: 'start' }, { at: 150, label: '150' }, { at: 200, label: '200' }, { at: 500, label: '500+' }],
    caption: 'Common adult guide · personal targets vary',
  },
  hdl: {
    max: 100, factor: 38.67, boundaries: [40, 60],
    categories: [
      { below: 40, label: 'LOW UNDER COMMON GUIDE', color: '#E47D72' },
      { below: 60, label: 'COMPARE WITH REPORT', color: '#E9BE70' },
      { label: '60+ · GENERALLY BEST', color: '#79C99F' },
    ],
    ticks: [{ at: 0, label: '0', align: 'start' }, { at: 40, label: '40–50' }, { at: 60, label: '60' }, { at: 100, label: '100+', align: 'end' }],
    caption: 'HDL low cutoffs vary by sex; use the range on your report',
  },
};

const adultSystolicGuide = {
  max: 200, boundaries: [90, 120, 130, 140],
  categories: [
    { below: 90, label: 'UNDER 90', color: '#E47D72' },
    { below: 120, label: 'UNDER 120', color: '#79C99F' },
    { below: 130, label: '120–129', color: '#E9BE70' },
    { below: 140, label: '130–139', color: '#E99A6E' },
    { label: '140+', color: '#E47D72' },
  ],
  ticks: [
    { at: 0, label: '<90', align: 'start' }, { at: 90, label: '90' }, { at: 120, label: '120', row: 1 },
    { at: 130, label: '130' }, { at: 140, label: '140+', align: 'end', row: 1 },
  ],
  caption: 'Systolic only · common adult guide; full BP needs both numbers',
};

function ageAt(birthday, eventDate) {
  const born = parseHealthDate(String(birthday ?? ''));
  const measured = parseHealthDate(String(eventDate ?? ''));
  if (!born || !measured || measured < born) return null;
  let age = measured.getFullYear() - born.getFullYear();
  if (measured.getMonth() < born.getMonth() || (measured.getMonth() === born.getMonth() && measured.getDate() < born.getDate())) age -= 1;
  return age;
}

function cholesterolValue(label, value) {
  const measure = parsedMeasure(value);
  if (!measure || measure.number < 0) return null;
  const guide = adultLipidGuides[canonicalHealthMarker(label)];
  if (!guide) return null;
  if (measure.unit === 'mg/dl') return { value: measure.number, unit: 'mg/dL' };
  if (measure.unit === 'mmol/l') return { value: measure.number * guide.factor, unit: 'mmol/L' };
  return null;
}

/** General adult lipid guide only; it is not a personal target or diagnosis. */
export function getHealthMarkerRangeGuide({ label, value, birthday, eventDate, ageAtMeasurement, allowAdultGuideWhenAgeUnknown = false }) {
  const marker = canonicalHealthMarker(label);
  if (healthMarkerValueNeedsReview(label, value)) return null;
  const guide = adultLipidGuides[marker] ?? (marker === 'systolic' ? adultSystolicGuide : null);
  const age = Number.isInteger(ageAtMeasurement) ? ageAtMeasurement : ageAt(birthday, eventDate);
  if ((age == null && !allowAdultGuideWhenAgeUnknown) || (age != null && age < 20)) return null;
  if (!guide && marker !== 'hba1c' && marker !== 'fasting-glucose') return null;
  let parsed = guide ? cholesterolValue(label, value) : null;
  let ticks = guide?.ticks;
  let max = guide?.max;
  let boundaries = guide?.boundaries;
  let categories = guide?.categories;
  let caption = guide?.caption;

  if (marker === 'hba1c' || marker === 'fasting-glucose') {
    const measure = parsedMeasure(value);
    if (!measure || measure.number < 0) return null;
    const unit = measure.unit;
    if (marker === 'hba1c') {
      if (!['%', 'percent', 'mmol/mol'].includes(unit)) return null;
      const percent = unit === 'mmol/mol' ? convertHba1cIfccToNgspPercent(measure.number) : measure.number;
      parsed = { value: percent, unit: unit === 'mmol/mol' ? 'mmol/mol' : '%' };
      max = 10;
      boundaries = [5.7, 6.5];
      categories = [
        { below: 5.7, label: 'BELOW COMMON CUTOFF', color: '#79C99F' },
        { below: 6.5, label: 'AT-RISK RANGE', color: '#E9BE70' },
        { label: 'ABOVE DIAGNOSTIC CUTOFF', color: '#E47D72' },
      ];
      ticks = parsed.unit === '%' ? [
        { at: 0, label: '<5.7', align: 'start' }, { at: 5.7, label: '5.7' }, { at: 6.5, label: '6.5+' },
      ] : [
        { at: 0, label: '<39', align: 'start' }, { at: 5.7, label: '39', convert: 5.7 }, { at: 6.5, label: '48+', convert: 6.5 },
      ];
      caption = 'Common adult screening guide · not a diagnosis';
    } else {
      if (!['mg/dl', 'mmol/l'].includes(unit)) return null;
      const mgPerDl = unit === 'mmol/l' ? measure.number * 18.018 : measure.number;
      parsed = { value: mgPerDl, unit: unit === 'mmol/l' ? 'mmol/L' : 'mg/dL' };
      max = 250;
      boundaries = [100, 126];
      categories = [
        { below: 100, label: 'BELOW COMMON CUTOFF', color: '#79C99F' },
        { below: 126, label: 'IMPAIRED FASTING RANGE', color: '#E9BE70' },
        { label: 'ABOVE DIAGNOSTIC CUTOFF', color: '#E47D72' },
      ];
      ticks = parsed.unit === 'mg/dL' ? [
        { at: 0, label: '<100', align: 'start' }, { at: 100, label: '100' }, { at: 126, label: '126+' },
      ] : [
        { at: 0, label: '<5.6', align: 'start' }, { at: 100, label: '5.6', convert: 100 }, { at: 126, label: '7.0+', convert: 126 },
      ];
      caption = 'Fasting adult screening guide · not a diagnosis';
    }
  } else if (marker === 'systolic') {
    const measure = parsedMeasure(value);
    if (!measure || measure.unit !== 'mmhg') return null;
    parsed = { value: measure.number, unit: 'mmHg' };
    max = guide.max;
    boundaries = guide.boundaries;
    categories = guide.categories;
    ticks = guide.ticks;
    caption = guide.caption;
  }
  if (!parsed) return null;
  const category = categories.find((item) => item.below == null || parsed.value < item.below) ?? categories.at(-1);
  const segments = [];
  let previous = 0;
  for (const boundary of [...boundaries, max]) {
    const widthPercent = Math.max(0, Math.min(100, ((boundary - previous) / max) * 100));
    const segmentCategory = categories.find((item) => item.below == null || previous < item.below);
    segments.push({ widthPercent, color: segmentCategory?.color ?? '#79C99F' });
    previous = boundary;
  }
  const positionPercent = Math.max(0, Math.min(100, (Math.min(max, parsed.value) / max) * 100));
  const formatTick = (tick) => {
    if (marker === 'hba1c' && parsed.unit === 'mmol/mol' && tick.convert != null) {
      return String(Math.round((tick.convert - 2.152) / 0.09148)) + (tick.label.endsWith('+') ? '+' : '');
    }
    if (marker === 'fasting-glucose' && parsed.unit === 'mmol/L' && tick.convert != null) {
      return (tick.convert / 18.018).toFixed(1) + (tick.label.endsWith('+') ? '+' : '');
    }
    const threshold = tick.convert ?? tick.at;
    if (parsed.unit !== 'mmol/L' || threshold === 0) return tick.label;
    const converted = (threshold / guide.factor).toFixed(1);
    if (tick.label.startsWith('<')) return '<' + converted;
    if (tick.label.endsWith('+')) return converted + '+';
    if (tick.label.includes('–')) return (40 / guide.factor).toFixed(1) + '–' + (50 / guide.factor).toFixed(1);
    return (tick.at / guide.factor).toFixed(1);
  };
  return {
    status: category.label,
    statusColor: category.color,
    unit: parsed.unit,
    positionPercent,
    segments,
    ticks: ticks.map((tick) => ({ ...tick, positionPercent: (tick.at / max) * 100, label: formatTick(tick) })),
    caption,
  };
}

function dateKey(value) {
  const parsed = parseHealthDate(String(value ?? ''));
  if (!parsed) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function parsedMeasure(value, explicitUnit = '') {
  const text = String(value ?? '').trim();
  const match = text.match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const number = Number(match[0].replace(',', '.'));
  if (!Number.isFinite(number)) return null;
  const suffix = text.slice((match.index ?? 0) + match[0].length).trim();
  return { number, unit: normalizeUnit(explicitUnit || suffix) };
}

function normalizeUnit(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, '').replace(/milligrams?/g, 'mg').replace(/deciliters?/g, 'dl').replace(/millimoles?/g, 'mmol').replace(/liters?/g, 'l').replace(/millimeters?/g, 'mm').replace(/mercury/g, 'hg');
}

function measureInComparableUnit(label, measure) {
  if (!measure?.unit) return null;
  const key = canonicalHealthMarker(label);
  const mgToMmol = key === 'triglycerides' ? 88.57 : key === 'glucose' || key === 'fasting-glucose' ? 18.018 : 38.67;
  if (measure.unit === 'mg/dl') return { unit: 'mg/dl', number: measure.number };
  if (measure.unit === 'mmol/l' && ['ldl', 'hdl', 'total-cholesterol', 'non-hdl', 'triglycerides', 'glucose', 'fasting-glucose'].includes(key)) return { unit: 'mg/dl', number: measure.number * mgToMmol };
  return { unit: measure.unit, number: measure.number };
}

/** Finds only a same-marker, same-calendar-day difference with compatible units. */
export function findHealthMarkerDiscrepancy({ label, value, unit, eventDate, facts = [] }) {
  const marker = canonicalHealthMarker(label);
  const day = dateKey(eventDate);
  const entered = measureInComparableUnit(label, parsedMeasure(value, unit));
  if (!marker || !day || !entered) return null;
  for (const fact of facts) {
    if (!fact || fact.validUntil || fact.reviewState === 'user_retracted'
      || (fact.reviewState != null && fact.reviewState !== 'user_confirmed')
      || !['confirmed', 'reviewed'].includes(fact.status)) continue;
    if (canonicalHealthMarker(fact.label) !== marker || dateKey(fact.date) !== day) continue;
    const saved = measureInComparableUnit(fact.label, parsedMeasure(fact.value));
    if (!saved || saved.unit !== entered.unit) continue;
    const tolerance = Math.max(0.0001, Math.abs(entered.number) * 0.000001);
    if (Math.abs(saved.number - entered.number) > tolerance) return { fact, enteredValue: value, enteredUnit: unit, date: day };
  }
  return null;
}
