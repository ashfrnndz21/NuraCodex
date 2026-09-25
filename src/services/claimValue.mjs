function tokens(text) {
  return [...String(text ?? '').matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    value: match[0].toLocaleLowerCase(),
    index: match.index,
    end: match.index + match[0].length,
  }));
}

function containsUnitTokens(valueTokens, unitTokens) {
  if (!unitTokens.length) return false;
  let cursor = 0;
  for (const unitToken of unitTokens) {
    const found = valueTokens.findIndex((valueToken, index) => index >= cursor && valueToken.value === unitToken.value);
    if (found < 0) return false;
    cursor = found + 1;
  }
  return true;
}

/** Join an extracted value and unit without repeating unit words already present in the value. */
export function formatClaimValue(value, unit) {
  const cleanValue = String(value ?? '').trim();
  const cleanUnit = String(unit ?? '').trim();
  if (!cleanUnit) return cleanValue;
  if (!cleanValue) return cleanUnit;

  const valueTokens = tokens(cleanValue);
  const unitTokens = tokens(cleanUnit);
  if (containsUnitTokens(valueTokens, unitTokens)) return cleanValue;

  const maxOverlap = Math.min(valueTokens.length, unitTokens.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const valueSuffix = valueTokens.slice(-overlap).map((token) => token.value);
    const unitPrefix = unitTokens.slice(0, overlap).map((token) => token.value);
    if (valueSuffix.every((token, index) => token === unitPrefix[index])) {
      const remainder = cleanUnit.slice(unitTokens[overlap - 1].end).trim().replace(/^[,·/–—-]+\s*/, '');
      return remainder ? `${cleanValue} ${remainder}` : cleanValue;
    }
  }

  return `${cleanValue} ${cleanUnit}`;
}
