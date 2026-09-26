import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DEMO_PROFILE_ID } from '../contracts.mjs';
import { normalizeReviewEventDate } from '../../src/utils/healthDate.mjs';

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.nura-dev');
const EMPTY = () => ({ schemaVersion: 1, sources: [], claims: [], assertions: [], runEvents: [] });
const clone = (value) => structuredClone(value);

export class LocalDemoRepository {
  #dir;
  #file;
  #state;
  #loadPromise;
  #queue = Promise.resolve();

  constructor(directory = process.env.NURA_DEMO_DATA_DIR || DEFAULT_DIR) {
    this.#dir = directory;
    this.#file = join(directory, 'repository.json');
  }

  async #load() {
    if (!this.#loadPromise) this.#loadPromise = (async () => {
      await mkdir(this.#dir, { recursive: true, mode: 0o700 });
      try {
        const parsed = JSON.parse(await readFile(this.#file, 'utf8'));
        this.#state = { ...EMPTY(), ...parsed };
      } catch (error) {
        if (error?.code !== 'ENOENT') throw new Error('The local demo repository could not be read.');
        this.#state = EMPTY();
        await this.#write(this.#state);
      }
      return this.#state;
    })();
    return this.#loadPromise;
  }

  async #write(state) {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
    const temporary = join(this.#dir, `.repository-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.#file);
  }

  async #read(select) {
    await this.#queue;
    const state = await this.#load();
    return clone(select(state));
  }

  async #mutate(change) {
    const operation = this.#queue.then(async () => {
      const current = await this.#load();
      const next = clone(current);
      const result = change(next);
      await this.#write(next);
      this.#state = next;
      this.#loadPromise = Promise.resolve(next);
      return clone(result);
    });
    this.#queue = operation.catch(() => {});
    return operation;
  }

  findSourceByHash(profileId, sha256) {
    return this.#read((state) => state.sources.find((source) => source.profileId === profileId && source.sha256 === sha256) ?? null);
  }

  createSource(source) {
    return this.#mutate((state) => {
      if (source.profileId !== DEMO_PROFILE_ID) throw new Error('This local service only accepts its synthetic demo profile.');
      const existing = state.sources.find((item) => item.profileId === source.profileId && item.sha256 === source.sha256);
      if (existing) return existing;
      state.sources.unshift(source);
      return source;
    });
  }

  getSource(sourceId) { return this.#read((state) => state.sources.find((source) => source.id === sourceId) ?? null); }
  getClaim(claimId) { return this.#read((state) => state.claims.find((claim) => claim.id === claimId) ?? null); }
  listSources(profileId = DEMO_PROFILE_ID) { return this.#read((state) => state.sources.filter((source) => source.profileId === profileId)); }

  setSourceState(sourceId, nextState, extra = {}) {
    return this.#mutate((state) => {
      const source = state.sources.find((item) => item.id === sourceId);
      if (!source) return null;
      source.state = nextState;
      Object.assign(source, extra);
      return source;
    });
  }

  saveCandidateClaims(claims) {
    return this.#mutate((state) => {
      for (const claim of claims) {
        if (!state.sources.some((source) => source.id === claim.sourceId && source.profileId === claim.profileId)) throw new Error('The claim source is unavailable.');
        state.claims.unshift(claim);
      }
      return claims;
    });
  }

  listClaims(sourceId) { return this.#read((state) => state.claims.filter((claim) => claim.sourceId === sourceId)); }

  decideClaim(claimId, decision) {
    return this.#mutate((state) => {
      const claim = state.claims.find((item) => item.id === claimId);
      if (!claim) return null;
      if (claim.evidenceState !== 'needs_review') return { claim, assertion: null, unchanged: true };
      if (!['accept', 'edit', 'reject'].includes(decision?.decision)) throw new Error('Choose accept, edit, or reject.');
      if (decision.decision === 'reject') {
        claim.evidenceState = 'rejected';
        claim.reviewedAt = new Date().toISOString();
        return { claim, assertion: null, unchanged: false };
      }
      const edited = decision.decision === 'edit' ? decision.editedValue : null;
      const label = typeof edited?.label === 'string' ? edited.label.trim().slice(0, 160) : claim.label;
      const value = typeof edited?.value === 'string' ? edited.value.trim().slice(0, 1200) : claim.value;
      const unit = typeof edited?.unit === 'string' ? edited.unit.trim().slice(0, 48) : claim.unit;
      let effectiveAt = claim.effectiveAt;
      if (typeof edited?.effectiveAt === 'string') {
        const reviewedDate = normalizeReviewEventDate(edited.effectiveAt);
        if (!reviewedDate.ok) throw new Error('Use a real calendar date in YYYY-MM-DD format, or leave the result date blank.');
        effectiveAt = reviewedDate.value;
      }
      if (!label || !value) throw new Error('A reviewed claim needs a label and value.');
      if (decision.decision === 'edit' && !claim.originalExtraction) {
        claim.originalExtraction = { label: claim.label, value: claim.value, unit: claim.unit, effectiveAt: claim.effectiveAt };
      }
      claim.label = label;
      claim.value = value;
      claim.unit = unit || null;
      claim.effectiveAt = effectiveAt || null;
      claim.evidenceState = 'user_confirmed';
      claim.reviewedAt = new Date().toISOString();
      if (!claim.acceptedAssertionId) {
        const recordedAt = new Date().toISOString();
        const assertion = {
          id: randomUUID(), schemaVersion: 1, profileId: claim.profileId, sourceId: claim.sourceId,
          claimId: claim.id, kind: claim.kind, label: claim.label, value: claim.value, unit: claim.unit,
          referenceRange: claim.referenceRange ?? null, method: claim.method ?? null,
          effectiveAt: claim.effectiveAt, recordedAt, origin: state.sources.find((item) => item.id === claim.sourceId)?.origin === 'user_entered' ? 'user_entered' : 'document_extraction',
          evidenceState: 'user_confirmed', confidence: claim.confidence, sourceLocation: claim.sourceLocation,
          validFrom: recordedAt, validUntil: null, version: 1, supersedes: null,
        };
        state.assertions.unshift(assertion);
        claim.acceptedAssertionId = assertion.id;
      }
      const source = state.sources.find((item) => item.id === claim.sourceId);
      if (source && state.claims.filter((item) => item.sourceId === source.id && item.evidenceState === 'needs_review').length === 0) {
        source.state = state.claims.some((item) => item.sourceId === source.id && item.evidenceState === 'user_confirmed') ? 'accepted' : 'rejected';
      }
      return { claim, assertion: state.assertions.find((item) => item.id === claim.acceptedAssertionId), unchanged: false };
    });
  }

  correctClaim(claimId, { expectedAssertionId, editedValue } = {}) {
    return this.#mutate((state) => {
      const claim = state.claims.find((item) => item.id === claimId);
      if (!claim) return null;
      if (claim.evidenceState !== 'user_confirmed' || !claim.acceptedAssertionId) throw new Error('Only a claim you have accepted can be corrected.');
      if (!expectedAssertionId || claim.acceptedAssertionId !== expectedAssertionId) throw new Error('This detail changed since you opened it. Reload its latest version before correcting it.');
      const current = state.assertions.find((item) => item.id === claim.acceptedAssertionId && item.profileId === claim.profileId);
      if (!current || current.validUntil) throw new Error('The current accepted version is unavailable.');
      const label = typeof editedValue?.label === 'string' ? editedValue.label.trim().slice(0, 160) : '';
      const value = typeof editedValue?.value === 'string' ? editedValue.value.trim().slice(0, 1200) : '';
      const unit = typeof editedValue?.unit === 'string' ? editedValue.unit.trim().slice(0, 48) : '';
      let effectiveAt = current.effectiveAt;
      if (typeof editedValue?.effectiveAt === 'string') {
        const reviewedDate = normalizeReviewEventDate(editedValue.effectiveAt);
        if (!reviewedDate.ok) throw new Error('Use a real calendar date in YYYY-MM-DD format, or leave the result date blank.');
        effectiveAt = reviewedDate.value;
      }
      if (!label || !value) throw new Error('Add a label and corrected value before saving.');
      const now = new Date().toISOString();
      claim.revisionHistory = [...(Array.isArray(claim.revisionHistory) ? claim.revisionHistory : []), {
        assertionId: current.id, version: current.version, label: current.label, value: current.value,
        unit: current.unit ?? null, effectiveAt: current.effectiveAt ?? null, recordedAt: current.recordedAt ?? now,
      }];
      current.validUntil = now;
      current.evidenceState = 'superseded';
      current.supersededAt = now;
      const next = {
        ...current, id: randomUUID(), label, value, unit: unit || null, effectiveAt: effectiveAt || null,
        recordedAt: now, validFrom: now, validUntil: null,
        origin: 'user_entered', evidenceState: 'user_confirmed', confidence: null,
        version: current.version + 1, supersedes: current.id,
      };
      state.assertions.unshift(next);
      claim.label = label; claim.value = value; claim.unit = unit || null; claim.effectiveAt = effectiveAt || null;
      claim.acceptedAssertionId = next.id; claim.correctedAt = now;
      return { claim, previousAssertion: current, assertion: next, unchanged: false };
    });
  }

  retractClaim(claimId, { expectedAssertionId, reason } = {}) {
    return this.#mutate((state) => {
      const claim = state.claims.find((item) => item.id === claimId);
      if (!claim) return null;
      if (reason !== 'not_personal') throw new Error('Choose the reason this detail does not belong in the active profile.');
      if (claim.evidenceState === 'user_retracted' && claim.acceptedAssertionId === expectedAssertionId) {
        const prior = state.assertions.find((item) => item.id === expectedAssertionId && item.profileId === claim.profileId) ?? null;
        return { claim, previousAssertion: prior, unchanged: true };
      }
      if (claim.evidenceState !== 'user_confirmed' || !claim.acceptedAssertionId) throw new Error('Only a detail currently in your profile can be removed this way.');
      if (!expectedAssertionId || claim.acceptedAssertionId !== expectedAssertionId) throw new Error('This detail changed since you opened it. Reload its latest version before removing it.');
      const current = state.assertions.find((item) => item.id === expectedAssertionId && item.profileId === claim.profileId);
      if (!current || current.validUntil || current.evidenceState !== 'user_confirmed') throw new Error('The current accepted version is unavailable.');
      const now = new Date().toISOString();
      current.validUntil = now;
      current.evidenceState = 'user_retracted';
      current.retractedAt = now;
      current.retractionReason = reason;
      claim.evidenceState = 'user_retracted';
      claim.retractedAt = now;
      claim.retractionReason = reason;
      const source = state.sources.find((item) => item.id === claim.sourceId);
      if (source) {
        const sourceClaims = state.claims.filter((item) => item.sourceId === source.id);
        source.state = sourceClaims.some((item) => item.evidenceState === 'needs_review' || item.evidenceState === 'candidate')
          ? 'candidate_review'
          : sourceClaims.some((item) => item.evidenceState === 'user_confirmed') ? 'accepted' : 'rejected';
      }
      return { claim, previousAssertion: current, unchanged: false };
    });
  }

  appendRunEvent(event) {
    return this.#mutate((state) => {
      state.runEvents.push(event);
      if (state.runEvents.length > 5000) state.runEvents.splice(0, state.runEvents.length - 5000);
      return event;
    });
  }

  listRunEvents(runId) { return this.#read((state) => state.runEvents.filter((event) => event.runId === runId)); }

  listAssertions(profileId = DEMO_PROFILE_ID) { return this.#read((state) => state.assertions.filter((assertion) => assertion.profileId === profileId)); }

  clearDemoProfile(profileId = DEMO_PROFILE_ID) {
    if (profileId !== DEMO_PROFILE_ID) throw new Error('This local repository can only clear its synthetic demo profile.');
    return this.#mutate((state) => {
      const cleared = {
        sources: state.sources.filter((item) => item.profileId === profileId).length,
        claims: state.claims.filter((item) => item.profileId === profileId).length,
        assertions: state.assertions.filter((item) => item.profileId === profileId).length,
        activityEvents: state.runEvents.length,
      };
      state.sources = state.sources.filter((item) => item.profileId !== profileId);
      state.claims = state.claims.filter((item) => item.profileId !== profileId);
      state.assertions = state.assertions.filter((item) => item.profileId !== profileId);
      // This development repository is restricted to one synthetic profile and does not
      // attach a profile ID to its safe activity envelope, so clear its complete event log.
      state.runEvents = [];
      return cleared;
    });
  }
}

export const localDemoRepository = new LocalDemoRepository();
