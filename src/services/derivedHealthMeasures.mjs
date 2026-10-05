const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function dateOnly(value) {
  const match = ISO_DAY.exec(String(value ?? '').trim());
  if (!match) return '';
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : '';
}

function measure(value, allowedUnits) {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(kg|lb|cm|m|in|inch|inches)\s*$/i.exec(String(value ?? ''));
  if (!match) return null;
  const number = Number(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(number) || number <= 0 || !allowedUnits.includes(unit)) return null;
  return { number, unit };
}

function usableFact(fact) {
  return fact && !fact.validUntil && fact.versionStatus !== 'earlier' && fact.reviewState !== 'user_retracted'
    && ['confirmed', 'reviewed'].includes(fact.status);
}

function weightKg(value) {
  const parsed = measure(value, ['kg', 'lb']);
  if (!parsed) return null;
  const kg = parsed.unit === 'lb' ? parsed.number * 0.45359237 : parsed.number;
  return kg >= 1 && kg <= 400 ? kg : null;
}

function heightM(value) {
  const parsed = measure(value, ['cm', 'm', 'in', 'inch', 'inches']);
  if (!parsed) return null;
  const meters = parsed.unit === 'cm' ? parsed.number / 100
    : parsed.unit === 'in' || parsed.unit === 'inch' || parsed.unit === 'inches' ? parsed.number * 0.0254
      : parsed.number;
  return meters >= 0.5 && meters <= 2.75 ? meters : null;
}

/** Calculate BMI only when one confirmed height and weight share a measurement date. */
export function deriveBmiFromFacts(facts = []) {
  const byDay = new Map();
  for (const fact of Array.isArray(facts) ? facts : []) {
    if (!usableFact(fact)) continue;
    const day = dateOnly(fact.date);
    if (!day) continue;
    const label = String(fact.label ?? '').normalize('NFKC').toLowerCase();
    const value = String(fact.value ?? '');
    const weight = /\bweight\b/.test(label) ? weightKg(value) : null;
    const height = /\bheight\b/.test(label) ? heightM(value) : null;
    if (!weight && !height) continue;
    const entry = byDay.get(day) ?? { weights: [], heights: [] };
    if (weight) entry.weights.push({ number: weight, id: String(fact.id ?? '') });
    if (height) entry.heights.push({ number: height, id: String(fact.id ?? '') });
    byDay.set(day, entry);
  }

  const day = [...byDay.keys()].filter((key) => byDay.get(key).weights.length && byDay.get(key).heights.length).sort().at(-1);
  if (!day) return null;
  const measurements = byDay.get(day);
  if (measurements.weights.length !== 1 || measurements.heights.length !== 1
    || !measurements.weights[0].id || !measurements.heights[0].id) return null;
  const bmi = measurements.weights[0].number / (measurements.heights[0].number ** 2);
  if (!Number.isFinite(bmi) || bmi < 8 || bmi > 100) return null;
  return {
    measurementDate: day,
    bmi: Math.round(bmi * 10) / 10,
    bmiRaw: bmi,
    weightKg: measurements.weights[0].number,
    heightM: measurements.heights[0].number,
    weightFactId: measurements.weights[0].id,
    heightFactId: measurements.heights[0].id,
  };
}

/** Compute age for those measurements without sending the saved date of birth. */
export function ageAtDateOfBirth(birthday, measurementDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthday ?? '').trim())) return null;
  const born = dateOnly(birthday);
  const measured = dateOnly(measurementDate);
  if (!born || !measured || measured < born) return null;
  const [birthYear, birthMonth, birthDay] = born.split('-').map(Number);
  const [year, month, day] = measured.split('-').map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function deriveAgeForMeasurements(birthday, facts = []) {
  const measurements = deriveBmiFromFacts(facts);
  if (!measurements) return null;
  const age = ageAtDateOfBirth(birthday, measurements.measurementDate);
  return age === null ? null : { ageAtMeasurement: age, measurementDate: measurements.measurementDate };
}
