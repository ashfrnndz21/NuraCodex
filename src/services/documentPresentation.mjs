import { getHealthAreaContext } from './healthAreaContext.mjs';

const fixtureNames = {
  'lipid-panel-jan-2025': 'Lipid panel · January 2025',
  'lipid-panel-apr-2025': 'Lipid panel · April 2025',
  'insurance-sample-standard-2025': 'Example policy · 2025',
  'insurance-independent-sample-2024': 'Independent example policy · 2024',
};

export function documentDisplayName(asset = {}, facts = []) {
  if (asset.localSampleFixtureId && fixtureNames[asset.localSampleFixtureId]) return fixtureNames[asset.localSampleFixtureId];
  const sourceFacts = asset.serverSourceId
    ? facts.filter((fact) => fact.sourceId === asset.serverSourceId
      && ['confirmed', 'reviewed'].includes(fact.status)
      && (fact.reviewState == null || fact.reviewState === 'user_confirmed')
      && !fact.validUntil)
    : [];
  if (documentIsInsurance(asset)) {
    if (sourceFacts.length) return 'Insurance policy · reviewed terms';
    return 'Insurance policy · review needed';
  }
  if (asset.kind === 'audio') return 'Audio recording · review not available yet';
  const categories = sourceFacts.map((fact) => `${fact.category ?? ''} ${fact.label ?? ''}`).join(' ').toLowerCase();
  if (/lipid|cholesterol|\bhdl\b|\bldl\b|triglyceride/.test(categories)) return datedTitle('Lipid panel', sourceFacts) ?? 'Lipid panel · reviewed results';
  if (/blood pressure|systolic|diastolic/.test(categories)) return datedTitle('Blood pressure record', sourceFacts) ?? 'Blood pressure record · reviewed results';
  if (/glucose|\ba1c\b|blood sugar/.test(categories)) return datedTitle('Blood sugar report', sourceFacts) ?? 'Blood sugar report · reviewed results';
  if (/lab|blood test|biomarker/.test(categories)) return datedTitle('Lab report', sourceFacts) ?? 'Lab report · reviewed results';
  if (/medicine|medication|prescription|treatment/.test(categories)) return 'Medication record · reviewed details';
  if (/visit|appointment|clinic|care/.test(categories)) return 'Care record · reviewed details';
  if (sourceFacts.length) {
    const area = getHealthAreaContext(asset.healthAreaId);
    return area && area.id !== 'other' ? `${area.label} record · reviewed details` : 'Health record · reviewed details';
  }
  const suggested = normalizeSuggestedType([asset.documentType, asset.name].filter(Boolean).join(' '), 'medical');
  if (suggested) return `${suggested} · review needed`;
  const area = getHealthAreaContext(asset.healthAreaId);
  if (area && area.id !== 'other') return `${area.label} record · review needed`;
  if (asset.kind === 'image') return 'Health image · review needed';
  if (asset.kind === 'video') return 'Health video · review needed';
  if (asset.kind === 'pdf') return 'Health report · review needed';
  return 'Health document · review needed';
}

/** Use the upload purpose first, then strong, non-identifying document-type hints. */
export function documentIsInsurance(asset = {}) {
  if (asset.purpose === 'insurance') return true;
  const hint = [asset.documentType, asset.name].filter((value) => typeof value === 'string').join(' ').toLowerCase();
  return /\b(?:insurance|policy|coverage|benefits?)(?:\s+(?:summary|schedule|document|statement))?\b/.test(hint);
}

function normalizeSuggestedType(value, purpose) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const type = value.trim().toLowerCase();
  if (purpose === 'insurance') {
    if (/policy|benefit|coverage|insurance|schedule/.test(type)) return 'Policy document';
    return null;
  }
  if (/lipid|cholesterol|hdl|ldl|triglyceride/.test(type)) return 'Lipid panel';
  if (/blood pressure|systolic|diastolic/.test(type)) return 'Blood pressure record';
  if (/glucose|a1c|blood sugar/.test(type)) return 'Blood sugar report';
  if (/laboratory|lab report|blood test|biomarker/.test(type)) return 'Lab report';
  if (/prescription|medication|medicine/.test(type)) return 'Medication record';
  if (/visit|appointment|clinic|care note/.test(type)) return 'Care record';
  return null;
}

function datedTitle(label, sourceFacts) {
  const periods = [...new Set(sourceFacts.map((fact) => monthYear(fact.date)).filter(Boolean))].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  if (!periods.length) return null;
  const first = periods[0].label;
  const last = periods.at(-1).label;
  return `${label} · ${first === last ? first : `${first}–${last}`}`;
}

function monthYear(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  return {
    sortKey: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed),
  };
}

export function documentOriginalName(asset = {}) {
  return typeof asset.name === 'string' && asset.name.trim() ? asset.name.trim() : 'Original filename unavailable';
}
