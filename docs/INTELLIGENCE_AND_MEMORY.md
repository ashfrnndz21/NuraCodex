# Nura intelligence and memory foundation

## Product contract

Nura builds a user-controlled, source-linked 720 profile over time. It must distinguish what a person entered, what a record says, what an external source says, and what Nura infers. A file is never itself a confirmed health fact. A conversation is never silently promoted to medical history. Every durable item can be inspected, corrected, superseded, or removed by the profile owner.

The assistant must say when a connection, answer, or service is unavailable. No result may be fabricated to make a screen feel intelligent.

## The 720 profile as a living map

The 720 profile is organized into domains, not a completion score that pressures someone to disclose. Domains can include:

- Identity and current biometrics
- Conditions, symptoms, and goals
- Medical history and family history
- Lab results, scans, documents, and other records
- Medicines, treatments, adherence, and side effects
- Lifestyle and self-reported behaviors
- Care team, clinics, hospitals, and encounters
- Insurance policies, benefits, exclusions, and claims

Each domain has an honest state: `not_started`, `user_added`, `source_added`, `needs_review`, `partially_understood`, or `reviewed`. The interface should explain what the state means and offer a next step. Empty means unknown, not “healthy.” A profile can be useful before every domain is filled.

## Canonical record model

Store normalized records separately from the words used to explain them. Every record should carry provenance and time.

```ts
type EvidenceState = 'candidate' | 'needs_review' | 'user_confirmed' | 'rejected' | 'superseded';
type Origin = 'user_entered' | 'document_extraction' | 'connected_record' | 'external_source' | 'agent_inference';

type HealthAssertion = {
  id: string;
  profileId: string;
  kind: 'measurement' | 'condition' | 'symptom' | 'medication' | 'treatment' |
        'allergy' | 'family_history' | 'lifestyle' | 'care_event' | 'coverage_term' | 'other';
  subject: string;
  value: unknown;
  unit?: string;
  effectiveAt?: string;
  recordedAt: string;
  origin: Origin;
  evidenceState: EvidenceState;
  sourceId?: string;
  sourceLocation?: { page?: number; startOffset?: number; endOffset?: number; timestampSeconds?: number };
  confidence?: number;
  validFrom: string;
  validUntil?: string;
  supersedes?: string;
  userNote?: string;
};
```

A `Source` stores a document or connected record's identity, hash, media type, owner, local or remote storage reference, import time, processing state, and consent scope. The source must remain navigable from every extracted assertion back to the exact page, region, or video time when available.

Relationships are first-class records too. Each relationship has a type, source evidence, time scope, and review state. “Mentioned together” must not turn into “caused by.” Correlation, temporal order, clinical guideline, and causal inference are different labels and must not be visually conflated. The current app now stores explicit user-selected link types (`same_source`, `happened_around`, `measured_during`, `treatment_for`, `related_by_me`, or `user_note`) and passes that type into Ask only when the user includes their links for that run. These are user-authored associations, not evidence-backed or model-generated medical relationships; source evidence, validity windows, and correction history are still required for the canonical relationship model.

## Memory layers and lifecycle

1. **Profile facts:** structured items deliberately added by the user or accepted after review. These are durable until changed, expired, or deleted. Keep their origin and valid-time window.
2. **Source claims:** extracted statements from a document or connected record. These begin as candidates, retain exact source locations, and remain outside confirmed profile facts until reviewed.
3. **User preferences:** explicit communication choices such as preferred name, units, accessibility, and what topics to avoid. Store only when the user expresses or confirms them.
4. **Conversation context:** current thread and task state. This can support follow-up questions in that conversation but is not automatically durable profile memory.
5. **Suggested relationships and summaries:** derived views computed from accepted source records. Keep them reproducible from inputs, label them as generated, and invalidate/recompute them when source facts change.

Every memory write must record who or what created it, the confidence or review state, a validity window where applicable, the source, and the user's permission scope. A user correction creates a new version and marks the old value superseded; it should not erase the audit trail. Deletion must remove the active record and follow the application's retention/deletion policy for source files, derived summaries, and backups.

## Document and media intake state machine

```text
selected_on_device
  -> metadata_saved
  -> awaiting_processing_consent
  -> local_demo_upload -> exact_hash_check
  -> extracting_pdf_or_image -> candidate_review
  -> accepted_into_registry | rejected | processing_error
```

The current mobile demo supports one PDF or JPEG/PNG/WEBP image per review. After a clear consent action, it sends the selected bytes to the loopback development service and configured model. The local service checks the exact SHA-256, keeps the source metadata and candidate claims in its demo repository, and uses the raw bytes only during that request. The original remains on the device. The browser demo now keeps synthetic workspace state in localStorage and selected file bytes in IndexedDB so a test journey can survive refresh. This is local browser storage, not an encrypted account vault or production-secure upload service; use fictional data only and clear the workspace when finished.

Exact hashing detects byte-identical repeats only. Image perceptual matching may surface a possible visual duplicate but must require user confirmation. PDF and image extraction returns candidate details and available page/quote provenance; video/audio timestamped extraction, batch intake, perceptual duplicate suggestions, authenticated storage, and shared source synchronization remain future work. Do not merge repeated records just because filenames or values match.

Extraction produces typed candidate claims with source spans, normalized value/unit where possible, confidence, and parser/model version. Nura presents the original evidence alongside each claim, lets the user edit/accept/reject it, and only then writes accepted facts to the registry. Low confidence, conflicting dates/units, or ambiguous patient identity must stop for user review.

## Question handling and grounded agent loop

```text
receive_question
 -> identify intent and profile scope
 -> check identity, consent, and permitted sources
 -> retrieve relevant accepted facts + reviewable source claims
 -> check recency, conflicts, missing evidence, and domain rules
 -> ask a clarifying question OR compose a cited answer
 -> show uncertainty and safe next actions
 -> offer (never silently perform) any durable memory write
```

The language model must not query the database directly. A context builder retrieves a bounded evidence packet through application services; the model receives only data authorized for the active user and task. The packet should contain source IDs/locations, dates, confidence/review states, and explicit “unknown” fields. Tool calls and sensitive decisions are auditable without putting health content into ordinary application logs.

Answers should separate:

- **What your records say** — direct, cited evidence.
- **What may be related** — a qualified inference, with its evidence and limits.
- **What I can't tell from this profile** — missing or conflicting information.
- **What you could do next** — a question, record to add, or professional follow-up; not a diagnosis.

For a question like “Based on my medical state, what does my insurance not cover?”, Nura must retrieve the actual policy terms and relevant user-confirmed health context. It should compare only what the documents support, cite both sides, identify missing plan documents or definitions, and label the result as a coverage interpretation rather than a guarantee. Without policy evidence, it should ask for the policy or state that it cannot determine coverage.

## Agent boundaries

Keep specialized work behind replaceable service interfaces, so an AI or extraction vendor can change without rewriting the profile UI:

- `DocumentIntake`: safe receipt, metadata, hash, consent, processing status.
- `Extraction`: OCR/transcription and candidate claims with evidence locations.
- `Registry`: validated profile facts, source links, versions, and relationship queries.
- `ContextBuilder`: authorization-aware retrieval and compact evidence packets.
- `Conversation`: intent routing, clarification, grounded answer composition, and tool use.
- `Search`: approved health sources, freshness, ranking, and visible citations.
- `MemoryPolicy`: allowed writes, validity windows, review requirements, correction, deletion.
- `ConsentAndAudit`: user permissions and decision traces without leaking sensitive payloads.

An orchestration layer coordinates these services but is not itself the trusted source of health facts. Provider adapters must never bypass authorization, consent, evidence, or audit policy. Do not put provider API secrets in the mobile app.

## UI and animation contract for intelligence

The orb and surrounding visual system should represent real states: listening, retrieving, processing a selected source, waiting for review, asking a clarification, responding with evidence, or unavailable. Each state has a label and accessible text equivalent. No indefinite “thinking” animation when no backend request is running. Reduced-motion settings must replace continuous movement with a stable state marker.

A relationship visualization is generated from stored, typed relationships. Selecting a node reveals its source, date, review state, and why it is connected. Filters should let the user show current vs. historical, confirmed vs. needs-review, and a chosen domain. Animations explain a transition or highlight an evidence path; decoration must not imply certainty.

## Build sequence

1. Complete the mobile visual language and dense, immersive onboarding/profile map.
2. Extend the local record model from profile and file metadata to typed user-entered facts, provenance, corrections, and deletion.
3. Build the registry timeline and graph from real persisted entities/relationships only.
4. Add an authenticated, privacy-reviewed backend and consent-scoped upload flow; define retention, export, and deletion.
5. Add extraction as candidate claims with source locations and an explicit review step.
6. Add grounded Ask with context retrieval, citations, uncertainty, and memory-write proposals.
7. Add source-backed health discovery and later insurance comparison, validating each domain separately.

Implementation status (24 September 2026): the app has a local development Ask agent for selected user-entered facts, selected health areas, and user-authored typed links. Each run asks for explicit category-level consent, retrieves bounded evidence through local profile tools, streams actual activity/evidence milestones, validates source references, and offers memory only as a user-approved write. Conversation, trace, and citations persist in the native encrypted local database; browser preview state remains in memory only. The agent can also retrieve accepted claims in the local source repository, compare reviewed insurance terms with selected health details, and search allowlisted public health sources only when explicitly enabled.

The local backend is not the authenticated production backend described in step 4. It has no account identity, cross-device storage, deployed HTTPS API, cloud deletion/export service, or server-side multi-profile authorization. PDF/image extraction and insurance analysis exist only as consent-gated local demo flows; Ask does not receive raw file bytes. The app must continue to state these deployment and scope boundaries clearly.

## The “LLM wiki” model

Treat the personalized health wiki as a durable, navigable layer over the canonical registry. The LLM may draft and refresh explanations, but the database of sourced assertions, user edits, and explicit relationships remains the authority. Never make a generated paragraph the only place a health fact exists.

A wiki page can represent a topic or entity such as a condition, medication, care provider, lab trend, insurance policy, or coverage question. Each page should contain:

- A short synthesis in plain language, with every factual sentence linked to evidence.
- Current values and relevant history, kept distinct from historical or superseded information.
- Evidence cards that open the original source and its page, region, date, or timestamp.
- Related pages connected by typed relationships such as `treats`, `prescribed_at`, `measured_during`, `covered_by`, or `mentioned_with`.
- Open questions, conflicting evidence, missing records, and the reason the page is incomplete.
- “Updated from” and “last reviewed” information, plus controls to correct, hide, or remove material.

A relationship is not an invisible model association. Persist the relation type, source assertion(s), time range, confidence/review state, and whether it is user-confirmed or system-suggested. The graph view and wiki pages render those persisted relations; they do not invent new edges while drawing.

### Keeping pages persistent and fresh

When an accepted record changes, append a domain event such as `fact_added`, `fact_corrected`, `source_reviewed`, `medication_stopped`, `policy_replaced`, or `consent_changed`. A page dependency index maps evidence IDs to the pages and summaries that used them. Mark those pages `refresh_required`; regenerate only affected summaries. Persist a snapshot with its cited evidence IDs, evidence-set hash, generation time, model/prompt version, and current/stale state. Retain prior snapshots for explainability, but always resolve active values from the canonical records.

On a question, retrieve the relevant wiki pages as navigation hints, then verify important claims against current canonical records and source evidence. If the cited evidence has changed, the old summary is stale and must not be presented as current. If generation is unavailable, show the structured record and source cards without pretending that the synthesis was refreshed.

Example page state:

```ts
type WikiPageSnapshot = {
  pageId: string;
  profileId: string;
  title: string;
  summary: string;
  evidenceIds: string[];
  evidenceSetHash: string;
  generatedAt: string;
  promptVersion: string;
  modelVersion: string;
  state: 'current' | 'refresh_required' | 'needs_review' | 'generation_unavailable';
};
```

### Persistence scope

There are three different meanings of persistent, and Nura should name them accurately:

- **Across screens and app restarts on one device:** local encrypted database and app-private files. This is the current foundation.
- **Across devices and reinstalls:** authenticated server-side profile database, encrypted file storage, backup/recovery, and account-level deletion/export. Not yet implemented.
- **Across conversations:** durable, permission-scoped registry and wiki records loaded by the context builder on each new conversation. This does not require retaining every transcript or relying on the model's hidden conversation memory.

Cloud sync must be opt-in and designed with a threat model, key management, retention, export, and deletion before sensitive records are uploaded. Until then, the local profile remains the source of truth on that device; reinstalling may remove it. Never imply cloud persistence when it is not configured.

### Wiki update permissions

The model can propose a summary, relation, or extracted claim. A policy layer checks source quality and consent. User-entered facts can be saved as self-reported. Document-derived facts wait in `needs_review`. Model-only medical inferences remain suggestions and cannot become confirmed facts. The user can approve, edit, reject, or ask why an item appears. Every approved change records the user's action and its source.
