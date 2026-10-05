/** Tracks provider-backed demo work so privacy withdrawal can stop active runs. */
export class InFlightProcessing {
  #operations = new Map();
  #nextId = 0;

  begin({ profileId, purposes = [] } = {}) {
    if (typeof profileId !== 'string' || !profileId.trim()) throw new TypeError('A processing operation needs a profile scope.');
    const controller = new AbortController();
    const id = ++this.#nextId;
    const operation = { controller, profileId, purposes: new Set(purposes.filter((item) => typeof item === 'string' && item)) };
    this.#operations.set(id, operation);
    let finished = false;
    return {
      signal: controller.signal,
      addPurposes: (additionalPurposes) => {
        if (finished) return;
        for (const purpose of additionalPurposes) if (typeof purpose === 'string' && purpose) operation.purposes.add(purpose);
      },
      abort: () => controller.abort(),
      finish: () => {
        if (finished) return;
        finished = true;
        this.#operations.delete(id);
      },
    };
  }

  abortPurposes(profileId, purposes) {
    const requested = new Set(purposes);
    let aborted = 0;
    for (const operation of this.#operations.values()) {
      if (operation.profileId !== profileId || operation.controller.signal.aborted) continue;
      if (![...operation.purposes].some((purpose) => requested.has(purpose))) continue;
      operation.controller.abort();
      aborted += 1;
    }
    return aborted;
  }
}
