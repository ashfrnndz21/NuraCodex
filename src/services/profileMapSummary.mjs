function nonNegativeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export function profileMapSummary({ timelineItems = 0, selectedAreas = 0, selectedDetails = 0 } = {}) {
  const itemCount = nonNegativeCount(timelineItems);
  const areaCount = nonNegativeCount(selectedAreas);
  const detailCount = nonNegativeCount(selectedDetails);
  const itemLabel = itemCount === 1 ? 'current timeline item' : 'current timeline items';
  const areaLabel = areaCount === 1 ? 'chosen health area' : 'chosen health areas';
  const detailLabel = detailCount === 1 ? 'selected detail' : 'selected details';
  return `${itemCount} ${itemLabel} · ${areaCount} ${areaLabel}${detailCount ? ` · ${detailCount} ${detailLabel}` : ''}`;
}
