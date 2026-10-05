/**
 * Share one in-flight async initialization, but allow a later caller to retry
 * after it rejects. The old rejection must never clear a newer attempt.
 */
export function createRetryableAsyncResource(factory) {
  if (typeof factory !== 'function') throw new TypeError('An async resource needs an initializer.');
  let pending = null;

  return {
    get() {
      if (!pending) {
        const attempt = Promise.resolve().then(factory);
        const shared = attempt.catch((error) => {
          if (pending === shared) pending = null;
          throw error;
        });
        pending = shared;
      }
      return pending;
    },
    reset() {
      pending = null;
    },
  };
}
