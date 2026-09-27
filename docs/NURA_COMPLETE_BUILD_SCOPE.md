# Nura complete-build scope and acceptance plan

**Purpose:** one measurable definition of a fully built Nura app, including its mobile experience, all eleven user stories, persistent health-data system, agentic intelligence, and production security/privacy readiness. This is the integration contract for design, motion, app state, AI orchestration, testing, and release acceptance.

**Scope baseline:** 24 September 2026. The existing [mobile storyboard](NURA_MOBILE_STORYBOARDS.md), [agentic foundation](NURA_AGENTIC_FOUNDATION.md), and [story acceptance contract](USER_STORY_ACCEPTANCE.md) remain detailed design/architecture references. This document joins them into one completion and testing plan.

**Latest checkpoint:** 27 September 2026, 13:01 +08. Strict acceptance remains 0/11 user stories, 0/8 production gates, 0/19 packages (0%). The local synthetic sample/zero-topic browser rehearsal passes 23/23; the ordinary connected-upload rehearsal passes 19/19 through the compiled app, including retry, cancellation, evidence review, one save, source-linked `/health` and reload. Same-date conflicting values remain separate for review, and a missing event date remains unknown rather than inheriting the report date. Provider output is injected in memory; no external provider or personal health data is used. Saved Ask answers now reuse the structured answer layout and persist meaning, unknowns and next steps in answer metadata. The repository suite is 284/284, latest slices 87/87, review accessibility 7/7, typecheck, no-cache lint and diff check pass. The `/ask` web preview was inspected; native phone/reduced-motion acceptance and semantic grounding evaluation remain open. Production identity, owner isolation, native restart and the other story/gate criteria remain open.

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

### Design and writing guardrails from the supplied references

The references inform presentation only. Nura should use compact, source-linked result cards with a short plain-language summary, distinct evidence/meaning/unknown/source sections, and expandable detail. Translucent category surfaces may group related information, but text must remain high-contrast and status must not rely on color alone. Analysis progress should show only real service events, with clear cancellation/error/wait states and no hidden model reasoning. Trends require multiple dated, comparable measurements; no invented forecasts, scores, diagnoses or personal treatment recommendations may be copied from mockups. See [EXPERIENCE_DESIGN_SPEC.md](EXPERIENCE_DESIGN_SPEC.md) for the full interaction contract.

**Completion math:** report three numbers every time: `accepted stories / 11`, `passed production gates / 8`, and `overall accepted packages / 19`. The overall percentage is `(accepted stories + passed production gates) / 19`; a package counts only after its full acceptance criteria pass. Also report partial work separately so implementation progress is visible without rounding an unfinished story or production capability up to complete. At this audit baseline, **0/11 stories and 0/8 production gates are accepted (0/19 overall)**. This is a strict acceptance baseline, not a claim that no code or partial capability exists.

## Production-readiness gates required for 100%

The synthetic app journeys are necessary but not sufficient. Each production gate requires an implementation, threat/privacy review where relevant, automated verification, and release evidence. No real health data is needed for routine acceptance tests.

| Gate | Current state | Required before 100% | Acceptance evidence |
|---|---|---|---|
| **P1 · Identity and profile isolation** | **Preview slice only; gate not passed:** the app starts behind a clearly labeled, local synthetic email/mobile code rehearsal. The fixed fictional preview profile is not an account, no message is sent, and the agent server remains local/single-profile and unauthenticated; family story is not built. | Verified account creation/sign-in by email or mobile one-time code, resend/expiry/recovery, secure session handling, server-authoritative active-person identity, authorization on every profile/resource, and family/caregiver grants/revocation. Demo verification must be visibly synthetic and cannot count as production auth. | Auth tests prove unverified/expired/replayed codes cannot open a profile; cross-account/profile isolation tests show reads, writes, files, retrieval, tools and exports cannot cross a grant boundary; revoked access fails immediately. |
| **P2 · Consent and privacy controls** | **Partial:** per-run Ask/search consent and local data inventory/clear controls exist; there is no durable consent ledger, full export, or propagated account deletion. | Purpose-scoped, versioned consent; durable audit history; data inventory; withdrawal; access/correction/export/deletion requests and truthful provider-retention disclosure. | Consent tests block unapproved calls at server boundaries; withdrawal takes effect; audit is reviewable; export/deletion results match every declared store. |
| **P3 · Persistent storage and sync** | **Partial:** native local SQLite state exists; synthetic browser demo state uses localStorage with selected file bytes in IndexedDB; neither is a production account vault. Cloud identity, sync and recovery do not exist. | Encrypted production database/object storage, key management, backups/recovery, multi-device sync, conflict/version handling, retention and account closure. | Restore, conflict, retention and deletion propagation drills pass across primary data, derived indexes, caches, objects and backups according to policy. |
| **P4 · Multimodal record pipeline** | **Partial:** multi-file intake presents one explicit consent naming every staged file, processes sequentially with per-file events, persists each original-to-source link before marking it ready, continues after a file error, and preserves completed files when stopped. `/review` loads source-matched claims across staged files and computes exact label/unit/value/date repeat and same-date-difference cues; it never auto-merges. Claim decisions and selected self-reported notes share one staged review queue and one explicit save action; each item is still committed separately under that action so one failed item remains retryable. An optional note can now be organized by local text rules only after a separate, per-note fictional-sample confirmation; exact quoted suggestions and unresolved passages stay pending and source-linked. This is not AI interpretation and makes no provider call. Synthetic placeholders without file bytes are excluded from intake. Cross-file cues still need a multi-file UI run. Perceptual duplicate suggestions, audio transcription/provider analysis and production object processing remain open. | Multi-file health intake with self-reported notes, safe PDF/image/video/audio processing, provenance to page/region/timecode, exact and suggested duplicate handling, active-person confirmation, evidence review, retry/cancel and retention controls. | Synthetic fixtures cover batch and each supported format plus failure/duplicate/conflict paths; provider transfer follows explicit consent; activity, citations and timecodes are accurate; no unreviewed candidate enters confirmed memory. |
| **P5 · Agent reliability and health safety** | **Partial:** consent-scoped local Ask, real operational events, source validation and a deterministic initial urgent path exist. Ask now aborts the active request and keeps streamed answers/memory proposals provisional until a successful terminal event. Formal evaluation, injection/security testing, consent history and clinical validation remain. | Server-side policy enforcement, bounded tools, prompt-injection defenses for uploaded/web content, source validation, cancellation, evaluations, deterministic urgent routing, clinical safety governance. | Cross-profile/consent/tool-abuse tests, citation/grounding evaluations, model failure and urgent-scenario suites pass; no hidden reasoning or unsupported claim is exposed. |
| **P6 · External health discovery and providers** | **Partial:** optional consented allowlisted article search exists. The interface now labels the retrieval date separately and does not imply that it is a publisher date. Complete feed ranking, verified publication-date extraction, video results/details and provider reliability controls remain open. | Reliable allowlisted search/feed providers, real article/video metadata, freshness and provenance, provider privacy controls, timeouts/rate limits and graceful unavailability. | Provider contract tests and synthetic end-to-end searches prove consent scope, source links, dates, save/hide behavior and no mixing with the medical registry. |
| **P7 · Operations and security** | **Not started:** the backend is a local development service, not a hosted or monitored production service. | Hosted production environment, secret rotation, transport/storage protection, dependency and vulnerability management, rate limits, abuse controls, monitoring/alerts, incident response and recovery runbooks. | Deployment/security review passes; alerts, restore, outage and incident drills are recorded; no secret or raw health payload appears in logs/traces. |
| **P8 · Release, accessibility and governance** | **Not started:** no release-readiness or clinical/legal sign-off is recorded. | Supported-device coverage, accessibility and reduced-motion review, localized emergency information, clinical/legal/privacy review for target markets, support and release/rollback process. | Signed release checklist, accessibility/device matrix, safety/legal decisions, operational owner and rollback verification are recorded. |

A **demo-ready** checkpoint means all eleven story journeys work with synthetic data in the app. A **production-ready** checkpoint means P1–P8 pass. The overall 100% state requires both. Production readiness is part of the requested build, not an out-of-scope follow-up.

## Build sequence and parallel tracks

Design and backend foundations proceed in parallel; integration happens at explicit gates so no motion or AI trace is wired to a placeholder. The sequence is dependency-based, not a promise that a production health product can be completed in one day.

1. **G0 · Product and visual contract:** shot-by-shot mobile wireframes for all stories; login-first setup contract; Blueprint v2 scene and orb behavior; warm-white/cobalt record-history palette; shared component, accessibility, and motion/state inventory.
2. **G1 · Identity and app foundation:** implement verified email/mobile one-time-code auth, recovery and the active-person boundary before collecting health data; then connect mobile navigation, canonical profile/source/assertion/relationship models, consent contracts and a synthetic test workspace.
3. **G2 · Profile and first health-history vertical slice:** verified sign-in → profile owner and required name → topic word cloud/details → one batch of files plus self-report → explicit consent → real extraction/review events → edit/confirm/reject → approved-only memory save → source-linked month/year timeline → restart and re-entry.
4. **G3 · Medical Registry continuation:** incremental PDF/image/video/audio intake, duplicate detection, evidence review, source-linked wiki, correction/version timeline, and recovery without reprocessing accepted sources.
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
| **M1 · Living 720 profile and first history save** | Start at the login route; verify a synthetic account by email/mobile TAC; select the active profile owner; enter the required profile name; choose more than four topics and one topic’s details, then also verify skip-to-upload; add multiple synthetic health files plus a plain-language note in one batch; grant processing consent; observe real extraction/duplicate/date/topic/conflict events; review one clear, one edited, one rejected and one unresolved item; save approved facts; open the resulting month/year history; leave and re-enter without reprocessing sources. | Unverified identity cannot open a profile; selection has no four-topic cap and does not assert a diagnosis; upload is independent of topic selection; candidate claims show exact evidence and remain out of memory until accepted; unclear items remain pending; saved memory and timeline keep source, event date, owner and correction history; the same journey works on phone sizes and with reduced motion. |
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
| 1 | In progress | Dynamic tracking topics; approved evidence-first profile overview separating tracking interests from reviewed records; local synthetic sign-in/profile rehearsal; profile persistence loader has SQLite close/reopen coverage; one-consent staged-file processing with per-source extraction events and persisted links; one staged claim/note review queue with a single explicit save action; placeholder demo records are prevented from entering the file pipeline | Email/mobile login and recovery are absent; complete auth-first implementation; repeatable synthetic multi-file UI review and save; self-report interpretation; cross-file topic matching; timeline and re-entry; native/device motion acceptance |
| 2 | In progress | Local facts/files, PDF/image review path, source details, user fact versioning, prior-source navigation, topic registry page, explicit record-to-topic linking, topic-scoped Ask, append-only extracted-claim correction versions, and a consented source-linked brief with validated citations/unknowns, stale-on-evidence-change behavior and retained prior summary versions | Complete intake-to-wiki acceptance, broader cross-registry provenance, browser refresh persistence, native-device persistence/motion acceptance, and remaining M2 edge/error states |
| 3 | In progress | Policy extraction/review, cited typed coverage result, per-source display of corrected prior term versions and user-removed entries, and comparison actions that distinguish an exact quote from opening the saved policy source or unavailable evidence | Cross-document policy replacement/version chains, conflict comparison and complete comparison/navigation journey |
| 4 | In progress | Consent-scoped search, save/hide, source-linked article detail | Video discovery/detail, publication dates and complete persistence/editorial path |
| 5 | In progress | Connected demo Ask run, real events, citations, unknowns, approved proposals | Full registry tools, broader orchestration/evaluation, consent history and failure/cancel coverage |
| 6 | In progress | Local treatment registry, dated edits, Ask opt-in | Full source/version links and complete end-to-end test |
| 7 | In progress | Visits, selected brief, outcomes, actions and Ask opt-in | Export/share, reminders, full review and error states |
| 8 | In progress | Light/cobalt timeline, readable dates, separate card/action controls, user correction versions and direct prior-source navigation | Provenance-backed relationships, extracted claim versions, zoom/navigation and full acceptance |
| 9 | In progress | Bounded symptom flow and deterministic urgent path | Clinical safety evaluation, localization, edge cases and full acceptance |
| 10 | Not started | No family profile implementation | Separate profiles, scoped sharing, revocation, audit and isolation tests |
| 11 | In progress | Data inventory and local/demo deletion controls | Consent history, export, per-record control, propagated deletion and full verification |

**Current accepted-story count: 0/11; production gates: 0/8; overall: 0/19 (0%).** Keep existing partial capabilities visible in milestone evidence; do not inflate these counts until an entire story or release gate passes.

### Latest verified progress — 26 September 2026, 02:55 +08

- The synthetic repository suite passes **184/184**, including the registered M1 multi-file/review integration and expanded insurance highlight catalog check. Full TypeScript typecheck and full `npm run lint -- --no-cache` pass with exit code 0 and no diagnostics; lint took about 3 minutes. `git diff --check` passes.
- M1 has service-level evidence for multiple source-linked reports, one staged-file approval, extraction retry/cancellation, a local-only note in the combined review/save queue, source-linked accept/edit/reject, and retry after a save failure. It has not passed the full app journey or a multi-file in-app UI test.
- M3 now exposes a broader source-backed policy overview with an accessible expand/collapse control while preserving the difference between an explicit exclusion, unclear wording and a detail not found. The two-policy intake/review/comparison/Ask journey remains unverified.
- The current `/health` route was inspected in the live phone-sized browser preview and renders the styled timeline/filter/card layout. The old unstyled screenshot does not reproduce in the current served build. This does not satisfy native visual, motion or full-story checks.
- **Accepted packages remain 0/19 (0%): 0/11 stories and 0/8 production gates.** No complete-user test milestone is ready. The requested 50% checkpoint requires 10 fully accepted packages; partial slices do not count toward that number.

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

### Latest verified continuation — 26 September 2026, 15:50 +08

- Ask consent can now be narrowed to individual saved health facts. The live local demo showed 9 facts, changed the display to 8/9 after one was excluded, then canceled before transmission. A distinct, explicitly confirmed synthetic Ask run earlier returned eight source citations and navigated to the selected history evidence.
- The deterministic local self-report organizer no longer turns a month-name date into a measurement and now preserves decimal numeric values. Regression tests reproduce both the false date-derived value and the decimal-splitting bug.
- In a separate local demo origin, the first-run rehearsal covered sign-in, required profile fields, five selected areas, one nested detail, a bundled sample report and a self-report note. The report was matched to an existing sample source rather than reprocessed. After explicit inclusion, the note appeared as a separate timeline item; a browser reload retained it. This is not production OTP, owner isolation, multi-file UI, or native restart evidence.
- The service-level multi-file integration test passed. The in-app browser could not expose the native chooser in the locked Mac session, so multi-file browser acceptance remains open.
- Verification: repository 236/236; latest slices 66/66; TypeScript typecheck passed; lint 0 errors / one existing warning at app/index.tsx:403; diff check passed.
- Completion status remains 0/11 stories, 0/8 production gates, 0/19 packages (0%). The full scope still requires all 11 user journeys and all eight production gates. No user test is ready for handoff.
- Next: complete a supported in-app multi-file batch review with edit/reject/unclear/save and re-entry, then continue the next open story and production-gate acceptance.

### Numeric-date parsing regression — 26 September 2026, 16:03 +08

- Added numeric calendar-date masking to the local-only self-report organizer. Dates in `MM/DD/YYYY`, `DD-MM-YYYY`, and `DD.MM.YYYY` forms are no longer proposed as measurements (for example, a date fragment such as `01/15` is not saved as a glucose reading).
- The focused self-report suite passes **10/10**. Full verification passes: repository **237/237**, latest slices **66/66**, typecheck passed, lint **0 errors / 1 existing warning at `app/index.tsx:403`**. No provider call or real health data was involved.
- This is a focused M1 safety improvement, not a completed story. Acceptance stays **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. M1 still needs a real multi-file first-run app journey, all review decisions/recovery, source-linked re-entry, production identity/isolation, and native/reduced-motion/device checks.
- Next slice: establish a usable supported multi-file picker test path and run the batch through consent, per-file activity, source-linked review, edits/rejections/unclear status, one save, and history re-entry. No user-test handoff is ready.


### Insurance evidence routing and profile setup copy — 26 September 2026, 19:57 +08

- Insurance source actions now distinguish exact policy quotes, an available original document, and missing evidence. Both quote resolution and fallback navigation stay within insurance-purpose assets; tests cover cross-registry identifier collisions and blank IDs.
- Profile setup explains the display-name rule without labeling it “optional.” A new profile still requires a display name and country; saved profiles retain access without forcing a new name entry. No health data was altered.
- Verified: repository/integration suite **244/244**; latest slices **67/67**; typecheck passed; lint **0 errors / 1 existing warning at `app/index.tsx:403`**; `git diff --check` passed. Loopback permission was required for the synthetic integration suite. No provider call or real health data.
- This is partial progress only. Completion remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. M1 is still the leading full journey; M3's two-policy comparison and source-grounded answer path remain incomplete. No whole-user test handoff is ready.


### Approved profile overview and M1 checkpoint — 26 September 2026, 23:43 +08

- The user approved replacing the onboarding orbit with an evidence-first profile overview. The design/motion contract, source-grouping helper, and synthetic journey/accessibility regression checks are integrated. The setup view separates tracking interests from reviewed evidence and the profile view now counts distinct source groups.
- Isolated local preview observations: the overview rendered at 390 pt; synthetic preview sign-in, required name/country, zero-state counts, six selected areas, one nested detail, and one bundled sample-file add worked. The preview code is a fixed local rehearsal, not production OTP. File-picker automation could not be controlled; an image appeared in that test origin but was not opened, processed, sent or saved. No multi-file review/save/history journey passed.
- Verification passed: typecheck; lint exit 0; latest-slice suite **77/77**; review accessibility suite **2/2**; repository/integration suite **254/254** after enabling local synthetic listeners; and `git diff --check`. No external AI provider or real health data was used.
- **Status:** strict acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. D0 remains partial pending 360/430 pt, reduced-motion, keyboard/tap-target and accessibility checks. M1 still needs repeatable multi-file input, consent and activity, review decisions, one save, source-linked history, re-entry, native checks and production owner isolation. No whole-user milestone is ready.
- **Next:** establish a clean repeatable file-input path without touching existing browser storage; internally pass the M1 batch through review, save and re-entry, while completing D0 viewport and reduced-motion verification.


### Self-report source deduplication and design review — 27 September 2026, 01:42 +08

- **Timeline fix:** accepted, source-linked details now represent a linked self-report in the main health-history timeline, so the note no longer appears as a second dated event just because its record date differs from the event date. A claim card still opens the original user-written text and source details. Existing connections to a hidden duplicate note now resolve to the accepted, dated detail. Standalone notes and notes without a current accepted extracted detail remain visible.
- **Synthetic app check:** on isolated preview `127.0.0.1:8098/health`, Avery Sample's earlier state showed three entries (saved sample PDF, written blood-pressure note, and the accepted 12 January reading). After refreshing with the update, it showed two entries: the unprocessed PDF and one 12 January measurement. Opening that measurement displayed the original note under `SOURCE`. Refresh preserved the existing data; no reset or real profile data was used. The built-in PDF remained unanalyzed.
- **Design review:** the supplied references support a calm, evidence-first direction: warm opaque surfaces for clinical reading, restrained translucent grouping, short takeaways followed by distinct evidence/meaning/unknown/source sections, and motion driven by real service events. Dense micro-labels, flat stacks of full-length findings, duplicate activity panels and unsupported health scores/advice remain targets for refinement; examples' predictive and prescriptive claims are not appropriate to copy without validation.
- **Verification:** repository/synthetic integration suite **263/263**, latest-slice suite **79/79**, focused timeline and endpoint-navigation tests **11/11**, typecheck passed, lint passed, and `git diff --check` passed. No provider call was made during this checkpoint.
- **Progress:** still **0/11 accepted stories, 0/8 passed production gates, 0/19 accepted packages (0%)**. This is partial M1/M8 evidence, not a ready whole-user test. Multi-file in-app review, all review decisions, native/reduced-motion/device checks, verified production sign-in and owner isolation remain open.
- **Next slice:** streamline M1's review surface by grouping source claims by report and category and consolidating the running notice with the per-file activity list; preserve exact quotes and per-item decisions. Then test multi-file input through a supported picker path and one save/re-entry.
- **Blocker:** desktop browser automation has not exposed the native multi-file chooser; this blocks the in-app batch journey and therefore M1/P4 acceptance. Build and verify independent UI slices while resolving the test path. M10, P7 and P8 remain unbuilt; all other stories and production gates also have incomplete acceptance criteria.


### Repeatable M1 sample batch and consent clarity — 27 September 2026, 04:04 +08

- A separate `localhost:8100` preview origin kept the user's existing preview storage unchanged. The local synthetic sign-in, required profile name/country, one selected Cholesterol focus area, two-file staging action and M1 approval sheet were exercised. Both files appeared separately by name and the approval sheet showed one explicit action for the exact two-file batch.
- The added follow-up fixture is one page, carries a visible sample-data notice and contains extractable text for five dated lipid measurements. Intake's sample action is gated to development or explicit sample-preview builds, avoids adding duplicates, and performs no extraction. The consent sheet states that the connected AI service reads the listed files one at a time and that results are not saved until user review. No provider was called.
- Verification: typecheck and lint passed; repository/integration tests **265/265**; latest-slice tests **79/79**; `git diff --check` passed.
- Strict acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. M1 remains partial because this run stopped before file approval, source-claim review, one save, and timeline re-entry. No user-test milestone is ready.
- Next: verify the staged two-report batch using deterministic local extraction, per-file events, the full edit/reject/unclear/date queue, one save, source navigation and reload, without a live provider. Native/reduced-motion/device checks and production identity/isolation remain open.


### M1 in-app synthetic batch journey — 27 September 2026, 08:55 +08

- Ran a fresh, disposable Chrome profile against the compiled web app at http://127.0.0.1:8096/ and an empty local data directory on a loopback backend. OPENAI_API_KEY was explicitly empty; the browser storage on the existing user preview was not touched. The local demo code 720720 is a preview rehearsal, not production email/mobile verification.
- Completed profile setup with five selected health areas and a blood-sugar detail, wrote a synthetic plain-language note, and staged the two built-in lipid PDFs. The review screen showed separate, accurate consent for on-device fixed sample mapping with no provider call. Each file emitted its own real service milestones and produced 8 and 5 dated, source-quoted suggestions.
- In the unified review queue, staged the January LDL result and April LDL result for inclusion, edited synthetic April non-HDL from 132 to 131 mg/dL while retaining the original quote, marked the April HDL suggestion for dismissal, and left other suggestions pending. One save action persisted only the staged decisions and selected self-report.
- /health displayed three events: the separately labeled user note, one 21 January report result, and one 22 April report event grouping two measurements. Reopening the saved source preserved the quote and review history. Reload retained all three events without a duplicate source row.
- At 360×780, 390×844 and 430×932, the page had no horizontal overflow; the 390×844 timeline screenshot was visually inspected. The experience uses warm reading cards and clear source/date labels; long details remain expandable. This is a browser preview, not native-device or reduced-motion verification.
- The first isolated request was blocked by the test backend’s default development CORS list because the temporary port was not included. The preflight confirmed no app data request reached the service. The disposable backend was restarted with only the isolated test origin allowed; the user-approved local-only retry succeeded. No application CORS policy was loosened.
- Verification after the journey: npm run typecheck; EXPO_NO_DOTENV=1 npm run lint -- --no-cache; npm run test:repo 273/273; latest slices 80/80; review accessibility 7/7. All passed. No real health data, network provider, or third-party request was used.
- **Status:** M1 remains in progress, and strict acceptance stays **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. The test covers only the preview sign-in and exact local fixture path. Production identity/recovery and person isolation, skip-to-upload, ordinary connected uploads, offline/cancel recovery, native persistence, and in-app reduced-motion behavior remain open.
- **Next:** turn this observed full web path into a repeatable automated browser acceptance check; then continue the remaining M1 gates. Do not offer a disconnected flow as the full-user test milestone.


### Repeatable M1 browser rehearsal and Ask evidence presentation — 27 September 2026, 09:50 +08

- `npm run test:m1-browser` starts a disposable synthetic repository, loopback-only service and Expo web app, then uses a fresh headless Chrome profile. It empties the provider key, disables dotenv and records observed network origins. The script passes **16/16** assertions.
- The verified path starts at local preview sign-in, completes required name/country, selects five focus areas, records a synthetic note, stages two exact built-in lipid reports, grants the consent naming both, reviews source-linked suggestions, saves staged decisions once, and reaches `/health`. Reload preserves source-linked history. At 360, 390 and 430 px, no horizontal overflow appears.
- The service repository confirms accepted, edited, dismissed and still-pending claim states; an edited value retains its original extraction. Two fixture sources and zero provider events are present. Thirty-two observed HTTP(S) requests use only isolated app/service origins. Reduced-motion preference was set for this run, but full behavior remains open.
- The app now preserves an open source when its file row is tapped again and prevents source revalidation from replacing the save confirmation.
- Ask's first view is shorter and separates saved facts, extracted document details, selected topics, user-recorded links, public sources and unavailable citations. Unknowns remain explicit; evidence shown in the coverage panel is not repeated. Full “what it means” semantics, phone visual review and complete Ask evaluation remain open.
- Combined verification: browser **16/16**, repository **281/281**, latest slices **85/85**, review accessibility **7/7**, typecheck, no-cache lint and diff check all pass. No live model/provider, external network origin or real health data was used.
- This does not complete Story 1 or any production gate. Production identity/recovery and owner isolation, skip-to-upload, ordinary connected uploads, in-app offline/cancel/retry, native restart, full reduced-motion/device checks, and the other ten stories/eight gates remain open. Overall acceptance remains **0/19 (0%)**. No whole-app user test is ready.


### M1 zero-area routing contract — 27 September 2026, 10:00 +08

- Added a regression check proving a new profile with a valid name and country, no selected health topics, and no saved facts/files is allowed to continue from profile setup to `/intake?firstRun=true`. Required identity fields remain enforced; there is no topic-count prerequisite.
- The assertion covers the current screen handler and route contract, not a compiled browser walkthrough of the zero-area experience. The visual/action branch remains open for M1.
- Verification: latest-slice suite **86/86**, typecheck, no-cache lint and `git diff --check` passed. The provider-free M1 browser path remains **16/16**; repository suite **281/281**. Strict completion remains **0/19 (0%)**.

### Connected-upload and Ask presentation checkpoint — 27 September 2026, 11:30 +08

- The provider-free local sample and zero-topic rehearsal passes 23/23. A separate synthetic ordinary-upload browser rehearsal passes 12/12 through the compiled app: three ordinary PDFs are staged, consent lists all files, one synthetic extraction failure stays retryable, Stop cancels the active request without starting the next file, and a fresh-consent retry produces three source-linked review candidates. The candidates remain pending; no assertion is saved.
- The synthetic provider response is intercepted in memory. Chrome observed only the local app and service origins; the service did not log PDF bytes. This does not verify a live provider or block every possible low-level Node networking path.
- Ask gained an optional source-linked “What this can mean” section. It is concise public health education, only appears when tied to a returned public source, and is suppressed for policy, symptom-support and profile-summary answers. Citation/source checks are not semantic-entailment evaluation; phone visual review remains open.
- Verification: browser 23/23, connected upload 12/12, repository/integration 284/284, latest slices 87/87, review accessibility 7/7, typecheck, no-cache lint, and diff check passed.
- Strict acceptance remains 0/11 stories, 0/8 production gates, 0/19 accepted packages (0%). M1 is partial and the full-app user test is not ready. Production identity/recovery and owner isolation, connected candidate review/save/history, native restart, full reduced-motion/device checks, and the other story/gate criteria remain open.
- Next implementation slice: continue ordinary upload through evidence-level accept/edit/dismiss/pending decisions, one save, and source/date-linked health-history re-entry; then test the connected journey across phone widths and reduced motion.

### M1 connected review/save/history and Ask readability — 27 September 2026, 11:37 +08

- The local sample/zero-topic rehearsal passes **23/23**. The ordinary connected-upload rehearsal now passes **17/17** end to end: three synthetic PDFs, explicit file-specific consent, visible retry after a service failure, Stop cancellation, fresh-consent retry, one accepted claim, one dismissed claim, one pending claim, and a single save.
- The saved health history shows the accepted 118/76 event linked to its original synthetic report exactly once. Reload preserves that relationship; the dismissed and pending candidates are not shown as saved facts. The run uses an in-memory synthetic provider response and no real credentials or health data.
- Ask’s new optional “What this can mean” card remains a concise, cited general-education section rather than personal advice. I raised small body/source text sizes for phone reading. The semantic-source checks do not prove entailment, and the card still needs a visual phone review.
- Verification after integration: repository/integration **284/284**, latest slices **87/87**, review accessibility **7/7**, both browser rehearsals **23/23** and **17/17**, typecheck, no-cache lint and diff check pass.
- Strict acceptance remains **0/11 stories, 0/8 production gates, 0/19 accepted packages (0%)**. M1 remains partial: duplicate/conflict and unknown-date cases, native restart, actual reduced-motion behavior, production sign-in/recovery and owner isolation remain. A complete whole-app user test is not ready.
- Next slice: add the M1 duplicate/conflict and unknown-date scenarios using synthetic sources, then audit actual reduced-motion behavior and continue production identity/isolation.

### M1 date/conflict review and persistent Ask presentation — 27 September 2026, 13:01 +08

- The ordinary-upload acceptance rehearsal now passes **19/19** using five synthetic PDFs. Same-date 124/82 and 129/84 readings are called out as a conflict and remain distinct; the undated reading stays undated while its report issue date remains separate source context. The combined review saves only the explicit accept/dismiss decisions; both conflict readings and the undated finding remain pending and absent from `/health`. The accepted 118/76 result stays source-linked once after reload. The test provider is an in-memory shim; no external network or real health data is used.
- Saved Ask assistant messages now use the same compact, source-grouped answer component as the live response. Meaning, uncertainty and next-step fields are included in native answer metadata; browser snapshots preserve the complete message object. Legacy replies without a separately stored uncertainty list hide that section rather than claiming there are no unknowns. The `/ask` local web preview and accessibility tree were inspected with synthetic saved conversations.
- Verification after the changes: sample/zero-topic browser rehearsal **23/23**; ordinary connected-upload rehearsal **19/19**; focused batch-analysis tests **7/7**; repository/integration tests **284/284**; latest-slice tests **87/87**; review accessibility **7/7**; typecheck; no-cache lint; and `git diff --check` passed. Loopback-bound suites required the permitted local test run because the restricted environment rejects local listeners.
- The preview check does not verify native SQLite restart, supported-device rendering, reduced-motion behavior or semantic citation entailment. No story or production gate is fully accepted: **0/11 stories, 0/8 gates, 0/19 packages (0%)**. A full-user test handoff remains not ready.
- Current milestone: M1 full profile-to-first-history journey. Next slice: verify source-linked accepted history and saved Ask answer state after a native app restart, then audit reduced motion on the complete journey. Continue production identity/recovery and server-side owner isolation in parallel only where their contracts can be tested independently.
