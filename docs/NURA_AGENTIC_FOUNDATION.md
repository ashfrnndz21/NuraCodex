# Nura agentic foundation and frontend integration contract

**Purpose:** give the UI/design lane and the AI/backend lane a stable contract so they can proceed in parallel and integrate predictably. This plan targets a compelling, end-to-end **synthetic-data demo** using the existing Expo app and a server-held model key. It does not claim production privacy, compliance, clinical safety, cloud identity, or PHI readiness.

**Scope note:** this document describes the current local/demo foundation and its implementation boundary. It does not narrow the complete-build objective; production identity, privacy, persistence, safety, operations, and release gates are required by [NURA_COMPLETE_BUILD_SCOPE.md](NURA_COMPLETE_BUILD_SCOPE.md).

**Scope boundary:** all examples in demo mode are synthetic. Never use real health records or real policy documents against the unauthenticated local-development server. Keep provider keys only in the backend environment; never use `EXPO_PUBLIC_` for secrets.

## 1. Current foundation and gaps

### Connected in the first demo slice

- Expo Router app for iOS, Android and a phone-sized browser preview; the shared onboarding and Health History now use the reconciled warm-light evidence palette, cobalt timeline nodes/links, and restrained indigo-violet-peach Nura moments.
- Native profile, focus areas, self-reported facts, selected files, links and Ask conversation persist in local SQLite. Browser preview starts with synthetic examples and keeps edits in memory only; a reload clears them. It warns users not to enter real health or contact data.
- User-authored health links now require a visible relation type (same source, around the same time, measured at this visit, treatment for this, related in my words, or other note). The type and note persist together, appear in Connections, and are passed to Ask only when the user includes links for that run. These are personal associations, not model-confirmed clinical relationships.
- Ask requires a per-run scope confirmation, calls the loopback Node agent, retrieves the selected profile details with bounded tools, returns validated structured answers with citations and unknowns, and persists only user-approved memory proposals. Activity traces are real server events, not hidden chain-of-thought or timer-driven animation.
- The local agent uses a server-held OpenAI key and `store:false`. It can optionally call allowlisted public health search only when the operator enables both server flags and the user opts in for that run; it is disabled by default.
- A selected PDF or image can be sent one at a time after explicit processing consent. The local service hashes exact bytes for exact-duplicate detection, asks the model for source-linked candidate claims, emits live SSE milestones, and stores candidate/review state in a local demo repository. Accept/edit creates a user-confirmed assertion; reject keeps the claim out of profile memory. The original file remains on device.
- The Expo upload and review screens are connected to the extraction and claim-decision routes. Synthetic PDF extraction, source/quote review, exact duplicate detection, claim acceptance and later Ask retrieval all passed a live local check on 2026-09-23; no real health data was used.
- Story 9 now has a first local demo flow: user-selected urgent signs move to a static escalation screen before any model call; non-urgent requests require a per-run scope review, stream actual events, and do not save the conversation. Symptom mode discards prior chat and links, filters treatment/medicine facts at the server boundary, and uses a deterministic non-clinical fallback unless a cited public health source is returned. This is a partial slice, not clinically validated triage.

### Still to build

- Production identity, server-side profile authorization and consent enforcement, cloud sync, export/deletion, multiple isolated profiles, and family/caregiver permission management.
- Video/audio understanding (frames plus timestamped transcription), robust perceptual-image duplicate suggestions, batch intake, and a persistent source/claim registry shared with the mobile app.
- Complete Insurance Registry and evidence-based coverage comparison; complete personalized cited health feed; medicine and visit workflows; clinically validated and jurisdiction-aware symptom routing; full registry/wiki pages and timeline reconciliation for corrections, conflicts and superseded values. Partial local demo flows already exist for insurance comparison and health search; production identities and complete story journeys do not.
- Dedicated bounded specialist workers for policy analysis, health discovery and symptom routing; a versioned/replayable event service; formal orchestration and retrieval evaluation; and the remaining story-to-service integrations.
- Production deployment, monitoring, retention controls and health-data security review. The local demo is single-profile and unauthenticated and must use synthetic examples only.

**Integration rule:** the project integration owner maintains the story → screen → service/tool → persisted state → public event → animation → acceptance map. A UI behavior becomes a connected feature only after its service event and persistence contract exist; design-only behavior stays explicitly labeled in the storyboard. The Nura runtime supervisor is separate: it routes one user request through consent, permitted retrieval/tools, evidence validation, answer, and approval before any durable write. Neither role may expose hidden model reasoning.

## 2. Architecture and boundaries

```text
Expo UI (routes + components)
  ├─ screens: onboarding, registry/wiki, timeline/connections, intake/review,
  │            Ask, insurance, feed, medicines, visits, symptoms, family, privacy
  ├─ Nura API client (commands + typed event stream; no provider SDK/key)
  └─ client cache/view state (renders server-authoritative demo state)
          │ HTTPS in hosted demo / loopback only for local synthetic preview
          ▼
Nura API + Run Supervisor (server)
  ├─ Identity + Profile Access ─ Consent/Policy Decision Point
  ├─ Run Orchestrator ─ Tool Registry ─ Capability Workers
  ├─ Context Builder ─ Registry ─ Source Vault ─ Wiki snapshots
  ├─ Event publisher (public-safe run events) ─ Audit/metrics (no health payloads)
  └─ Ports: LanguageModel, ObjectStore, OCR/Extraction, Transcription,
            WebSearch, HealthSourceCatalog, Persistence
          │
          ├─ demo adapters: seeded SQLite repository, local file/object directory,
          │                 synthetic extraction/search fixtures, configured LLM adapter
          └─ later production adapters: authenticated DB/object store, extraction,
                                    external search, deployment-specific identity
```

**Rules:** UI never calls a model or extraction provider directly. Model output is untrusted candidate content. It cannot query SQL, authorize a profile, accept a fact, grant consent, change a medication, or perform a consequential action. Service ports have replaceable adapters. Only services with policy approval can read/write canonical records. The orchestrator coordinates ports; it is not a store of truth.

### Parallel work protocol

Before either lane implements features, agree these shared artifacts:

1. Story-to-screen map and mobile storyboard, including empty/loading/error/review states.
2. Domain entity schema and state names in this document.
3. API request/response and event envelope versions.
4. Per-screen acceptance scenarios and synthetic fixtures.

UI/design can then implement against typed mock transport fixtures that exactly match the contract; backend can implement those APIs/events with a demo repository. Integration replaces the fixture client with the service client without changing the UI's domain assumptions. A story only counts integrated after the vertical-slice gate in §11 passes.

## 3. Persistent sourced memory and context

### Canonical entities

Use these entities from the first shared contract. IDs are opaque; every object belongs to an explicit `profileId` and must be authorized by the server.

```ts
type EvidenceState = 'candidate' | 'needs_review' | 'user_confirmed' | 'rejected' | 'superseded';
type Origin = 'user_entered' | 'document_extraction' | 'connected_record' |
  'external_source' | 'agent_inference';
type ProfileDomain = 'identity' | 'biometrics' | 'conditions' | 'symptoms' |
  'history' | 'labs' | 'documents' | 'medicines' | 'treatment' | 'lifestyle' |
  'care' | 'insurance' | 'family' | 'goals';

type Source = {
  id: string; profileId: string; mediaType: string; displayName: string;
  sha256?: string; storageRef?: string; origin: Origin;
  importedAt: string; eventDate?: string; processingState: IntakeState;
  ownerState: 'confirmed' | 'needs_confirmation'; consentId?: string;
};
type SourceLocation = { page?: number; region?: [number, number, number, number];
  startOffset?: number; endOffset?: number; timestampSeconds?: number };
type HealthAssertion = {
  id: string; profileId: string; domain: ProfileDomain;
  kind: string; subject: string; value: unknown; unit?: string;
  effectiveAt?: string; recordedAt: string; validFrom: string; validUntil?: string;
  origin: Origin; evidenceState: EvidenceState; sourceId?: string;
  sourceLocation?: SourceLocation; confidence?: number;
  supersedes?: string; version: number; userNote?: string;
};
type Relationship = {
  id: string; profileId: string; fromAssertionId: string; toAssertionId: string;
  type: 'measured_during' | 'mentioned_with' | 'treated_by' | 'prescribed_at' |
    'measured_after' | 'covered_by' | 'user_linked' | 'other';
  evidenceAssertionIds: string[]; effectiveFrom?: string; effectiveUntil?: string;
  state: 'suggested' | 'needs_review' | 'user_confirmed' | 'rejected';
  confidence?: number; origin: Origin;
};
type ConsentGrant = { id: string; profileId: string; purpose: string;
  domains: ProfileDomain[]; sourceIds?: string[]; grantedAt: string;
  expiresAt?: string; revokedAt?: string; scope: 'run' | 'processing' | 'feed' | 'sharing' };
type WikiPageSnapshot = { id: string; profileId: string; topicKey: string;
  summary: string; evidenceIds: string[]; evidenceSetHash: string;
  generatedAt: string; modelVersion?: string; promptVersion: string;
  state: 'current' | 'refresh_required' | 'needs_review' | 'generation_unavailable' };
```

**Source of truth:** canonical assertions + original sources + confirmed relationships. A generated wiki paragraph, chat transcript, animation, or model inference is never the only durable representation of a health fact.

### Memory layers

1. **Confirmed profile memory:** user-entered facts and reviewed source claims, with origin, valid-time, provenance, and correction history.
2. **Candidate claims:** extraction or agent suggestions, visible for review but excluded from confirmed-context answers unless explicitly presented as unreviewed source evidence.
3. **Preferences:** explicit user-confirmed interaction preferences, units, and topics to avoid.
4. **Conversation context:** bounded current conversation and selected prior messages, only if the user permits it. Not automatically promoted to health facts.
5. **Derived wiki/summaries/relationships:** cited snapshots with evidence-set hash and invalidation dependency index. Mark stale when source assertions change; refresh on demand/background policy. On answering, use the wiki as a retrieval index, then verify important claims against canonical current assertions.

### Corrections, reconciliation, deletion

- Corrections append a new assertion/version with `supersedes`; old version becomes historically superseded with valid-time preserved.
- Extraction claims enter `candidate`/`needs_review`; acceptance is an explicit user command with a source pointer. Rejected claims remain excluded from retrieval (retention policy governs purge).
- “Same” links to an existing source/assertion after exact hash or user confirmation. “Conflict” retains both claims and opens comparison/review. “Replaces” ends the old policy's valid period and records a new source. “Whose?” holds the item outside the selected profile until ownership is confirmed. “New” appends dated evidence. None may be fabricated from an LLM label alone.
- Deletion must traverse original source, extracted claims, derived pages, indexes, local cache and demo DB. Production backups/retention/export semantics need explicit policy and verification.

### Context assembly per AI run

```text
authenticate principal + active profile
→ validate active consent for purpose/domains/source IDs
→ classify intent and requested scope
→ retrieve only permitted accepted assertions (+ optionally reviewable claim evidence)
→ rank by lexical/semantic relevance + time; preserve competing versions/conflicts
→ build EvidencePacket with claim IDs, values, dates, status, source locations,
  confidence, unknown fields, and allowed citations
→ run bounded tools/specialists against packet
→ validate every citation/action against packet + policy
→ render cited answer, uncertainty, missing evidence, and optional proposed write
```

Never send an entire profile by default. Don’t treat topic selections as diagnoses. Don’t infer `false` from absent data. Use a per-run consent preview with categories/counts and explicit exclusions; backend re-checks consent and profile access on every tool call. The model gets only the compact authorized evidence needed for this intent. No raw DB access.

## 4. Multimodal intake contract

### State machine

```ts
type IntakeState = 'selected_on_device' | 'metadata_saved' | 'duplicate_check' |
  'awaiting_processing_consent' | 'uploading' | 'queued' | 'extracting' |
  'candidate_review' | 'accepted' | 'rejected' | 'processing_error' | 'cancelled';
```

Transitions are persisted and emit backend events; a screen cannot show “reading” unless a job is actually queued/running. Support retry and cancellation; preserve original file across parser failure.

### Processing behavior

- Validate MIME/size/parser before processing. Hash exact bytes with SHA-256. Exact hash duplicate is a confident same-source candidate; filename/size alone is only a weak hint. Perceptual-image similarity raises a possible-duplicate review, never auto-merges.
- PDF and image OCR returns candidates with raw snippet, normalized value/unit/date if recognized, confidence, page/region, parser/model version. Preserve raw text and original.
- Video/audio: extract audio for transcription and bounded representative frames/OCR, keeping timestamps. Do not upload or process the entire media silently; show selected content and consent.
- Ambiguous patient owner, poor quality, conflicting units/dates, low confidence, or conflicting source claims stop for review. No extraction result writes directly into confirmed memory.
- Demo providers may return deterministic synthetic claims or use configured provider processing, but every output carries `environment: demo`, `origin: document_extraction`, and `evidenceState: needs_review`. Do not describe a canned result as a successful model extraction.

### Intake API

```http
POST /v1/profiles/{profileId}/sources
Authorization: Bearer <demo-session-token>
Content-Type: application/json
```
```json
{ "displayName":"sample-labs.pdf", "mediaType":"application/pdf",
  "sizeBytes":321012, "purpose":"medical_registry", "consentId":"c-123" }
```
Response: `{ "source": Source, "upload": { "method":"PUT", "url":"/v1/sources/s-123/content", "expiresAt":"..." } }`.

```http
PUT /v1/sources/{sourceId}/content
Content-Type: application/pdf
```
For the local synthetic demo this can use bounded multipart/binary upload to the same server; production should use authenticated private object storage or a short-lived signed upload, quarantine and scan before parse. Keep upload limits configurable, never trust the declared MIME.

```http
POST /v1/sources/{sourceId}/process
Authorization: Bearer <demo-session-token>
```
Returns `{ "jobId":"j-123", "state":"queued" }`; UI subscribes to job events. After `candidate_review`, fetch candidates and use explicit review actions:

```http
GET /v1/profiles/{profileId}/sources/{sourceId}/claims
POST /v1/profiles/{profileId}/claims/{claimId}/decision
{ "decision":"accept|edit|reject", "editedValue":{}, "validFrom":"..." }
```
Accept yields a canonical assertion id and appends timeline/domain events. Reject never appears in confirmed wiki context.

## 5. Tool calling, external search, and bounded specialists

### Tool registry

Each function has a strict JSON schema, capability id, description shown in traces, scope requirements, timeout, rate/cost budget, and validator. Tools return typed evidence references and safe display summaries. Calls are authorized at execution, not merely at planning.

Initial tool set for demo:

- `search_registry({query, domains?, timeRange?, includeReviewable?}) -> EvidencePacket items`
- `get_assertion({assertionId}) -> sourced assertion`, only if already authorized/retrieved.
- `open_source_excerpt({sourceId, location}) -> redacted or demo excerpt + location`.
- `find_relationships({assertionIds, relationshipTypes?}) -> typed confirmed links`.
- `compare_assertions({assertionIds}) -> deterministic same/new/conflict/replaces/unknown comparison proposal`.
- `search_policy_terms({policySourceId, terms[]}) -> cited policy clauses`.
- `compare_coverage({policyEvidenceIds, healthAssertionIds, question}) -> supported/unknown/gap candidates with citations`; deterministic rules decide only what the text supports, LLM explains.
- `search_health_sources({query, domains, since?, maxResults}) -> dated external source refs`.
- `prepare_visit_brief({visitId, selectedAssertionIds, questionIds}) -> draft brief`; requires explicit user selection.
- `propose_memory_write({candidateAssertion}) -> proposal only`; no model-call direct persistence.

Explicitly exclude unrestricted browser, SQL, arbitrary URL fetch, medication change, clinical diagnosis, autonomous share/send, or user data writes from tools.

### Web search

Use an adapter behind a `WebSearch` port. For the demo, provide a curated fixture catalog and optionally a live provider search behind a server-held key. Search only allowlisted medical publishers/official sources; persist URL, publisher, title, publication date, retrieval date, snippet and search query provenance. Show the user why an item was selected. Keep external evidence separate from personal health assertions and label freshness. A search result is not evidence about the person's own diagnosis or coverage. User can save/dismiss and control personalization.

### Where a specialist is warranted

Use small, bounded specialist workers; do not make every screen a free-roaming agent:

- **Document worker:** OCR/transcription + claim structurer. It produces candidates, never accepts memory.
- **Insurance worker:** extracts policy clauses; deterministic comparator maps explicit terms to selected health evidence; language model may explain cited results and unknowns.
- **Health discovery worker:** searches curated sources, ranks against explicitly allowed domains/topics, records source/date/relevance reason.
- **Symptom workflow:** red-flag checks/escalation are deterministic policy first; only then may bounded language generation format safe supportive information. Never defer urgent routing to an LLM.
- **Visit brief:** deterministic selection/composition from chosen facts; LLM can clarify phrasing but cannot add unselected records.
- **Family/profile access:** authorization service, not an agent.

Parallel fan-out is allowed only for independent tools with the same consent/evidence boundary (e.g. retrieve medicine and lab history). Insurance policy extraction and registry retrieval can run in parallel after scope is validated; final coverage explanation waits for both. All agent/workers return typed claims with evidence IDs, uncertainty and status. Supervisor rejects uncited output or requests clarification.

## 6. Master run supervisor

One server-side `RunSupervisor` owns lifecycle, authorization checks, routing, tool limits, trace events, cancellation and final validation. It calls capability ports; it is swappable and does not own canonical data.

```text
created
→ consent_validating
→ intent_classifying
→ planning
→ retrieving
→ executing_tools (0..N bounded)
→ reconciling_evidence
→ drafting
→ validating_answer
→ completed | awaiting_user_review | needs_clarification

Any active state → failed | cancelled (terminal, exactly once)
```

For every run:

1. Resolve authenticated/demo principal and active profile server-side; ignore client-supplied identity authority.
2. Validate consent purpose and allowed domains/source IDs. Return a `consent.required` response if missing/expired; don’t call model before consent.
3. Classify intent into a known workflow, then build a bounded plan from registered tools. Unsafe/unsupported intent is handled explicitly, not forced through generic Ask.
4. Execute tools with budgets/timeouts and validate outputs. Tool data are untrusted input; prompt injection inside documents/web is treated as data.
5. Reconcile evidence: dedupe references; surface conflicting values and dates; keep candidate/rejected facts out of confirmed claims; ensure coverage result has both policy and health evidence; ensure public content cites its actual source.
6. Generate structured answer/action proposals; validate citations against run's evidence registry and allowed operations; do not let model pick arbitrary IDs.
7. Emit only user-readable action milestones, final evidence refs and proposals. Never expose hidden reasoning, prompt text, credentials, tool args, or raw health content through traces/logs.
8. For writes, return proposal only. A separate API command rechecks current authorization/consent and user approval, applies idempotently, appends an audit/domain event, invalidates affected wiki snapshots, and returns canonical new state.

## 7. UI event/state contract

### Versioned public event envelope

```ts
type RunEvent<T extends string, P> = {
  schemaVersion: 1; runId: string; eventId: string; sequence: number;
  occurredAt: string; type: T; stage: string; status: 'started'|'progress'|'complete'|'failed';
  display: { label: string; detail?: string };
  refs?: { kind: 'source'|'assertion'|'relationship'|'wiki_page'|'feed_item'; id: string }[];
  counts?: Record<string, number>; payload?: P;
};
```

No raw query/prompt, raw document text, tool arguments, chain-of-thought, or raw model scratch content in this UI event stream. UI can fetch authorized detail through normal domain endpoints after receiving a ref. `display.label` is a reviewed product string or safe interpolation, not model-generated arbitrary markup.

### Event names

```text
run.started
consent.validated
intent.classified
plan.ready                         # product wording, never private reasoning
capability.started
capability.progress                # optional meaningful stages only
capability.completed
capability.failed
retrieval.completed
source.received
duplicate.possible
extraction.started
extraction.progress
claims.ready_for_review
review.completed
wiki.refresh_required
wiki.refreshed
answer.delta                       # optional; only actual content chunks
answer.completed
memory.proposed
run.needs_clarification
run.completed
run.failed
run.cancelled
```

Every event has monotonically increasing sequence per run; stable `eventId`; exactly one terminal event; support `Last-Event-ID`/resume where transport permits. Persist a short public trace attached to a run record, not health payloads. UI reconstructs `AIState` from events: work begins only after `run.started`; `responding` only after actual answer content begins; `error` only on `run.failed`; no timers. Reduced motion changes animation only, not event semantics.

### Domain state is distinct from run state

Intake/job state and assertion review state remain first-class domain data. A timeline should not derive a record from a trace. Only accepted assertions/sources are timeline records; in-progress sources can appear in an intake queue with status. A run event such as `claims.ready_for_review` navigates the UI to the review screen but does not itself create accepted facts.

## 8. API contracts

All APIs use JSON except source upload. Production calls require authenticated principal; demo uses short-lived explicit demo session token, scoped to the synthetic profile. Do not trust `{profileId}` without checking ownership on every route.

### Demo and profile bootstrap

```http
POST /v1/demo/session
{ "fixture":"standard-health-history-v1" }
→ { "accessToken":"demo-only-short-lived", "mode":"demo", "profileId":"demo-p1", "expiresAt":"..." }
GET /v1/profiles/{profileId}/bootstrap
→ { "profile":{}, "domains":[], "assertions":[], "sources":[], "relationships":[], "wikiPages":[], "capabilities":{} }
```
Demo data are visibly labeled; no real user profile is accessible through a demo session. Key is not part of any response.

### Profile/registry/timeline/wiki

```http
GET /v1/profiles/{id}/assertions?domain=&state=&from=&to=&cursor=
GET /v1/profiles/{id}/timeline?from=&to=&category=&cursor=
GET /v1/profiles/{id}/relationships?assertionId=
GET /v1/profiles/{id}/wiki/pages?topic=
GET /v1/profiles/{id}/sources/{sourceId}?location=
PATCH /v1/profiles/{id}/assertions/{assertionId}
POST /v1/profiles/{id}/assertions/{assertionId}/corrections
POST /v1/profiles/{id}/relationships (user-confirmed link requires type + endpoints)
DELETE /v1/profiles/{id}/relationships/{id}
```
Correction is append/version, not destructive PATCH to canonical value; `PATCH` may handle editable user metadata only. The UI uses one shared profile/registry client across routes, not parallel screen-specific models.

### Run / consent / memory proposal

```http
POST /v1/profiles/{id}/consents
{ "purpose":"ask", "domains":["labs","medicines"], "sourceIds":[], "scope":"run" }
→ { "consent": ConsentGrant }
POST /v1/profiles/{id}/runs
Authorization: Bearer ...
Accept: text/event-stream
{ "runId":"client-generated-id", "conversationId":"...", "question":"...",
  "consentId":"...", "scope":{"domains":["labs"],"sourceIds":[],"includePriorConversation":false},
  "selectedAssertionIds":[], "entryPoint":{"kind":"timeline_record","id":"..."} }
→ SSE RunEvent stream
POST /v1/profiles/{id}/runs/{runId}/proposals/{proposalId}/decision
{ "decision":"accept|edit|reject", "editedValue":{}, "expectedVersion":1 }
→ `{ "decision":..., "assertion": HealthAssertion|null, "wikiState":"refresh_required" }`
```
The client sends allowed IDs and consent token, not complete source record values as authoritative context. Server loads data, validates ownership and scope, and builds the packet.

### Search/feed/care/family/privacy capabilities

```http
GET /v1/profiles/{id}/feed?cursor=
POST /v1/profiles/{id}/feed/search-jobs { "topics":[], "query?":"...", "consentId":"..." } → jobId + SSE
POST /v1/profiles/{id}/visits/briefs { "visitId?":"...", "selectedAssertionIds":[], "questionIds":[] }
POST /v1/profiles/{id}/symptom-runs { "description":"...", "consentId":"..." } → SSE, safety route first
POST /v1/profiles/{id}/family-invitations (production only; demo simulates permission changes locally)
GET /v1/profiles/{id}/privacy/export-jobs
POST /v1/profiles/{id}/privacy/deletion-requests
```
Every route advertises current capability states in bootstrap: `available`, `demo_only`, `not_configured`, `requires_consent`, `requires_review`. UI should explain unsupported capabilities rather than imply a successful action.

## 9. Story-by-story frontend integration matrix

| Story | Frontend journey and meaningful interaction | Backend/API/data contract | Demo proof / integration gate | Production boundary |
|---|---|---|---|---|
| **1. Living 720 profile** | Animated onboarding, identity details, selectable health cloud with dependent bubbles, map updates, concise editable synthesis, skip/correct/recontextualize. | Profile domain states; user-entered assertions; explicit preferences; `POST/PATCH` profile/assertions; consent. Map derives counts/status from stored entities. | Select topics and enter a value; navigate away/reopen; profile map and Ask context reflect it; edits append provenance/version. | Account, sync, recovery, consent retention and sensitive field protection. |
| **2. Medical Registry/wiki** | Browse topic pages; every summary sentence/source opens evidence at page/region; inspect current/history/unknown/conflicts. | Canonical assertions/sources/relationships; wiki snapshots with evidence hash and stale state; registry search/open tools. | Add synthetic report; accept claims; page cites exact values/source; edit source fact marks snapshot refresh-needed; Ask revalidates evidence. | Production source vault, access controls, deletion, provenance audit. |
| **3. Insurance Registry** | Upload/sample policy; browse benefits/limits/exclusions/dates; ask what appears uncovered; show evidence and unknown vs confirmed gap. | Policy claims, validity/replacement relationships, clause locations; `search_policy_terms`, deterministic `compare_coverage`. | Fixture yields source-grounded comparison citing one policy passage + selected health assertions; unsupported item renders unknown, not a gap. | Insurer/network data, legal/product review, real policy-document privacy. |
| **4. Personalized health feed** | See relevant dated articles/videos; reveal “why relevant”; save/dismiss; adjust topics. | `WebSearch`/catalog results, source metadata, personalization consent, feed preferences/saves. | Curated or live server search results cite publisher/date/link and point only to confirmed allowed topics; save persists. | Search provider terms, freshness moderation, opt-out and source quality. |
| **5. Ask Nura** | Consent/scope sheet; context-aware composer (including selected timeline record); milestones; answer, source cards, uncertainty, clarification, approve/reject memory proposal. | Supervisor run API/SSE; ContextBuilder; strict tools; validated citations; proposal endpoint rechecks auth. | Ask about a saved test; event sequence corresponds to actual retrieval; cited fact opens; user-approved fact appears on profile and next Ask. | Identity and consent enforcement, retention, rate limits, security monitoring. |
| **6. Medicines/treatment** | Current/past treatment registry, dose as source says, provider/pharmacy, started/stopped, conflict review; no implied medication advice. | Medication/treatment assertions, temporal validity, source links; discrepancy tool; user command for status change. | Synthetic prescription and clinic note conflict; both preserved; screen clearly asks user to resolve/confirm. | Clinical rules, access, real prescription data integrations. |
| **7. Visit preparation/outcomes** | Pick facts and questions for visit brief; choose what to share; record visit outcome/follow-up afterward. | Visit entity + selected assertion refs, brief composer, user-authored outcome assertions, event/timeline. | Brief contains only selected confirmed details; unselected item is absent; post-visit note is marked user-entered. | Secure sharing with clinic, interoperability, audit/consent. |
| **8. Timeline/connections** | Chronological dated source cards; filters; tap node opens details; separate connections mode reveals selected, typed evidence link; no graph spaghetti. | Timeline queries; relationships with typed state/evidence/time; source/claim IDs. `entryPoint` scopes Ask to selected records/links. | “New/Same/Conflict/Replaces/Whose?” fixtures reconcile correctly; timeline uses event date and marks unknown date; connection opens why/source. | Scale/indexing and cross-source identity resolution. |
| **9. Symptom support** | Symptom entry, accessible urgent warning route, context only with permission, supportive next steps and clear limits. | Deterministic emergency red-flag policy before model; allowed evidence packet; sourced response schema and escalation event. | Fixture verifies urgent signal immediately exits normal Ask route; non-urgent response indicates unknowns and no diagnosis. | Clinical safety validation, jurisdictional emergency wording, monitoring and governance. |
| **10. Family/caregivers** | Separate profile switcher, access state, share scope/revoke state; never visually blend people’s records. | Profile principal/access-control checks at every API/tool; separate context isolation and consent. | Demo can simulate two synthetic profiles, switch, and prove citations/results remain profile-scoped; revoke denies next call. | Verified identity/authority, invite flows, revocation propagation, audit and legal controls. |
| **11. Privacy/control** | “What is stored/used/shared” screen; inspect source/status; correct/remove/export/revoke consent/delete with feedback. | Consent ledger, audit metadata, export/deletion jobs, source/derived dependency cleanup. | Demo offers local fixture export and deletion simulation, with clear completion; revoked consent blocks next run. | Backups, replicas, legal retention, production data subject workflows. |

## 10. Synthetic demo fixture

Use a small fully synthetic dataset designed to exercise all reconciliation and UX states, with every screen showing “Demo profile · fictional data”:

- A fictional person profile, a selected health focus, a user-entered preference.
- Two dated synthetic lab sources with one repeated test and an explicit trend.
- Synthetic clinic note and medication list with a conflict (different dose); mark both sourced and unconfirmed until reviewed.
- One synthetic policy with date, benefit/exclusion clauses and an intentionally missing clause so the UI must say “unknown.”
- One synthetic visit and user-selected visit brief fields.
- One family member in a separate profile to prove isolation and revocation UI.
- Curated external health education records with publisher/date/URL and relevance reason; no assertion that the source describes the person.
- Synthetic PDF/image/video intake examples. The demo extractor may use deterministic fixture outputs, but UI/event must clearly identify “sample analysis” if canned; optionally support a real model extraction adapter using synthetic input only.

For real API calls, `.env` remains on server. The app receives only a session and API URL. If the server is not reachable, app still loads the synthetic scenario from an explicit fixture adapter and marks AI/API capabilities unavailable; it must not silently return fake answers.

## 11. Integration and validation gates

### Gate 0 — Contract freeze

- All 11 screen journeys, mobile responsive layouts, animation/state variants, and acceptance scenarios mapped.
- Palette resolved across blueprint choreography + selected light record timeline; design spec no longer contradictory.
- DTOs, endpoints, capabilities, event envelope agreed and versioned.

### Gate 1 — Profile state

- User inputs/selections survive screen transitions and app restart for the supported demo mode.
- Selected topics remain visibly different from confirmed conditions. Empty fields mean unknown.
- Animation corresponds to saved UI state; reduced motion keeps hierarchy and completion feedback.

### Gate 2 — Source, assertion, timeline

- Source ingestion metadata and accepted assertions persist; source opens to exact page/timecode.
- Corrections preserve superseded value and date. Timeline is derived from record/source state, not hard-coded screenshot items.
- Typed relation has source/state/date; relation UI does not imply causation.

### Gate 3 — Multimodal review

- PDF/image/video pass through real or explicitly sample worker and show progress only from job events.
- Duplicate/new/conflict/replaces/whose cases behave as fixture contract states; accept/edit/reject modifies server-authoritative state and refreshes views.
- Failure/cancel/retry preserve originals and do not add claims.

### Gate 4 — Agent/context

- Consent not granted => no provider call. Scope change or revoked consent invalidates/blocks run.
- Ask reads server registry via tools; no client-supplied full-profile authority; citations resolve only to records actually retrieved.
- Tool/activity sequence is actual and terminal; errors stop the orb/run. Memory proposal has no effect until separate approval; approved write appears in next run.
- Prompt injection in source/web is treated as quoted content. Cross-profile context leakage test uses two synthetic profiles.

### Gate 5 — Other story capabilities

- Coverage citations include both policy and health evidence; unknown does not become gap.
- Feed entries are source/date tagged and saved/dismissed persist.
- Visit brief requires explicit selection; symptom urgent routing precedes LLM; family revoke works; privacy actions report accurate demo-only state.

### Gate 6 — Whole-app walkthrough

Walk all stories on a phone-sized screen and at least one native target. Check safe areas/keyboard/scroll, color contrast, accessible labels, low-motion mode, offline/unavailable, empty/loading/success/error/review, navigation state, and cross-story state. Provide the user a review package: app build or accessible preview, screenshots, short interaction recording, known boundaries, and an acceptance checklist. User validates the product experience, not internal debug output.

## 12. Production boundary (not implied by a successful demo)

Before real records or real accounts: deploy authenticated HTTPS services; enforce tenant/profile authorization and consent server-side; use secure file storage and malware-safe processing; define encryption/key management, retention, backups, export/deletion; add rate/abuse controls, incident logging without payload leakage, vendor/privacy review, source licensing, symptom safety governance, and cross-account isolation evaluation. The demo may prove workflow and design, not legal compliance or clinical reliability.

## 13. Recommended build ordering

1. Lock mobile story wireframes + motion prototype in parallel with the typed entity/event/API contract.
2. Implement synthetic demo session/repository and bootstrap/capabilities API; replace per-screen fake state with shared service-backed state.
3. Complete the profile → source review → registry/timeline → Ask cited answer vertical slice first.
4. Add policy/feed workers, treatment/visit/symptom workflows, family/privacy demo surfaces as bounded story slices.
5. Run each gate and user review before connecting the next story family. Integrate front-end to actual event states continuously; do not wait for all backend work to finish.
6. Once demo stories are accepted, replace demo adapters behind ports with production identity/storage/search/extraction adapters and repeat gates with production safeguards.
