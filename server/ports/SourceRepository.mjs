/**
 * Local demo repository port. Production storage must implement this interface
 * with account-scoped authorization and encrypted source/claim persistence.
 */
export class SourceRepository {
  async findSourceByHash(_profileId, _sha256) { throw new Error('findSourceByHash is not implemented.'); }
  async createSource(_source) { throw new Error('createSource is not implemented.'); }
  async getSource(_sourceId) { throw new Error('getSource is not implemented.'); }
  async setSourceState(_sourceId, _state) { throw new Error('setSourceState is not implemented.'); }
  async saveCandidateClaims(_claims) { throw new Error('saveCandidateClaims is not implemented.'); }
  async listClaims(_sourceId) { throw new Error('listClaims is not implemented.'); }
  async decideClaim(_claimId, _decision) { throw new Error('decideClaim is not implemented.'); }
  async appendRunEvent(_event) { throw new Error('appendRunEvent is not implemented.'); }
  async listRunEvents(_runId) { throw new Error('listRunEvents is not implemented.'); }
  async clearDemoProfile(_profileId) { throw new Error('clearDemoProfile is not implemented.'); }
}
