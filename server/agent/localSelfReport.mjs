const HEALTH_TERMS = ['shortness of breath', 'headache', 'dizziness', 'dizzy', 'swelling', 'stiffness', 'stiff', 'pain', 'painful', 'fatigue', 'nausea', 'fever', 'cough'];
const MEASUREMENT_TERMS = ['blood pressure', 'cholesterol', 'glucose', 'blood sugar', 'weight', 'height', 'temperature', 'heart rate', 'pulse'];

function sentenceSpans(text) {
  return [...text.matchAll(/(?:[^.!?\n]|\.(?=\d))+[.!?]?/g)].map((match) => {
    const raw = match[0];
    const leading = raw.search(/\S/);
    const quote = raw.trim();
    return { quote, index: match.index + Math.max(0, leading) };
  }).filter(({ quote }) => quote.length > 0);
}

function withoutCalendarDates(text) {
  const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const naturalDate = new RegExp('\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+' + month + '\\.?\\s*,?\\s+\\d{4}|' + month + '\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*,?\\s+\\d{4})\\b', 'gi');
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => ' '.repeat(date.length))
    .replace(naturalDate, (date) => ' '.repeat(date.length));
}

function exactTerm(quote, terms) {
  const lower = quote.toLowerCase();
  const term = terms.find((item) => new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower));
  if (!term) return null;
  return quote.slice(lower.indexOf(term), lower.indexOf(term) + term.length);
}

/**
 * Local-only preview organizer. It makes no network/provider calls and returns
 * only quoted candidates; unsupported passages remain unknown.
 */
export function organizeSelfReportLocally(text) {
  const claims = [];
  const unknowns = [];
  for (const { quote } of sentenceSpans(text)) {
    if (quote.length > 240) {
      unknowns.push({ quote: quote.slice(0, 240), reason: 'unclear' });
      continue;
    }

    const measurementLabel = exactTerm(quote, MEASUREMENT_TERMS);
    const measurement = measurementLabel && new RegExp(`\\b${measurementLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.{0,40}?\\b(?:is|was|measured|read|at|of)?\\s*(\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+(?:[.,]\\d+)?)?)(?:\\s*(mmHg|mg\\s*\\/\\s*dL|mmol\\s*\\/\\s*L|kg|cm|bpm))?`, 'i').exec(withoutCalendarDates(quote));
    if (measurement) {
      const value = measurement[1];
      const unit = measurement[2] ?? null;
      const date = /\b\d{4}-\d{2}-\d{2}\b/.exec(quote)?.[0] ?? null;
      claims.push({ kind: 'measurement', label: measurementLabel, value, unit, effectiveAt: date, confidence: 0.7, quote });
      continue;
    }

    const directCondition = /\bI\s+was\s+diagnosed\s+with\s+([\p{L}][\p{L}\s-]{1,50}?)(?=\s+(?:in|on|at|by|when|after|before)\b|[,;.!?]|$)/iu.exec(quote);
    if (directCondition) {
      const value = directCondition[1].trim();
      if (value && quote.includes(value)) claims.push({ kind: 'reported_condition', label: value, value, unit: null, effectiveAt: null, confidence: 0.7, quote });
      else unknowns.push({ quote, reason: 'unclear' });
      continue;
    }

    const allergy = /\b(?:allergic\s+to|allergy\s+to)\s+([\p{L}][\p{L}-]{1,40})/iu.exec(quote);
    if (allergy) {
      const value = allergy[1];
      claims.push({ kind: 'allergy', label: value, value, unit: null, effectiveAt: null, confidence: 0.7, quote });
      continue;
    }

    const medicine = /\b(?:I\s+(?:take|use|am\s+taking)|taking)\s+([\p{L}][\p{L}-]{1,40})(?:\s+(\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|units?)))?/iu.exec(quote);
    if (medicine) {
      const label = medicine[1];
      const value = medicine[2] ?? label;
      claims.push({ kind: 'medication', label, value, unit: null, effectiveAt: null, confidence: 0.7, quote });
      continue;
    }

    const symptom = exactTerm(quote, HEALTH_TERMS);
    if (symptom && /\b(?:I|my|have|feel|experienc|notice|reported)\b/i.test(quote)) {
      claims.push({ kind: 'symptom', label: symptom, value: symptom, unit: null, effectiveAt: null, confidence: 0.65, quote });
      continue;
    }

    unknowns.push({ quote, reason: /\b(?:clinic|appointment|test|scan|report|visit)\b/i.test(quote) ? 'missing_detail' : 'unclear' });
  }
  return { claims: claims.slice(0, 20), unknowns: unknowns.slice(0, 12) };
}
