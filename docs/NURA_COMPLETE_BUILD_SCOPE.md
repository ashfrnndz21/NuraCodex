# Nura complete-build scope and acceptance plan

**Purpose:** one measurable definition of a fully built Nura app, including its mobile experience, all eleven user stories, persistent health-data system, agentic intelligence, and production security/privacy readiness. This is the integration contract for design, motion, app state, AI orchestration, testing, and release acceptance.

**Scope baseline:** 24 September 2026. The existing [mobile storyboard](NURA_MOBILE_STORYBOARDS.md), [agentic foundation](NURA_AGENTIC_FOUNDATION.md), and [story acceptance contract](USER_STORY_ACCEPTANCE.md) remain detailed design/architecture references. This document joins them into one completion and testing plan.

## What “100% complete” means

Nura is **100% build-complete** only when (a) all eleven user stories below pass their full in-app journeys and (b) all eight production-readiness gates in this document pass. Synthetic/demo readiness is an intermediate milestone, not 100%. No story counts as complete solely because its route, screen, or prototype exists.

Each story must pass all six gates:

1. **Design:** the implemented screen follows the agreed visual surface: Blueprint v2's deep indigo/plum, peach/lilac atmosphere and orb for onboarding/Nura-led conversation; warm white, charcoal, cobalt record nodes/links, and purposeful mint/amber states for records and evidence. It fits 390 × 844 pt and is checked at 360 × 780 and 430 × 932.
2. **Interaction and motion:** every control changes a meaningful state, has pressed/selected/expanded feedback, and keeps its context through the transition. Motion uses the shared tokens, respects reduced motion, and never implies work the app has not started.
3. **State and provenance:** user-confirmed state persists across routes and supported app restarts; source, time, evidence status, confidence/unknown state, and correction history stay attached where relevant. Test data never leaks across people or registries.
4. **Capability:** the app calls the actual local/domain service or agent path for the promised behavior. Sample-only behavior is labeled. Model writes are proposals until the person approves them.
5. **Visible operations and recovery:** users see real loading/activity milestones, citations, missing information, and recoverable empty, denied, offline, duplicate, conflict, and error states. No hidden chain-of-thought is shown.
6. **Acceptance evidence:** the exact route and scripted journey pass on the app, with typecheck, lint, relevant repository/integration checks, and a phone-sized visual check recorded here. The user is asked to test only after the slice passes internal checks.

A story moves through **Not started → In progress → Internally verified → Ready for user review → Accepted**. Only **Accepted** counts toward 100%. A fix after user review returns that story to In progress and repeats the same test journey.

**Completion math:** report three numbers every time: `accepted stories / 11`, `passed production gates / 8`, and `overall accepted packages / 19`. The overall percentage is `(accepted stories + passed production gates) / 19`; a package counts only after its full acceptance criteria pass. Also report partial work separately so implementation progress is visible without rounding an unfinished story or production capability up to complete. At this audit baseline, **0/11 stories and 0/8 production gates are accepted (0/19 overall)**. This is a strict acceptance baseline, not a claim that no code or partial capability exists.

## Production-readiness gates required for 100%

The synthetic app journeys are necessary but not sufficient. Each production gate requires an implementation, threat/privacy review where relevant, automated verification, and release evidence. No real health data is needed for routine acceptance tests.

| Gate | Current state | Required before 100% | Acceptance evidence |
|---|---|---|---|
| **P1 · Identity and profile isolation** | **Not started:** current agent server is local/single-profile and unauthenticated; family story is not built. | Account creation, sign-in, recovery, server-authoritative active-person identity, authorization on every profile/resource, family/caregiver grants and revocation. | Cross-account/profile isolation tests show reads, writes, files, retrieval, agent tools, and exports cannot cross a grant boundary; revoked access fails immediately. |
| **P2 · Consent and privacy controls** | **Partial:** per-run Ask/search consent and local data inventory/clear controls exist; there is no durable consent ledger, full export, or propagated account deletion. | Purpose-scoped, versioned consent; durable audit history; data inventory; withdrawal; access/correction/export/deletion requests and truthful provider-retention disclosure. | Consent tests block unapproved calls at server boundaries; withdrawal takes effect; audit is reviewable; export/deletion results match every declared store. |
| **P3 · Persistent storage and sync** | **Partial:** native local SQLite state exists; synthetic browser demo state uses localStorage with selected file bytes in IndexedDB; neither is a production account vault. Cloud identity, sync and recovery do not exist. | Encrypted production database/object storage, key management, backups/recovery, multi-device sync, conflict/version handling, retention and account closure. | Restore, conflict, retention and deletion propagation drills pass across primary data, derived indexes, caches, objects and backups according to policy. |
| **P4 · Multimodal record pipeline** | **Partial:** one-at-a-time PDF/image extraction, exact-byte duplicate detection and user review are connected. A local-only video frame sampler is implemented and tested (MP4/MOV/WEBM, up to 3 minutes, six timestamped stills); it is not connected to provider extraction or the app review screen. Audio analysis and production object processing are absent. | Safe PDF/image/video/audio processing, provenance to page/region/timecode, exact and suggested duplicate handling, owner confirmation, review queue, retry/cancel and retention controls. | Synthetic fixtures cover supported formats and failure/duplicate/conflict paths; no unreviewed candidate enters confirmed memory. Capacity and upload limits are verified. |
| **P5 · Agent reliability and health safety** | **Partial:** consent-scoped local Ask, real operational events, source validation and a deterministic initial urgent path exist; formal evaluation, injection/security testing and clinical validation remain. | Server-side policy enforcement, bounded tools, prompt-injection defenses for uploaded/web content, source validation, run cancellation, evaluations, deterministic urgent routing, clinical safety governance. | Cross-profile/consent/tool-abuse tests, citation/grounding evaluations, model failure and urgent-scenario suites pass; no hidden reasoning or unsupported claim is exposed. |
| **P6 · External health discovery and providers** | **Partial:** optional consented allowlisted article search exists; complete feed ranking, video results/details and provider reliability controls do not. | Reliable allowlisted search/feed providers, real article/video metadata, freshness and provenance, provider privacy controls, timeouts/rate limits and graceful unavailability. | Provider contract tests and synthetic end-to-end searches prove consent scope, source links, dates, save/hide behavior and no mixing with the medical registry. |
| **P7 · Operations and security** | **Not started:** the backend is a local development service, not a hosted or monitored production service. | Hosted production environment, secret rotation, transport/storage protection, dependency and vulnerability management, rate limits, abuse controls, monitoring/alerts, incident response and recovery runbooks. | Deployment/security review passes; alerts, restore, outage and incident drills are recorded; no secret or raw health payload appears in logs/traces. |
| **P8 · Release, accessibility and governance** | **Not started:** no release-readiness or clinical/legal sign-off is recorded. | Supported-device coverage, accessibility and reduced-motion review, localized emergency information, clinical/legal/privacy review for target markets, support and release/rollback process. | Signed release checklist, accessibility/device matrix, safety/legal decisions, operational owner and rollback verification are recorded. |

A **demo-ready** checkpoint means all eleven story journeys work with synthetic data in the app. A **production-ready** checkpoint means P1–P8 pass. The overall 100% state requires both. Production readiness is part of the requested build, not an out-of-scope follow-up.

## Build sequence and parallel tracks

Design and backend foundations proceed in parallel; integration happens at explicit gates so no motion or AI trace is wired to a placeholder. The sequence is dependency-based, not a promise that a production health product can be completed in one day.

1. **G0 · Product and visual contract:** shot-by-shot mobile wireframes for all stories; Blueprint v2 scene and orb behavior; warm-white/cobalt record-history palette; shared component, accessibility, and motion/state inventory.
2. **G1 · App and intelligence foundation:** mobile navigation/safe areas; canonical profile/source/assertion/relationship model; identity and consent contracts; service/tool/event schemas; replaceable model, storage, search, extraction and orchestration adapters; synthetic test workspace.
3. **G2 · Profile vertical slice:** onboarding selections and fields → durable profile → cited synthesis → edit/recontextualize → restart and retrieve.
4. **G3 · Intake and Medical Registry:** PDF/image first, then video/audio; duplicate detection → extraction candidates → user review → source-linked registry/wiki → correction/version timeline.
5. **G4 · Agentic Ask:** scope preview/consent → authorized retrieval → bounded tools/workers → operational event stream → cited/uncertain answer → approved memory update → cancel/error recovery.
6. **G5 · Insurance and Explore:** policy intake/review/versioning and evidence-based comparison; consented personalized article/video discovery, source details, save/hide and freshness.
7. **G6 · Care stories:** medicines, visits/actions, symptom support and isolated family/caregiver journeys connected to the same profile, timeline and consent model.
8. **G7 · Privacy and production hardening:** P1–P8 implementation, security/privacy/safety review, operations, data lifecycle and release controls.
9. **G8 · Acceptance and release:** milestone-by-milestone user review after internal verification; fixes rerun the same journey; full clean synthetic pass across all eleven stories and release gates.

At every gate, maintain the integration chain `story → screen → action → state → service/tool → public event → motion/feedback → acceptance evidence`. UI, animation, or agent activity is not marked connected until every link in this chain is real.

### User test handoff format

Each milestone is tested through the normal app flow, on the app build—not by asking the user to inspect logs or debug the implementation. Before a review, the build owner seeds or resets a clearly labeled synthetic test workspace, opens the story at its real starting route, and supplies a short action list plus observable pass points. The user should never need to enter personal health data, discover broken controls, or reconstruct the intended journey. A milestone is shown only after its internal checks pass; if it is not ready, say so and continue other build work. A development-only fixture/reset control may support repeatable scenarios, but must be visually separated from real user data and must never silently overwrite it.

## Shared app foundations that every story uses

### Mobile design and motion

- One stable phone shell and thumb-accessible navigation; safe areas, keyboard, scroll, sheet and bottom navigation are verified on target phone widths.
- Blueprint scenes and record/evidence scenes stay distinct as described in the mobile storyboard. Data colors have consistent meaning; category color is reinforced by label/icon.
- Shared motion tokens cover press, selection, expansion, sheet, navigation, loading, stream, success, error, and undo. Cards preserve identity as they expand; important source paths are drawn/highlighted only after an actual selection or event.
- The orb reflects the live AI state only: idle, listening, retrieving/thinking, responding, or error. State changes come from focus/composer or real run events, never a timer.
- Every animation has a reduced-motion equivalent with the same information, actions, and focus state.

### Stateful health record and memory model

- Keep original source/assets separate from extracted candidate claims and accepted assertions.
- Accepted facts retain person/profile scope, source ID and location, event/record date, recorded-at time, evidence state, confidence/unknown status, validity range and version/supersession links as applicable.
- Corrections append a version; they never silently erase earlier values. Deduplication identifies likely matches and lets the person resolve them; exact duplicate bytes may be safely identified without claiming perceptual identity.
- Relationships are typed and user-authored/confirmed. They mean “linked in this record,” not causation. Every node and line resolves to its underlying record/source.
- Current summaries and AI retrieval use only current accepted facts unless the user explicitly asks for history. Rejected, pending, superseded, or another person's records are excluded by policy.

### Agentic AI and orchestration

- Every run has an intent, a user-visible scope preview, consent for the selected context/tools, a run ID, bounded plan, and a cancellation/error path.
- A server-side supervisor selects registered tools and specialist workflows. Provider/model, persistence, retrieval and web search sit behind replaceable adapters/ports; API keys remain server-side.
- Registry retrieval is scoped to the active person, consented sources and question. Uploaded documents/web pages are untrusted evidence, not instructions.
- Document extraction produces candidate claims only. Insurance analysis uses cited policy and health evidence, distinguishes covered / excluded / unclear / not found, and does not infer a gap from missing text. Symptoms use deterministic escalation before any language generation. Family authorization belongs to policy checks, never a model.
- UI activity is a sanitized event stream from real services: for example consent checked, records searched, sources compared, evidence found, answer prepared, awaiting user approval, completed or failed. Do not expose model scratchpad, private chain-of-thought, prompts, raw tool arguments, or unreviewed health text in traces.
- A proposed memory write or consequential action is typed, cited, previewed and approved by the user before persistence/action. Answer validation rejects unsupported citations and reports uncertainty/missing evidence.

### Multimodal intake and registries

- PDF/image intake keeps the original, exact-byte duplicate check, extraction result, page/quote or image region where available, and review state. No candidate enters accepted memory until accepted/edited by the person.
- Video/audio support requires an actual upload, safe decoding/transcription/frame sampling service, timestamped candidate evidence, review UI, cancellation, failure recovery and duplicate handling. A video icon or generic upload is not video support.
- Insurance, health, treatment, care, and reading records stay distinct while exposing navigable, consent-scoped links.

## Eleven in-app milestone tests

Run every test using the app's synthetic profile and records. Do not enter personal health or identity data. “Pass evidence” is a concrete observed state or event, not an animation that merely looks plausible.

| ID / story | In-app journey to test | Pass evidence |
|---|---|---|
| **M1 · Living 720 profile** | Start at `/`; choose the profile owner; enter synthetic identity fields; select Blood pressure, then a follow-up bubble; deselect the parent; observe the live profile; run first synthesis; inspect its sources/unknowns; correct a detail; save the new version; return to the profile. | Correct dependent bubbles appear/disappear; map and counts follow saved state; synthesis cites only entered/selected evidence; user can edit/recontextualize; correction is versioned; all steps remain phone-sized and reduced-motion-safe. |
| **M2 · Medical Registry / wiki** | From Home open History (`/(tabs)/health`); add a synthetic PDF/image; process it; review an extracted candidate; accept one, edit one, reject one; open the topic/record source; correct an accepted value; navigate back to its prior value/source; connect a synthetic record to a chosen topic; create a source-only summary through the consented Ask flow; inspect citations and unknowns; save it; change linked evidence; confirm it becomes stale; refresh and open the earlier summary. | Original remains available; page/quote is shown when extraction supplies it; candidate decisions are distinct; accepted facts carry source/date/version; rejected/pending/superseded values do not enter current Ask context; each summary claim cites an authorized retrieved source; chat history is excluded from summary runs; linked source changes invalidate freshness; refresh preserves the prior version; browser and native persistence limitations are labeled honestly. |
| **M3 · Insurance Registry** | Open Insurance (`/insurance`); add a synthetic policy; process and review benefits/limits/exclusions/dates; accept/edit/reject terms; ask whether a selected synthetic care need is covered; open every citation and inspect “not found” vs “excluded.” | Each determination cites a valid policy clause and selected health evidence; missing language is “unclear/not found,” not a fabricated denial; policy versions and conflicting clauses remain inspectable; consent and run activity are visible. |
| **M4 · Personalized health feed** | Open Explore (`/(tabs)/services`); select up to three synthetic profile topics; review and grant the per-search consent; search; open a result detail; inspect excerpt/topic reason/brief; open original publisher; save, hide, undo and return to Saved. Include at least one actual video result before calling video coverage complete. | Only consented topic labels are sent; real search events are shown; source and retrieval/publication date status are honest; article/video type is real; save/hide persists in native state; feed remains separate from the medical record. |
| **M5 · Ask Nura / grounded agent** | Open Ask (`/ask`); enter a cross-registry question; inspect the scope and separate context choices; approve the run; watch actual milestone events; inspect answer citations/unknowns; open sources; propose a correction and approve it; cancel/error a separate synthetic run. | Server enforces scope even if a client submits extra context; each citation resolves to evidence used; missing/conflicting evidence is stated; no chain-of-thought or timer trace appears; no memory/action write occurs until approval; cancellation/failure leaves state consistent. |
| **M6 · Medicines and treatment** | Open Treatment (`/treatment`); add a synthetic current item with user-entered source/purpose/dose/schedule; edit it; mark it past; inspect version history and timeline; ask about it once with treatment context off and again with explicit opt-in. | Current/past state and revisions persist; user-entered vs sourced values are labelled; context is absent when off and cited when on; symptom runs always exclude treatment records. |
| **M7 · Visits and care actions** | Open Care/Visits (`/visits`); create a scheduled and an unscheduled synthetic visit; select a small brief; preview; add outcome and a source reference; add a dated follow-up action; mark it done, reopen it, and inspect history. | Brief contains only selected records/questions; outcome/action links persist with dates and sources; no clinician advice is invented; state changes require user action; Ask includes these records only with the separate opt-in. |
| **M8 · Health timeline and connections** | Open History; switch Timeline/Connections; filter by Documents, Care, Treatment and Vitals; select nodes and cards; expand source; connect two chosen facts with a relation label; follow each endpoint; correct a fact and navigate between versions. | Typed nodes, labels, rails and links use the agreed light/cobalt/category palette; selection updates node and card together; connections are user-authored and do not imply causation; each endpoint/source resolves; dates and version states are clear on a phone. |
| **M9 · Bounded symptom support** | Open Symptoms (`/symptoms`); run a scripted non-urgent synthetic scenario with consent and a scripted urgent-warning scenario; inspect both activity/result paths; leave without saving, then explicitly save a user-authored note. | Deterministic urgent escalation bypasses the model; no diagnosis/prescription is presented; treatment and visit context is excluded; information remains transient until explicit save; language clearly directs urgent local care when triggered. |
| **M10 · Family and caregivers** | Open Profile/People; create a second synthetic person; add unique facts/source; switch between profiles; ask the same question in each; grant a narrow demo sharing scope, inspect it, revoke it, and switch again. | Person IDs and all records/sources/conversations remain isolated; the UI always names the active person; no retrieval/tool can cross profiles; sharing scope/recipient/revocation is visible and auditable. If isolation cannot be enforced, the capability stays blocked and is not simulated as safe. |
| **M11 · Privacy and control** | Open Privacy (`/privacy`); inspect data inventory/source map; withdraw AI/search consent; export a synthetic profile; delete a selected record; clear local app data and the demo processor repository separately; restart and inspect resulting state. | Inventory reflects actual stores; withdrawal blocks later calls; exports contain only selected profile data; confirmations name their scope; deletion reaches each stated store and reports incomplete propagation honestly. |

## Cross-story interaction acceptance run

For each milestone, verify the same six interaction families in context:

- **Tap/press:** button gives the small press response, performs the labelled action once, and visibly updates state.
- **Selection:** selected chip/node shows fill + outline + text/icon; count/profile/summary changes only after state commits.
- **Expansion/navigation:** card remains anchored while details reveal; source sheet/back path returns to the same timeline item; no static unexplained page hop.
- **Real operation:** start event appears when service begins; progress comes from event stream; success/error/timeout/cancel resolves the orb and composer to correct state.
- **Review/write:** accept/edit/reject and proposed memory changes retain the source and append an audit/version event; approval is explicit.
- **Reduced motion:** toggle OS reduced motion; all controls, statuses, scope and story evidence remain available while drift, shimmer, breathing and travel stop or shorten.

## Internal verification and user test gates

**Internal before every handoff:** typecheck; lint; repository tests; affected port/conformance/property tests as added; synthetic backend integration for new service paths; event/citation validation; accessibility tree/tap-target review; phone visual pass at 390 × 844, 360 × 780 and 430 × 932; normal and reduced motion; empty/loading/error/permission/offline/retry states. Keep API keys out of output and use synthetic inputs.

**User review:** present only a milestone marked Ready for user review. Give the exact in-app starting route, a short scripted action sequence, and objective success points. Capture user feedback against the relevant story, implement fixes, then rerun the same sequence before moving to the next milestone. The user is the product decision-maker, not the test engineer responsible for finding implementation defects.

**Full acceptance:** after M1–M11 pass independently, run one clean synthetic end-to-end pass through profile setup, records, registries, insurance, feed, Ask, treatment, care, history, symptom support, second-person isolation, and privacy controls. Then execute P1–P8 release checks on the production-equivalent environment. Verify the mobile app and its mobile-sized browser preview; browser preview alone cannot pass a native/device criterion. Only when all 19 packages pass can Nura report **100% build-complete**.

## Current status at scope-baseline audit

This is a snapshot, not a claim that the app is nearly finished.

| Story | Baseline status | What already exists | Main remaining acceptance gap |
|---|---|---|---|
| 1 | In progress | Dynamic profile topics/map and first cited synthesis | Complete shot-by-shot onboarding, persistence/recovery and full edit/recontextualize journey |
| 2 | In progress | Local facts/files, PDF/image review path, source details, user fact versioning, prior-source navigation, topic registry page, explicit record-to-topic linking, topic-scoped Ask, append-only extracted-claim correction versions, and a consented source-linked brief with validated citations/unknowns, stale-on-evidence-change behavior and retained prior summary versions | Complete intake-to-wiki acceptance, broader cross-registry provenance, browser refresh persistence, native-device persistence/motion acceptance, and remaining M2 edge/error states |
| 3 | In progress | Policy extraction/review and cited typed coverage result | Policy history, source navigation and complete comparison journey |
| 4 | In progress | Consent-scoped search, save/hide, source-linked article detail | Video discovery/detail, publication dates and complete persistence/editorial path |
| 5 | In progress | Connected demo Ask run, real events, citations, unknowns, approved proposals | Full registry tools, broader orchestration/evaluation, consent history and failure/cancel coverage |
| 6 | In progress | Local treatment registry, dated edits, Ask opt-in | Full source/version links and complete end-to-end test |
| 7 | In progress | Visits, selected brief, outcomes, actions and Ask opt-in | Export/share, reminders, full review and error states |
| 8 | In progress | Light/cobalt timeline, readable dates, separate card/action controls, user correction versions and direct prior-source navigation | Provenance-backed relationships, extracted claim versions, zoom/navigation and full acceptance |
| 9 | In progress | Bounded symptom flow and deterministic urgent path | Clinical safety evaluation, localization, edge cases and full acceptance |
| 10 | Not started | No family profile implementation | Separate profiles, scoped sharing, revocation, audit and isolation tests |
| 11 | In progress | Data inventory and local/demo deletion controls | Consent history, export, per-record control, propagated deletion and full verification |

**Current accepted-story count: 0/11; production gates: 0/8; overall: 0/19 (0%).** Keep existing partial capabilities visible in milestone evidence; do not inflate these counts until an entire story or release gate passes.

## Progress-report format

Every 30-minute update should state:

1. **Overall completion:** accepted X/19 packages and percentage, plus separate story X/11 and production-gate X/8 counts.
2. **Completed since prior update:** exact files/capabilities and the exact internal check or app journey that passed.
3. **Current work:** milestone, concrete acceptance criterion, and what's still open.
4. **Next:** one concrete implementation slice and the evidence it will produce.
5. **User-test milestone:** only a milestone already internally verified, with its in-app route, synthetic setup, short steps, and visible success points; otherwise state “none ready.”
6. **Blockers/risks:** specific blocker, owner/action needed, and affected acceptance package.
7. **Scope remaining:** the next open story and production gates, with partial foundations named separately.

Never describe a plan as completed work, a screen as a completed story, a configured API key as a validated AI flow, or an attempted test as a passing test. Do not ask the user to debug unfinished work. If the user owes a product decision, keep building independent work and clearly name the decision gate.
