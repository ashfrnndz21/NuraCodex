/** Sliding-window limiter for bounded, provider-backed development requests. */
export function createRateLimiter({ windowMs = 60_000, defaultLimit = 8, now = Date.now } = {}) {
  const requestsByKey = new Map();
  return (key, limit = defaultLimit) => {
    const requestKey = typeof key === 'string' && key ? key : 'unknown';
    const currentTime = now();
    const recent = (requestsByKey.get(requestKey) ?? []).filter((timestamp) => currentTime - timestamp < windowMs);
    if (recent.length >= limit) {
      requestsByKey.set(requestKey, recent);
      return true;
    }
    recent.push(currentTime);
    requestsByKey.set(requestKey, recent);
    return false;
  };
}

/** Keep one client's budgets independent across API purposes while retaining per-purpose limits. */
export function createScopedRateLimiter(options = {}) {
  const limited = createRateLimiter(options);
  return (scope, clientKey, limit) => limited(`${String(scope || 'default')}:${String(clientKey || 'unknown')}`, limit);
}
