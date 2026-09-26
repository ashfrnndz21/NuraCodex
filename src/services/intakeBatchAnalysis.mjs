function normalizeLabel(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function normalizeUnit(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeValue(value) {
  const text = String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');
  const numeric = Number(text);
  return text !== '' && Number.isFinite(numeric) ? `number:${numeric}` : `text:${text.replace(/\s+/g, ' ')}`;
}

function dateKey(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) return '';
  const day = text.slice(0, 10);
  const parsed = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === day ? day : '';
}

function sourceDateContext(items, sourceId, sourceName) {
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const kind = String(item?.kind ?? '');
    const value = String(item?.value ?? '').trim();
    if (!value || !['collected_at', 'report_date'].includes(kind)) return [];
    return [{ kind, value, sourceId, sourceName }];
  });
}

function documentDatesFor(claims) {
  const unique = new Map();
  for (const claim of claims) {
    for (const item of claim.documentDates) {
      unique.set(`${item.sourceId}\u0000${item.kind}\u0000${item.value}`, item);
    }
  }
  return [...unique.values()];
}

/** Compare claims from distinct source files; findings are prompts for review, never merges or diagnoses. */
export function analyzeIntakeBatch(sources) {
  const claims = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const sourceId = String(source?.sourceId ?? '');
    if (!sourceId) continue;
    const sourceName = String(source.sourceName || sourceId);
    const documentDates = sourceDateContext(source.documentDates, sourceId, sourceName);
    for (const claim of Array.isArray(source.claims) ? source.claims : []) {
      if (!claim?.id || !['candidate', 'needs_review', 'user_confirmed'].includes(claim.evidenceState)) continue;
      const label = normalizeLabel(claim.label);
      const value = normalizeValue(claim.value);
      if (!label || value === 'text:') continue;
      claims.push({
        id: String(claim.id),
        sourceId,
        sourceName,
        documentDates,
        label: String(claim.label),
        valueText: String(claim.value),
        valueKey: value,
        unitKey: normalizeUnit(claim.unit),
        eventDate: dateKey(claim.effectiveAt),
        labelKey: label,
      });
    }
  }

  const fields = new Map();
  for (const claim of claims) {
    const key = `${claim.labelKey}\u0000${claim.unitKey}`;
    const group = fields.get(key) ?? [];
    group.push(claim);
    fields.set(key, group);
  }

  const findings = [];
  for (const group of fields.values()) {
    const byValue = new Map();
    for (const claim of group) {
      const values = byValue.get(claim.valueKey) ?? [];
      values.push(claim);
      byValue.set(claim.valueKey, values);
    }
    for (const sameValue of byValue.values()) {
      const distinctSources = new Set(sameValue.map((claim) => claim.sourceId));
      if (distinctSources.size < 2) continue;
      const dates = new Set(sameValue.map((claim) => claim.eventDate));
      const oneKnownDate = dates.size === 1 && !dates.has('');
      findings.push({
        id: `repeat:${sameValue.map((claim) => claim.id).sort().join('|')}`,
        kind: oneKnownDate ? 'same_date_match' : 'possible_repeat',
        label: sameValue[0].label,
        unit: sameValue[0].unitKey || null,
        values: [...new Set(sameValue.map((claim) => claim.valueText))],
        eventDates: [...dates].filter(Boolean).sort(),
        claimIds: [...new Set(sameValue.map((claim) => claim.id))].sort(),
        sources: [...new Map(sameValue.map((claim) => [claim.sourceId, { id: claim.sourceId, name: claim.sourceName }])).values()],
        documentDates: documentDatesFor(sameValue),
      });
    }

    const differentValues = new Set(group.map((claim) => claim.valueKey));
    if (differentValues.size > 1) {
      const uncertainPairs = [];
      for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
          const left = group[leftIndex]; const right = group[rightIndex];
          if (left.sourceId !== right.sourceId && left.valueKey !== right.valueKey && (!left.eventDate || !right.eventDate)) uncertainPairs.push([left, right]);
        }
      }
      if (uncertainPairs.length) {
        const involved = [...new Map(uncertainPairs.flat().map((claim) => [claim.id, claim])).values()];
        findings.push({
          id: `date_uncertain_difference:${involved.map((claim) => claim.id).sort().join('|')}`,
          kind: 'date_uncertain_difference',
          label: involved[0].label,
          unit: involved[0].unitKey || null,
          values: [...new Set(involved.map((claim) => claim.valueText))],
          eventDates: [...new Set(involved.map((claim) => claim.eventDate).filter(Boolean))].sort(),
          claimIds: involved.map((claim) => claim.id).sort(),
          sources: [...new Map(involved.map((claim) => [claim.sourceId, { id: claim.sourceId, name: claim.sourceName }])).values()],
          documentDates: documentDatesFor(involved),
        });
      }
    }

    const byDate = new Map();
    for (const claim of group) {
      if (!claim.eventDate) continue;
      const dated = byDate.get(claim.eventDate) ?? [];
      dated.push(claim);
      byDate.set(claim.eventDate, dated);
    }
    for (const [eventDate, dated] of byDate) {
      const distinctSources = new Set(dated.map((claim) => claim.sourceId));
      const distinctValues = new Set(dated.map((claim) => claim.valueKey));
      if (distinctSources.size < 2 || distinctValues.size < 2) continue;
      findings.push({
        id: `conflict:${eventDate}:${[...new Set(dated.map((claim) => claim.id))].sort().join('|')}`,
        kind: 'same_date_difference',
        label: dated[0].label,
        unit: dated[0].unitKey || null,
        values: [...new Set(dated.map((claim) => claim.valueText))],
        eventDates: [eventDate],
        claimIds: [...new Set(dated.map((claim) => claim.id))].sort(),
        sources: [...new Map(dated.map((claim) => [claim.sourceId, { id: claim.sourceId, name: claim.sourceName }])).values()],
        documentDates: documentDatesFor(dated),
      });
    }
  }

  return findings.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}
