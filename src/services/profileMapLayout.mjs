/**
 * Keep the onboarding map and its count responsive to the actual focus areas.
 * Four or fewer use the compact orbit; larger selections flow into a three
 * column grid whose height grows with the number of chosen areas.
 */
export function createProfileMapLayout(count, width) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const safeWidth = Number.isFinite(width) ? Math.max(240, width) : 320;
  const expanded = safeCount > 4;
  const columnWidth = safeWidth / 3;
  const centerX = safeWidth / 2;
  const centerY = expanded ? 78 : 82;
  const left = 2;
  const right = safeWidth - 80;
  const middle = centerX - 39;
  const rowCount = Math.ceil(safeCount / 3);
  const graphHeight = expanded ? 92 + rowCount * 78 : 185;

  let slots;
  if (expanded) {
    slots = Array.from({ length: safeCount }, (_, index) => ({
      left: (index % 3) * columnWidth,
      top: 92 + Math.floor(index / 3) * 78,
    }));
  } else if (safeCount === 0) {
    slots = [];
  } else if (safeCount === 1) {
    slots = [{ left: middle, top: 0 }];
  } else if (safeCount === 2) {
    slots = [{ left, top: 0 }, { left: right, top: 0 }];
  } else if (safeCount === 3) {
    slots = [{ left, top: 0 }, { left: right, top: 0 }, { left: middle, top: 127 }];
  } else {
    slots = [{ left, top: 0 }, { left: right, top: 0 }, { left, top: 127 }, { left: right, top: 127 }];
  }

  return {
    expanded,
    graphHeight,
    centerX,
    centerY,
    nodeWidth: expanded ? columnWidth : 78,
    nodeDiameter: expanded ? 36 : 42,
    slots,
  };
}
