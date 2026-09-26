# Nura build board

**Build objective:** the complete Nura mobile app: all eleven user stories, the agreed visual language and motion, persistent source-linked health state, multimodal record intake, consent-scoped agentic intelligence, and production security/privacy/release readiness. Synthetic-data demo readiness is an intermediate milestone; production identity, isolated family access, secure persistence, lifecycle controls, operations, and governance are part of the 100% goal. Never present an unconnected service or simulated trace as live.

**Updated:** 26 September 2026

**Integration owner:** the primary Codex build owner. The design and intelligence tracks may work in parallel, but only the integration owner marks a story connected after its screen, state, service, event, motion and acceptance check agree.

## Executive progress and delivery plan — 26 September 2026

**Strict acceptance:** **0/19 packages (0%)** — **0/11 user stories** and **0/8 production gates** are fully accepted. This does not mean no implementation exists: ten stories have partial implementation, M10 is not built, P1 is only a synthetic sign-in rehearsal, P2–P6 have partial foundations, and P7–P8 have not started. A package only moves the score after its whole journey/gate, recovery cases, visual and motion checks, and evidence pass.

| Package | Status today | Next exit evidence |
|---|---|---|
| **M1 · Profile and first history** | In progress; local synthetic sign-in/profile setup, the evidence-first overview, dynamic six-area selection plus a nested detail, and one sample-file add were observed in an isolated preview. The full journey remains open. | Establish a repeatable clean multi-file intake path; then consent, event-backed processing, accept/edit/reject/unclear/date review, one save, source-linked history and re-entry; then native, reduced-motion and identity-isolation checks. |
| **M2 · Medical Registry** | Partial: source-linked records, topic pages, corrections and cited summaries exist. | Complete intake-to-wiki journey, evidence changes, source navigation, correction/version and recovery checks. |
| **M3 · Insurance Registry** | Partial: policy review/comparison exists. This update adds evidence-accurate source actions. | Complete two-policy upload/review/compare/Ask journey with exclusions, unclear terms, unknowns, conflict handling and exact source evidence. |
| **M4 · Explore** | Partial: consented article search, save/hide and compact sourced details exist. | Complete persistence/recovery, video and publication metadata, ranking and provider checks. |
| **M5 · Ask Nura** | Partial connected demo: consented context, operational events, citations, unknowns and approved memory proposals exist. | Finish bounded tool coverage, cancellation/error journey, grounding/security evaluation and durable consent history. |
| **M6 · Treatment** | Partial local registry and Ask opt-in. | Complete source/version journey and end-to-end review/re-entry. |
| **M7 · Visits and care** | Partial visit brief, outcome, follow-up actions and Ask opt-in. | Complete sharing/export/reminder and recovery journey. |
| **M8 · Timeline and connections** | Partial: source-event deduplication, readable dates and correction navigation exist. | Complete evidence-backed links, mobile navigation/filter/zoom and re-entry acceptance. |
| **M9 · Symptom support** | Partial bounded flow and deterministic urgent path. | Complete safety evaluation, localization, clinical review and failure/urgent scenarios. |
| **M10 · Family and caregivers** | Not started. | Separate profiles, scoped consent/grants, revocation, audit and cross-person isolation. |
| **M11 · Privacy controls** | Partial inventory and local deletion controls. | Consent ledger, export/correction, propagated deletion and lifecycle verification. |
| **P1 · Identity/isolation** | Preview rehearsal only; not passed. | Real verified email/mobile code, recovery, server-side owner checks, family grants and isolation tests. |
| **P2 · Consent/privacy** | Partial. | Purpose/version ledger, withdrawal, inventory, export and deletion proof. |
| **P3 · Storage/sync** | Partial local persistence only. | Encrypted production storage, sync, recovery, conflict and deletion drills. |
| **P4 · Multimodal pipeline** | Partial local PDF/image/video paths; cross-file UI acceptance and audio pipeline remain open. | Consent-bound format coverage, source locations, duplicate/conflict handling, retry/cancel and no unreviewed writes. |
| **P5 · Agent safety/reliability** | Partial local orchestration and urgent path. | Server policy, injection defense, cancellation, evaluations, grounding and safety governance. |
| **P6 · Providers/discovery** | Partial allowlisted search. | Provider reliability, dates/video metadata, privacy controls, limits and outage behavior. |
| **P7 · Operations/security** | Not started. | Hosted controls, secret rotation, monitoring, abuse response, restore and incident drills. |
| **P8 · Release/accessibility/governance** | Not started. | Device/accessibility matrix, reduced-motion review, clinical/legal/privacy sign-off, release/rollback evidence. |

### D0 visual direction approved — 26 September 2026

The user approved replacing the onboarding orbit/map with an evidence-first 720 profile overview. The approved target is the health-area step in `app/index.tsx`; this decision does not redesign the separate Health History Connections visualization or the AI profile-synthesis screen.

The implementation keeps the Blueprint v2 plum-to-rose scene and replaces the orbit/rays with a warm-paper overview. It separates topic preferences from records, groups saved details beneath source records, uses real dates/source state only, and keeps topic detail editing distinct from add/remove selection. A phone-sized 390 pt browser check passed for the overview; a separate synthetic preview confirmed zero-state counts, six-area selection and one nested detail. The screen must still pass at 360 and 430 pt widths, standard/reduced motion, keyboard/tap-target and accessibility checks. D0 remains in progress until those full visual/accessibility checks pass.

**Current build target:** close the remaining D0 size/motion/accessibility checks while continuing M1's first-history journey. The prior event-date branch still shows an explicitly blank event date as “Date not stated” without substituting a report date. The onboarding implementation now uses the evidence-first overview; no pending-review queue or timestamp is shown unless backed by persisted data.

**Since the prior checkpoint:** M3's linked-policy comparison now offers “View source quote” only when an exact quote is available, “Open original source” when only the document link exists, and a plain unavailable-evidence message otherwise. Source fallback is constrained to insurance assets even if an identifier collides with another registry. The profile form now uses a neutral “DISPLAY NAME” label and explains new versus existing-profile behavior without weakening new-profile validation. Verification: repository/integration tests **244/244**, latest-slice tests **67/67**, typecheck passed, lint **0 errors / 1 existing warning** at `app/index.tsx:403`, and `git diff --check` passed. The repository run required permission to bind temporary synthetic services to `127.0.0.1`; after that, all tests passed. No provider or personal health data was used. This is a verified slice, not completion of M1, M3 or any package.

### Approval and parallel-delivery rule

One approval of a package's user-visible direction authorizes implementation through its documented acceptance checks; it does **not** require another approval for every coding or test step. The integration owner keeps building independent work while a product choice is pending. Parallel lanes are limited to non-overlapping files/contracts; workers report changed files and tests, and the integration owner reviews and reruns the full gate before merging. User review happens only after internal verification, as one normal app journey with synthetic data and visible pass points. No user-test milestone is ready now.

## Shared design review

- [NURA_STORYBOARD_PREVIEW.html](NURA_STORYBOARD_PREVIEW.html) is the clickable phone storyboard for all eleven stories, with screen concepts and interaction descriptions.
- [NURA_WIREFRAME_STORYBOARD.html](NURA_WIREFRAME_STORYBOARD.html) is the shot-by-shot visual flow: each phone screen is shown in sequence with next-action arrows and meaningful branch points.
- [NURA_MOBILE_STORYBOARDS.md](NURA_MOBILE_STORYBOARDS.md) is the detailed layout, motion and accessibility specification.
- [USER_STORY_ACCEPTANCE.md](USER_STORY_ACCEPTANCE.md) is the detailed per-story acceptance contract.
- [NURA_COMPLETE_BUILD_SCOPE.md](NURA_COMPLETE_BUILD_SCOPE.md) defines what 100% completion means, the eleven app-based test milestones, reporting format, and current audited baseline.
- [NURA_AGENTIC_FOUNDATION.md](NURA_AGENTIC_FOUNDATION.md) defines the memory, context, orchestration and event contracts.

**Important runtime distinction:** the storyboard HTML files are design/review artifacts, not a compiled end-to-end application. The compiled app now starts at a clearly labeled synthetic preview sign-in, then opens profile setup. The preview code is local and does not verify ownership or send a message. The compiled bottom navigation is Home, History, Care, Explore and Profile; People & sharing is reachable from Profile, but family permissions are not implemented. Ask, intake/review, Insurance, Treatment and Visit are dedicated routes, but multiple stories remain partial or absent. Opening a route does not mean every storyboard shot has been implemented.

## Active delivery queue and decision gate — 26 September 2026

| Order | Package | State | Exit evidence |
|---|---|---|---|
| **D0 · Health-profile overview** | Replace the onboarding orbit with a source-first profile overview, while preserving the topic selector and topic-detail editor. | **Approved; implementation is present and partial phone-size review passed.** `app/index.tsx` has distinct focus-area and grouped-record sections; source-backed helper and regression tests cover source status, type labels and grouping. | 360/430 pt, reduced-motion, all-nine-area, keyboard/tap-target and accessibility checks; then integrate into M1. |
| **M1 · First profile and history** | Login rehearsal → required profile → tracking choices → one batch of health files/notes → real processing events → item review → one save → dated/source-linked history → leave and re-enter. | **In progress.** An isolated local preview passed synthetic code rehearsal, required profile setup, zero-state overview, six-area selection plus one detail, and one bundled sample-file add. No multi-file/review/save/history run passed. | Fresh synthetic workspace and repeatable file selection; clear/edit/reject/unknown decisions; no report date silently becomes result date; one save; no duplicate timeline item; source navigation and re-entry pass. Then native/reduced-motion and identity/isolation remain for full M1 acceptance. |
| **M2 + M8 · Medical Registry and timeline** | Connect accepted evidence to topic registries and a deduplicated, source-linked history; preserve corrections and user-authored relationships. | Partial; next after M1's complete review/save path. | Exact source/claim navigation, no duplicate records/events, truthful date and unknown states, edit/version and re-entry checks. |
| **M3 · Insurance Registry** | One policy intake/review; compact coverage, exclusions, unclear wording and missing evidence; answer policy questions and compare policies without inventing coverage. | Partial; the latest evidence-action slice is verified while M1 remains the lead integration priority. | Synthetic policy journey from upload through reviewed registry, grounded exclusions/unknowns, comparison and source-linked answer. |
| **M4–M7 + M9 · Daily-use and intelligence journeys** | Explore, Ask, treatment, visits/care, symptom support; connect real consented orchestration events, persistence and recovery. | Partial; build as bounded vertical slices after shared source/context contracts. | Each story completes its own scripted journey with real state/events, citations, cancellation/error behavior, and device/reduced-motion review. |
| **M10–M11 + P1–P8 · Sharing and production readiness** | People/caregivers, privacy controls, identity, consent ledger, secure persistence/sync, provider operations, security, accessibility and release governance. | M10 not built; several production gates partial and two not started. | Every story and production gate passes its full contract; only then does progress reach 19/19. |

**Parallel delivery rule:** delegate only independent, non-overlapping slices (for example, a screen implementation, a selector/service contract, and a read-only acceptance audit). Freeze the typed state/event contract before integration; one integration owner resolves conflicts and runs the complete quality gate. Do not have parallel workers edit the same screen or shared state files. User approval is reserved for product-direction decisions such as D0; routine implementation and internal verification continue without repeated approval prompts.

## Parallel work tracks

### A. Mobile product design and interaction

1. Translate each storyboard into a phone-sized screen using the two agreed surfaces: Blueprint v2's atmospheric indigo/plum scenes for onboarding and Nura-led conversation, and the warm-light record canvas with cobalt timeline nodes/links for health history and evidence review.
2. Design each tap as a meaningful state transition: pressed/selected, contextual expansion, source reveal, review decision or next step. Add loading only when a real operation starts.
3. Cover small screens, safe areas, keyboard, reduced motion, empty state, permissions, offline/error and accessibility.
4. Connect each visual state to durable app state or a public service event; keep preview-only concepts labeled.

### B. Persistent memory and agent capabilities

1. Keep provider calls behind server adapters and bounded tool ports; keep the API key out of the app bundle.
2. Retrieve only the user's explicitly selected context after per-run consent. Preserve source, date, status, confidence and validity for each accepted fact.
3. Treat extraction as candidate evidence. Require accept/edit/reject before it can enter profile memory.
4. Use a supervisor to select bounded capabilities. Add specialist agents only where the story requires a distinct task (for example, comparing policy terms); keep each result typed, cited and reviewable.
5. Emit operational milestones from actual services. Never expose hidden model reasoning or use timer-driven fake thinking.

### C. Master integration and quality gate

For every story, maintain this chain:

`story → screen → user action → persisted state → service/tool → typed event → animation/feedback → acceptance check`

Do not connect a screen to a capability until the request, response, source and event contract are agreed. Review each vertical slice for mobile fit, color meaning, data provenance, duplicate/error states, reduced motion and recovery before showing it for user review.

## Current implementation

| Track | Connected now | Still required |
|---|---|---|
| Design | Clickable storyboard for all eleven stories; health-history screen uses the selected light/cobalt direction; onboarding keeps the Blueprint v2 atmospheric scene and shared animated orb, while its approved focus step now uses an evidence-first overview with separate topic preferences and source-grouped records; first profile synthesis has a reviewable source-cited result state; Home, History, Medical Registry, Explore, Insurance, Treatment, Visit and Data & Privacy have dedicated mobile routes. History source details open linked claims and pending-claim review. The Medical Registry now has topic pages, explicit record linking, source/timeline navigation and a topic-scoped Ask action. Visit selection, outcome capture and follow-up action state changes use an animated local review flow. | The storyboard does not equal compiled app coverage. Finish the shot-by-shot onboarding and remaining story screens, whole-app motion/visual pass, video detail/publication metadata and family journey. |
| Memory/state | Native profile, topic, fact, file metadata, typed user relationship, treatment and visit records with dated change history in local SQLite/SQLCipher; visit briefs retain selected source IDs. Topic-to-record connections require an explicit user relation. Accepted extraction claims now append assertion corrections with version, supersedes ID, validity close and user-entered origin; timeline corrections retain their source ID and source-claim ID. | Relationship evidence/valid-time provenance, cross-device canonical registry, durable cloud identity and isolated family profiles remain. Browser demo state is synthetic and in-memory; native correction persistence still needs device verification. |
| Agent | Live Ask run with per-run consent, selected context retrieval, actual tool events, citations, unknowns and user-approved memory proposals; profile synthesis and insurance use the same run path. Ask can now search treatment and visit/follow-up records only after separate default-off per-run choices; symptom support drops both record types at the server boundary. Retrieval no longer appends all local repository assertions to each request. Coverage assessments distinguish explicit terms from missing/unclear wording and validate references against selected sources. Synthetic profile and insurance runs passed. | Production identity/consent enforcement, durable consent history, canonical multi-registry retrieval, deeper policy analysis, clinical symptom evaluation, broader evaluations and operational controls. |
| Intake | PDF/image transfer and review are connected. Video is also connected in code: the Medical Registry file/photo pickers accept clips; the local service samples up to six stills from clips up to 3 minutes and returns timestamped claims. Medical intake accepts an optional topic-tagged self-report as a user-authored draft. Review asks once for consent naming every staged file, processes them sequentially with real per-file activity, continues after an individual failure, saves each file-to-source link before reporting completion, and reopens each linked source without resending its original. Claim decisions and selected self-reported notes now share one staged review queue and one explicit save action, with per-item failure recovery. Preview placeholders without attached file bytes are excluded. The configured localhost preview CORS defaults now cover the active ports; a synthetic PDF click-through reached source-matched suggestions, confirmed exact-duplicate handling, staged a claim and saved it from the unified action. One stopped run retains completed files and leaves unstarted files ready. Local audio-format/duration checks have unit coverage but are not connected to intake or transcription. | Provider-backed email/mobile verification and owner isolation remain open. A synthetic multi-file UI run, self-report interpretation, perceptual duplicate detection and cross-file topic matching remain; verify retry/cancel/restart and mobile/reduced-motion behavior. |
| Stories 3–11 | Story 3 has partial registry/extraction/review and source-validated coverage comparison; user-marked replacement links now compare accepted terms across policy sources, and each side can open its exact saved extraction quote; corrected prior and user-removed terms remain grouped with their original source. Story 4 feed is partial with an expandable source-detail state that shows returned publisher text, any matching Nura search brief and a source link; Story 5 Ask has a connected demo slice; Story 6 has a local treatment registry with current/past status, dated change history, explicit per-run consent and source-backed Ask retrieval; Story 7 has manual visits, user-selected brief preview, outcome capture, dated user-entered follow-up actions and per-run Ask retrieval; Story 8 timeline includes treatment and visit entries plus user-authored relationships; Story 9 has bounded symptom support; Story 11 now has an expandable data inventory and confirmed local deletion controls. | Complete policy version chains, conflict and end-to-end comparison journeys; feed publication-date extraction and video detail; visit export/share and reminders; evidence-backed relationship provenance and extracted-claim correction history; clinical symptom evaluation; family permissions; consent history; export and account/cloud controls. |

Checks completed: `npm run typecheck`, `npm run lint`, server JavaScript syntax validation, and prior synthetic profile-synthesis/insurance/PDF runs returned real retrieval, extraction, evidence and cited-answer events. Re-uploading the exact same bytes produced an exact-duplicate event without a second model extraction. No personal health record was sent.

## Next build sequence

1. **G0 · Visual implementation audit:** compare the compiled phone flows—not only the storyboard—to the approved Blueprint v2 onboarding/Ask scenes and warm-white/cobalt history reference. Fix the largest visual/motion mismatch, then capture internal phone-size checks at 390 × 844, 360 × 780 and 430 × 932 with reduced motion enabled too. No user review until the full slice passes internally.
2. **G1 · Production-capable foundations:** define and implement server-authoritative identity/profile access, durable consent and canonical source/assertion/version/event contracts; add isolation/consent tests before connecting more agents or family flows. Replace local-only assumptions through adapters without breaking the existing demo path.
3. **M1 · Living profile:** complete shot-by-shot onboarding, profile persistence/recovery, cited synthesis, edits/recontextualization and in-app repeatable synthetic journey.
4. **M2 + M8 · Medical Registry and timeline:** finish evidence-backed topic summaries and cross-registry provenance/navigation; verify the new claim-correction/version flow, filters, selection, line/node colors, reduced motion and phone layout.
5. **M3 + M4 + M5 · Insurance, Explore and Ask:** finish policy versioning/comparison, article/video freshness and persistence, complete registry tools, cancellation/retry/evaluation and full cited answer flow.
6. **M6 + M7 + M9 + M10 · Treatment, visits, symptoms and people:** complete record/source history, visit share/reminders, clinical safety review, then isolated family/caregiver permissions on top of G1 authorization.
7. **M11 + P2–P8 · Privacy and release:** durable consent, export/correction/deletion propagation, multimodal video/audio, secure cloud storage/sync, provider resilience, production monitoring, accessibility, safety/legal review and release/rollback.
8. **G8 · Acceptance:** internally verify every milestone; hand each coherent slice to the user with its exact in-app route and success points; incorporate feedback and rerun that journey; then run the complete mobile story pass and production release gate suite.

## User review cycle

The user should review a stable story slice, not act as the team's error detector. Before each review, the integration owner runs the relevant checks, uses synthetic data, captures a phone-sized screenshot/short interaction recording, and provides the exact acceptance points. Feedback returns to the corresponding design and implementation tasks, then that same slice is internally rechecked before the next one is shown.


## Latest integration update — 24 September 2026

### Home health-area responsive verification — 24 September 2026

- The earlier screenshot showed the six health areas collapsed into narrow vertical strips, with labels wrapping one character at a time. The current Home implementation uses a two-column card grid with a stacked icon/count row and readable title/detail rows.
- Rechecked the current compiled preview at 360 × 780, 390 × 844 and 430 × 932. The cards keep their two-column width and labels remain readable. The lower cards and following sections remain in the scrollable page above the persistent tab bar.
- Rechecked the Health History timeline and Connections at 360 × 780. Timeline nodes and their colored rail remain aligned; the filter row scrolls horizontally on narrow phones, and connection endpoints stay readable.
- Current local checks pass: TypeScript typecheck, Expo lint, repository suite **52/52**, and `git diff --check`. These checks cover the existing local video frame sampler only; no provider video-analysis request was made.
- The screenshot context was `/services` while the content shown was Home. The current `/services` route renders Explore; `/home` renders the health-area grid. This is a stale/mismatched preview signal, not the current route output.
- This closes the narrow-card presentation defect only. Home’s visual/motion pass and all story/gate acceptance remain open: **0/11 stories, 0/8 production gates, 0/19 accepted packages (0%)**.
- Historical note: at the time of this 24 September check, no provider video-analysis request was made. The current implementation has since added an explicit per-file video consent screen and the extraction adapter is connected to sampled stills. That code path still needs a fresh synthetic end-to-end run before it is marked internally verified.

- The browser onboarding entry now presents a prominent route into the current app Home and its tabs. The root route remains the profile-creation start; it is not the full app by itself.
- Story 9 has a first connected slice at `/symptoms`: immediate safety escalation is static and bypasses AI; non-urgent support uses the existing consent-scoped local agent stream; treatment/medicine context is filtered server-side; symptom text and answers are not persisted unless the user explicitly saves a note.
- Story 9 is still partial. This demo flow is not clinically validated, does not determine whether a symptom is an emergency, and is not a substitute for local emergency services or clinician assessment.
- Story 11 has a first connected slice at `/privacy`: expandable inventory for current local data, explicit scope for per-run AI/search use, a confirmed clear for device/browser data, and a separate confirmed clear for the local synthetic processing repository. It does not claim deletion of external provider logs, exports, backups or future cloud copies; consent history and export remain unbuilt.


### Latest integration update — 24 September 2026 (continued)

- The Health History timeline now formats captured dates for people, separates card expansion from card actions so interactive controls are not nested, and provides a direct route from a corrected fact to the previous value and its original source. A corrected value remains current; the prior fact remains dated in history and is excluded from current-context Ask retrieval.
- Verified in the synthetic local browser profile: correction created a new current version, the former version remained visible as “Previous version,” and “View previous value + source” selected the original synthetic report entry. No personal record was used. `npm run typecheck` and `npm run lint` pass after the change.


### Explore detail interaction — 24 September 2026 (continued)

- Feed results can now expand in place into a mobile reading-detail state. It uses only the returned publisher excerpt and (when available) the matching Nura search brief, explains why the result was shown, and offers a direct action to open the publisher. The detail expansion/collapse uses the shared motion timing and respects reduced motion. It does not imply that Nura fetched or reproduced the full publisher article. Story 4 remains partial: video content, publication-date extraction and browser-refresh persistence are not implemented.


### Completion observability — 24 September 2026

- Updated [NURA_COMPLETE_BUILD_SCOPE.md](NURA_COMPLETE_BUILD_SCOPE.md) as the integrated definition of 100% build completion: eleven app-story packages plus eight production-readiness gates, per-story acceptance criteria, in-app milestone tests, cross-story motion/AI checks, user test handoffs, current baseline and 30-minute report format.
- Baseline is **0/11 accepted stories, 0/8 accepted production gates, and 0/19 overall packages (0%)**. Significant partial foundations are present; no story has yet passed the full six-gate journey. Story 10 remains not started. Production readiness is included in the goal, not deferred outside it.

### Latest verified work — 24 September 2026

- Fixed profile-fact date persistence: new facts now store an ISO timestamp consistent with their validity/provenance timestamps. Home ordering/date labels and Health History share a parser that also reads dates from the earlier locale-based build. In the synthetic mobile browser preview, Home displayed `24 SEPT`; History displayed new notes and biometrics as dated items in newest-first order.
- Verification passed: `npm run typecheck`, `npm run lint`, and `npm run test:repo` (9 passing tests). This is a defect fix and internal journey check, not a story acceptance; accepted completion remains **0/19** until a complete story or production gate meets its full criteria.
- Next implementation slice: verify M1 persistence across a native app restart and reduced-motion behavior, then close its remaining error/recovery criteria before any user handoff. The synthetic browser run is recorded below as a partial journey check.

### M1 persistence barrier — 24 September 2026

- The final onboarding action now waits for pending profile writes and then commits the current identity fields, selected focus topics, health facts and memory provenance in one local database transaction before opening the first-understanding screen. The transaction retries the current snapshot after any earlier write failure; only focus topics the person explicitly deselected during onboarding are removed with their topic links. The button exposes a real busy state and leaves the user on the step with an actionable error if the transaction fails.
- Internal synthetic browser journey passed through live name/country/age reflection, entered height/weight, contextual follow-up bubbles, explicit parent removal (which cleared its child), scoped consent, streamed service milestones, cited sources and unknowns. Recontextualization required fresh consent, was reported as the correct run type, retrieved the added note, and updated the cited summary. This verifies web interaction and the live local agent path, not native persistence; the browser preview remains tab-only.
- Extracted the profile commit into [profilePersistence.mjs](../src/state/profilePersistence.mjs) and added SQLite-backed checks for exact topic-removal scope, idempotent retry, and full transaction rollback. `npm run typecheck`, `npm run lint`, and `npm run test:repo` pass (12 tests). Native save/restart is **not yet verified**: this machine has no iOS `simctl` or Android `adb` runtime, so M1 remains in progress and is not ready for user acceptance.
- With native M1 verification waiting on a device runtime, the current implementation slice is M2: the topic-registry/link/navigation/Ask path is connected and internally exercised; extracted-claim versioning, broader provenance and native-device checks remain. Keep both M1 and M2 unaccepted until their full criteria pass.


### Medical Registry integration update — 24 September 2026

- Added the compiled mobile Medical Registry at `/registry`. It presents selected health topics as user-selected profile areas (not diagnoses), shows only records the user explicitly linked, and offers a relation picker before saving any topic/record connection. Each linked item displays its source, date and review status; empty topics remain visibly empty.
- Added navigation from Health History to the registry and back to the exact selected timeline source. “Ask Nura about this history” carries only the selected topic scope into the per-run consent screen. The server context-scope helper includes only that topic and directly user-linked facts/assets; an asset-scoped question excludes unrelated treatments and visits.
- Internally exercised with synthetic records in the mobile browser preview: linked a sample lab report with “Around the same time,” saw the source and link count update, opened the exact source in History, then ran a topic-scoped Ask flow. The live configured local agent returned real retrieval/evidence milestones, cited the selected synthetic topic and stated that dated measurements/treatments were absent. No personal health data was used.
- Checks passed: `npm run typecheck`, `npm run lint`, and `npm run test:repo` (16 tests). This verifies the browser interaction and local agent path, not native persistence or device motion. The web demo state is in-memory; extracted-claim version history, richer evidence-backed wiki summaries and native-device acceptance remain open.
- **Status:** Story 2 remains partial and no package is accepted. Overall completion remains **0/11 stories, 0/8 production gates, 0/19 accepted packages (0%)**. The topic page and explicit linking path are internally exercised; claim correction/versioning is now implemented and API-verified. Remaining M2 work is evidence-backed wiki summaries and broader cross-registry provenance; separately, M1 still needs native save/restart verification.


### Extracted-claim correction and version history — 24 September 2026

- Correcting an accepted extracted value now goes through the source review screen from either the timeline’s source detail or the fact action. It updates the selected source claim and the matching profile fact, while retaining the original model suggestion, source quote/page, prior accepted value and source linkage.
- The local development repository appends a new assertion (`version + 1`, `supersedes`, `origin: user_entered`), closes the prior assertion’s validity window and records a safe correction event. A stale retry gets HTTP 409 instead of creating a second version from an outdated editor. Initial review edits also preserve the original model suggestion.
- Verified the correction API against a temporary loopback service and isolated synthetic lab claim: new version created, prior version closed, source claim points to the new assertion, old value is in history, correction origin is user-entered, and stale retry is rejected. Temporary data and service were removed afterward; no model call or real health data was used.
- `npm run typecheck`, `npm run lint`, and `npm run test:repo` pass (18 tests). The current pre-existing loopback service reports `providerConfigured: false`, so I did not claim a live model run in this turn. Native-device persistence and visual/tap verification of the correction route remain open.
- Story 2 remains partial; completion remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)** until full story and production criteria pass. The next M2 slice is evidence-backed topic summaries and broader cross-registry provenance; M1 native save/restart verification remains separately open.

### Mobile correction-flow QA — 24 September 2026

- Opened the source-linked correction route in the phone-sized web preview with an isolated synthetic accepted lab claim. The existing source was reopened without re-upload; the correction editor showed the extraction/source evidence and prior accepted value.
- Edited the synthetic value and saved. The UI confirmed “Saved as version 2,” displayed the new current value and kept version 1 in the earlier accepted versions list. This verifies the browser interaction over the local service; it does not verify native SQLite persistence or accept Story 2.
- No real health data was used and no model call was made. The temporary Expo/backend services and synthetic fixture were stopped and removed.
- Completion remains **0/11 accepted stories, 0/8 accepted production gates, 0/19 accepted packages (0%)**. Next work remains source-backed registry briefs/provenance, plus native save/restart verification and other story journeys.


### Medical Registry source-linked brief — 24 September 2026

- Connected the selected-topic page to a saved wiki brief. A summary run starts in Ask Nura with the explicit topic/record scope, per-run consent, and recent chat history excluded. The app saves the completed answer, its stated unknowns, the run ID, evidence fingerprint, and only sources whose references were actually cited. Native summaries use a SQLite table with a migration for unknowns and appear in the Privacy inventory; clearing local data removes them.
- The brief compares a SHA-256 fingerprint of connected record identity, category, date, source identity, review/status and revision fields plus user-authored topic links. Any change to those inputs makes the current summary visibly stale. Refresh appends a new version and keeps earlier summaries accessible.
- Internal synthetic phone-preview journey passed at `http://localhost:8092/registry?topicId=cholesterol`: connected the example blood-test fact, ran a real consented provider call, verified the answer cited the report/topic/link and stated the measurement was unknown, saved it, linked a second synthetic clinic-note fact, observed `EVIDENCE CHANGED`, refreshed, verified five citations covering both source records, saved the new version, and observed `CURRENT` plus an earlier-summary control. The preview uses synthetic demo state in memory; this did not verify browser-refresh or native SQLite persistence. No personal data was used.
- Checks passed after the implementation: `npm run typecheck`, `npm run lint`, and `npm run test:repo` (22 tests), including stable evidence fingerprints, fingerprint invalidation after edits/relationship changes, and filtering uncited sources.
- **Status:** this is a verified M2 browser vertical slice, not Story 2 acceptance. Story count remains **0/11**, production gates **0/8**, overall **0/19 accepted packages (0%)**. Native save/restart, phone-size/reduced-motion device review, intake/review-to-wiki completion, cross-registry provenance, and remaining recovery/error paths are still open.


### Registry summary presentation polish — 24 September 2026

- Added a display-only formatter for model Markdown in Ask and Medical Registry; saved source text and citations remain unchanged. Headings, bullets, emphasis, inline code and links now render as readable mobile text instead of showing Markdown tokens.
- Added a reduced-motion-aware “READ FULL SUMMARY / SHOW LESS” interaction for longer briefs. The in-app phone preview at `/registry?topicId=cholesterol` displayed the formatted evidence summary, unknowns and five source rows; expanding changed the visible action to “SHOW LESS.” The visible test records are synthetic.
- Verification passed: `npm run typecheck`, `npm run lint`, and `npm run test:repo` (23 tests, including Markdown display formatting). Browser interaction and render passed; native device motion and persistence were not verified.
- **Status:** presentation defect closed for this slice. The wider M2 story and all 19 acceptance packages remain unaccepted: **0/11 stories, 0/8 production gates, 0/19 overall (0%)**. Next: complete M1 native save/restart when a device runtime is available, while continuing M2 intake/review-to-wiki and provenance/error-path work.


### Registry version-chain integrity — 24 September 2026

- Native Medical Registry summary writes now select the latest persisted version for that topic and append its successor in one SQLite transaction. Per-topic timestamps advance monotonically when two saves occur within the same clock millisecond, and the UI links to the database-committed version only after the transaction succeeds.
- Added persistence tests for consecutive versions, independent topic chains, monotonic timestamps, and rollback after insert failure. Verified the existing mobile browser preview remained functional after hot reload; browser mode continues to use explicitly synthetic in-memory state.
- Verification passed: `npm run typecheck`, `npm run lint`, and `npm run test:repo` (**25 tests**). These tests exercise a transactional database stub; native on-device SQLite restart verification is still open.
- **Status:** this closes an M2 version-link race in the code path; M2 remains in progress and no story or production gate is accepted. Completion remains **0/11 stories, 0/8 gates, 0/19 packages (0%)**. Next: continue intake/review-to-wiki recovery paths and source provenance; M1 still requires device persistence evidence.


### Local video-frame preparation — 24 September 2026

- Added a local-only video processor for MP4, MOV and WEBM files. It rejects unsupported types, unreadable clips and durations over three minutes; samples at most six timestamped JPEG frames; bounds frame size and subprocess time; and removes temporary files in a `finally` cleanup path.
- Added synthetic local video tests for ordered/bounded timestamps, MIME rejection and actual frame extraction from a generated two-second MP4. No uploaded video, personal health record or frame was sent to a model provider.
- Verification passed: `npm run typecheck`, `npm run lint`, and `npm run test:repo` (**28 tests**).
- A change that would send sampled video frames to the configured OpenAI provider was rejected by automatic approval review because prior general API-key authorization did not specifically cover transfer of potentially sensitive video content. Specific approval is pending for a provider-named, per-video consent flow. The sampler is not yet connected to app intake, extraction or review and does not count as completed video support.
- **Status:** M2 and P4 remain partial; completion remains **0/11 stories, 0/8 production gates, 0/19 accepted packages (0%)**. Next: after approval, connect the actual consented video path and review UI; otherwise keep video local-only and continue independent story work.


### Health-history node and linkage pass — 24 September 2026

- Aligned the mobile history timeline with the approved record surface: dated record nodes, the timeline rail and both ends of user-authored links now share cobalt; quieter category tint stays in the card label. This removes the previous blue/amber/green/purple node mix that competed with status colors.
- Selecting a timeline node now gives a short motion-token scale and halo, and the matching source card opens in place. Reduced motion applies the selected state immediately without the scale animation.
- Verified the interaction in the 390 × 844 browser preview with synthetic sample records: selecting the blood-test node highlighted its card and opened source/date context; the Connections view showed both endpoints in cobalt and retained the user-authored relationship label. The browser preview is still in-memory; navigating away reset its sample data, so this is not a persistence acceptance.
- `npm run typecheck`, `npm run lint`, and `npm run test:repo` pass (**28 tests**). No real health information or model provider was used in this visual check.
- **Status:** Story 8 remains partial and no package is accepted: **0/11 stories, 0/8 production gates, 0/19 overall (0%)**. Full visual acceptance still needs native/device, reduced-motion, screen-size and end-to-end source navigation checks.

### Ask-to-provider synthetic journey — 24 September 2026

- Ran the app’s `/ask` flow with only the synthetic demo blood-test record. In the consent sheet, selected saved facts and chosen health areas, deselected user-created links, and left treatment, visits, and external search off before continuing. No real personal data was sent.
- The configured local agent completed a real provider-backed answer. The screen showed actual operational milestones for question classification, profile retrieval, record matching, source opening, and evidence checks; the final answer cited the synthetic report (page 2), identified missing values/units/ranges/interpretation/follow-up evidence, and did not expose hidden reasoning.
- This verifies the end-to-end synthetic Ask slice in the browser at phone dimensions, including consent scope, streamed activity, citations, and unknowns. It does not verify native storage, account isolation, provider retention controls, or the full Ask story; Story 5 and production gates remain partial.
- Current accepted status remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. Next: internally verify other complete story journeys and continue closing the remaining criteria; share only a stable, internally checked in-app milestone with the user.

### Onboarding focus interaction smoke check — 24 September 2026

- On the 390 × 844 browser preview, followed the app entry from Welcome into identity using only synthetic values. Selecting Canada and entering a sample birthday updated the live profile strip to show the selected country and calculated age. The optional biometrics step could be skipped.
- In the focus scene, selecting Sleep updated the selected-area count and opened the related detail branch. Selecting Sleep apnea updated the detail count and profile map. Removing Sleep removed that dependent selection and returned the counts to their prior values. The app announced the selection states accessibly; no profile commit or model call was made.
- This validates a slice of Story 1’s interaction and dependent-selection behavior only. It does not validate the full final-save/recontextualization path, persistence after restart, native behavior, reduced-motion behavior, or visual acceptance. Story 1 remains partial and no acceptance package changes status.

### Ask Nura visual pass — 24 September 2026

- Reworked the compiled Ask screen in [ask.tsx](../app/ask.tsx) to follow the Blueprint conversation surface: plum atmospheric gradient, restrained drifting peach/lilac light, translucent conversation/evidence cards, cream user/action surfaces, and readable warm text. The light/cobalt palette remains specific to records and timeline views.
- Ambient movement follows the operating system's reduced-motion setting. AI activity remains event-driven; this visual change does not add simulated reasoning or a timer-driven loader.
- Internal phone preview at 390 × 844 showed the Ask landing state, connected-service status, suggestion-to-composer interaction, and the per-run consent sheet. Cancel returned to the conversation. No provider call was started during this visual check.
- Verification passed: npm run typecheck, npm run lint, and npm run test:repo (28 tests). The browser view fit at 390 × 844 and 360 × 780; content stayed in view at 430 × 844. A later centered-phone recheck at 430 × 932 fit; the earlier clipped capture did not reproduce and is not recorded as an app defect. Reduced-motion rendering and native device rendering are still unverified.
- **Status:** this closes one visual mismatch in G0 only. Ask and all other stories remain unaccepted; overall remains **0/11 stories, 0/8 production gates, 0/19 accepted packages (0%)**. There is no user-test milestone ready from this screen-only pass.
- **Next:** verify reduced motion and native rendering, then continue the visual implementation audit across the remaining Blueprint onboarding/conversation and light/cobalt record scenes before selecting a full in-app acceptance slice. The active 30-minute heartbeat reports against the same 19-package scope.


### Onboarding focus and label readability — 24 September 2026 (continued)

- Rechecked the onboarding focus scene in the centered 390 × 844 phone preview using fictional sample inputs. The identity fields updated the live profile strip; biometrics appeared in Today; choosing a focus area revealed its dependent detail bubbles; removing the parent focus removed its unanswered child. No provider request or profile synthesis ran.
- Fixed the focus-choice label wrapping so longer names such as “Joints and movement” render across up to three lines instead of being truncated. The current preview shows the complete label.
- Typecheck and lint passed; the repository suite passed all 28 tests. This is an interaction smoke check and one readability fix, not full Story 1 acceptance. Reduced-motion and native-device checks remain open; profile restart persistence and the complete first-understanding edit/recontextualization journey are not accepted.
- Acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages** because none yet passes every stated criterion. Existing partial implementations are tracked per story in the scope document.
- **Next:** internally check the complete profile commit and review/edit loop, then continue the same visual and in-app acceptance pass through registry, record timeline, Ask, insurance, feed, treatment, visit, symptom support, and privacy. Keep family permissions and production gates visible as open scope.


### M1 first-understanding journey — 24 September 2026

- Completed a synthetic in-app walkthrough from Welcome through identity, optional biometrics, focus choices, explicit context review, first synthesis, saved clarification, recontextualization, Home and Profile. Used a fictional profile and synthetic health choices/records only. The context review explicitly excluded the name, birthday, phone and email and made the user approve the selected context before each model run.
- The first live synthesis displayed service-derived activity milestones, cited the selected demo records and user choices, and separated unknown record contents/current measurements from known information. A fictional user note clarified that sleep apnea was an exploration topic rather than a confirmed diagnosis; the next consented revision reflected that distinction and cited the saved note. No chain-of-thought was shown.
- Home and Profile reflected the synthetic user's chosen focus areas, measurements, source count and saved note. This internally verifies the browser slice of the M1 commit/review/edit loop at 390 × 844. It does not pass the full story: native persistence/restart, reduced-motion rendering, error/retry recovery, and complete version/source navigation remain unverified.
- No story or production gate count changes: **0/11 accepted stories, 0/8 accepted gates, 0/19 accepted packages**. This is an internal milestone, not a request for the user to test an unfinished flow.
- **Native verification blocker:** this Mac currently has no `simctl` utility, so an iOS Simulator run cannot be launched here. Native restart/reduced-motion acceptance remains open; continue independent browser work and resume native checks when a simulator or test device is available.
- **Next:** inspect error/retry behavior for profile commit and synthesis; complete phone-size/reduced-motion checks that are available in the browser. Hand off M1 only after its full acceptance checklist passes.


### Health history node and connection visual pass — 24 September 2026

- Reworked [HealthHistory.tsx](../src/components/HealthHistory.tsx) after the phone preview exposed that Connections was only two small rows around a text label. The connection card now uses a larger two-node vertical rail, category-colored node cores, dated/source-type endpoint labels, an explicit user-authored relation, and a plain cue that Nura does not infer cause. Each node and endpoint still opens the corresponding item in the timeline.
- Timeline event nodes now share the same category palette: cobalt for records, teal for vitals, lilac for care, amber for treatment, and green for lifestyle. The selected-node ring and glow follow the event’s own category color. The motion remains tied to the existing screen transition and respects the existing reduced-motion branch in code.
- Verified in the 390 × 844 browser preview using synthetic records: Connections shows the sample lab and clinic items as distinct colored nodes, the relationship label and source dates are readable, and tapping a node returns to the selected, expanded timeline item with its source. Timeline and Connections both fit the phone frame.
- Typecheck and lint passed; `npm run test:repo` passed **28/28**. This closes a visual/interaction defect slice, not Story 8. We have not verified reduced-motion behavior at runtime, the native device path, all node categories, multi-link density, or the full connection-create/edit/remove acceptance sequence. Overall remains **0/11 stories, 0/8 production gates, 0/19 packages**.
- **Next:** exercise link creation, selection and removal across category pairs, then continue the remaining story journey checks. Native verification is still blocked here because the current Mac has no `simctl`; browser work continues independently.


### Health history connection actions — 24 September 2026 (continued)

- Exercised the phone preview's Connect Saved Items flow with fictional endpoints: Weight and Sample medicine. The user-selected “Related in my words” relationship and note were displayed between category-colored teal and amber nodes. Tapping each node routes to the selected timeline item.
- Browser testing exposed that the prior native-alert removal prompt was invisible on web. Replaced it with a shared animated confirmation sheet that states the two records will remain and only the link will be removed. Confirming removed the disposable test link and returned the count to the original synthetic connection; the confirmation path is now visible in both targets by construction, but native runtime remains unverified.
- Final typecheck, lint and repository tests passed; **28/28** repo tests. The browser preview at 390 × 844 showed the full connection card, relationship note, footer and confirmation sheet without clipping.
- Story 8 remains partial: all date filters, larger graph density, native and reduced-motion runtime, full source/version navigation and the complete phone acceptance pass remain open. Current totals are unchanged: **0/11 stories, 0/8 production gates, 0/19 accepted packages**.
- **Next:** verify filters and source navigation across the record timeline, then advance the Medical Registry/intake story slice; continue with synthetic data. Native validation remains unavailable on this Mac while `simctl` is absent.


### Health timeline filter and source-navigation smoke check — 24 September 2026

- Verified the synthetic 10-item history on the phone preview: Everything showed 10 items; Documents showed 1, Care 3, Treatment 2 and Vitals 3. The selected filter changed the list and count together. Returning to Everything restored the complete newest-first timeline.
- A node opened the corresponding selected timeline item with its source details; the synthetic report's page reference and demo label were visible. Category node and selected-card colors remained aligned.
- This closes only the filter/source-navigation browser slice of M8. Native runtime, reduced-motion runtime, long-history density/scroll behavior and full story acceptance remain open. Acceptance remains **0/11 stories, 0/8 gates, 0/19 packages**.
- **Next implementation story:** continue M2 Medical Registry intake-to-wiki completion, checking PDF/image intake, review decisions, fact correction/version history, source navigation and a topic-scoped Ask run. Keep sample data synthetic, and report each complete acceptance package separately.


### Medical Registry review-route runtime fix — 24 September 2026

- Added an explicit stop action for in-flight document extraction. Cancelling aborts the client request; the local backend already propagates disconnects to the provider request. The UI records a user-requested stop separately from failure and does not add claims to the profile.
- Fixed a React Native Web runtime warning on the source-review route: an empty source identifier could be emitted as a text child of a `View`. The route now uses an explicit boolean guard.
- Reloaded `/review?purpose=medical` at phone preview size. The review screen and demo file are visible with no error overlay after the fix. The demo file is synthetic; no extraction/provider request or real health record was used in this check. Historical browser logs still contain the pre-fix warning, but it did not recur in the clean post-fix screenshot.
- Verification passed: `npm run typecheck`, `npm run lint`, and `npm run test:repo` (**28/28**). The cancellation path has code and static-check coverage but has not yet been exercised with a real local fixture end to end.
- **Status:** M2 remains partial; no story or production gate is accepted. Totals remain **0/11 stories, 0/8 production gates, 0/19 accepted packages**. This is not a user-test milestone.
- **Next:** exercise consented PDF/image intake with a synthetic fixture, then verify accept/edit/reject, source correction and earlier-version preservation, source navigation, and topic-scoped Ask before presenting a single end-to-end milestone.


### Nura interface copy pass and synthetic document-read evidence — 24 September 2026

- Rewrote user-visible implementation language across intake, file review, Ask consent, privacy, health-feed availability, family sharing, and visit preparation. The app now describes what the person can do and what information is shared, rather than naming local services, providers, server keys, or server events.
- Added direct preview-mode wording: use fictional details and files; a selected file is sent to Nura’s AI service only after confirmation; suggestions remain outside the profile until approved; the service’s privacy practices apply. Video copy now explains that a video can be saved but its contents are not reviewed or sent for analysis.
- Corrected browser-preview storage guidance: changes persist in the browser across refresh and remain until cleared. The previous “clears on refresh” and “until refresh” messages were inaccurate.
- A consented, fictional one-page PDF was read after browser refresh. Nura returned four suggested lab details with page-one quotes; all remained pending for review and none was written to the profile. This confirms browser file persistence through the read flow, not acceptance of the full M2 story.
- TypeScript and lint checks pass. The 34-test repository suite was not rerun during this copy change. Current strict acceptance remains **0/11 stories, 0/8 production gates, 0/19 accepted packages**.
- **Still open in M2:** verify accept, edit, dismiss, correction version history and source navigation, then finish a topic-scoped Ask run. Do not treat this copy pass or the document-read slice as a user-test milestone.


### Built-in synthetic lab report — 24 September 2026

- Added the user-supplied, explicitly synthetic PL0005 lipid-profile report to the Medical Registry intake as **Try a sample lab report**. The report is saved locally as a source file; selecting it does not run extraction, call an AI provider or create profile facts.
- The separate review screen still presents the per-file transfer confirmation before extraction. Suggestions remain review-only until the user accepts them.
- Verified the phone preview flow: add sample → report appears in the file list → browser refresh → report remains available → review screen opens with the sample selected. No provider request was made.
- TypeScript typecheck passed; full ESLint passed with cache disabled; repository suite passed **34/34**. The lint pass exposed missing Node `Buffer` globals in the local video processor; the module now imports `Buffer` from `node:buffer` and no longer carries an unused `extname` import.
- Diagnosed the earlier correction failure as a stale local API process: the process on port 4175 returned `not_found` for the current route. Restarted it from the current tree, changed `agent:dev` to Node watch mode, and confirmed the updated route. In the synthetic review screen, saving a correction produced version 2 and retained version 1 with its original source link. No file was sent to the provider during this check.
- **Status:** M2 remains partial and no package is accepted. Continue with consented extraction and the accepted/edit/dismiss/correction/source-navigation/topic-Ask sequence before a user handoff.

### Home health-area tiles — 24 September 2026

- Fixed the collapsed Home tile geometry by giving each animated wrapper an explicit two-column width and the card a full wrapper width. Tile labels now remain readable instead of breaking one character per line. Increased the icon, title, supporting text, count, and card hit area.
- Connected Today, History, Records, and Life to the matching Vitals, History, Documents, and Lifestyle timeline filters. The destination keeps the selected filter visible at the front of the horizontal filter row. Treatment and Cover continue to open their dedicated registries.
- Verified the synthetic browser preview by opening the Vitals, History, Documents, and Lifestyle tiles. Each landed on the expected filter; Lifestyle showed an honest empty state with 0 matching records. Preview remained at /home between checks.
- npm run typecheck, npm run lint -- --no-cache, npm run test:repo (52 passing), and git diff --check passed.
- This closes a Home layout/navigation defect only. It does not pass the Home user story or change the accepted completion baseline: 0/11 stories, 0/8 production gates, 0/19 packages.


### Live profile motion and sample-report review — 24 September 2026

- Added staggered arrival and a restrained color wash/value settle to the live identity and Today signals during onboarding. Changes respond to completed/discrete input; continuous typing does not bounce the whole profile strip. The same values/colors remain visible when reduced motion is enabled.
- The supplied screenshot’s browser context was `/services` while its content was Home. The current `/home` route renders the six health areas as readable two-column cards; the collapsed three-column image is not the current route rendering. The Home “Whole picture” section remains a navigable summary, not the connected historical node map in the approved timeline reference.
- Reopened PL0005 through the app’s saved-file review. Exact duplicate detection opened its prior review without sending the same file again. The eight numerical lipid results match the report’s labels, values, units, reference ranges and 21 January 2025 date. Total cholesterol is still pending review. A general fasting instruction was mistakenly accepted as a personal profile detail; I added a server-side safeguard that moves matching general lab guidance into document context for future extraction and added regression tests. The old accepted detail remains visible in the existing sample profile pending a user correction; it was not silently removed.
- Typecheck and lint pass; `npm run test:repo` passes **54/54**; `git diff --check` passes. No end-to-end story or production gate is accepted by this slice; totals remain **0/11 stories, 0/8 production gates, 0/19 packages**.
- **Next:** correct the sample’s already-saved generic guidance through an explicit source-review decision, verify persisted PDF claims/quotes against every report row, then continue the Home and record-timeline interaction acceptance pass. Keep the node map, relationship colors/links, Ask traces, and production foundations visible as open work.


### Accepted-fact retraction with preserved source history — 24 September 2026

- Added a review action for a previously accepted source claim: the person must confirm before Nura removes it from the active profile. The claim remains visible as “Removed from profile” with its original source quote, file, assertion and review history.
- The retraction is version-checked on the server. A stale review cannot retract a newer assertion. The local profile closes the active fact with a validity end date and records the retraction state; it does not delete the fact or source. If the server records the decision before device persistence succeeds, reopening the source review reconciles the still-active local fact.
- Added regression checks for preserved source/assertion history, idempotent retraction, stale-version rejection and local-state recovery matching. Repository suite: 57/57 passed. Typecheck, lint and diff check passed.
- The sample report’s already-accepted general fasting guidance remains in the current synthetic profile until someone confirms its removal in the app. I did not mutate that saved profile during this implementation check.
- This repairs one source-review and profile-history capability; it does not complete M2 intake or change accepted story/gate/package counts.


### Home route audit and Explore feed duplicate suppression — 24 September 2026

- Audited the supplied collapsed-tile screenshot against the live preview and current route code. The screenshot context was `/services` while its content was Home. In the current app, `/services` is Explore and `/home` is the Home health-area view. The current Home implementation already uses a two-column card layout; the live accessibility tree exposes full labels and supporting text. The one-character-wrap image does not match the current route output.
- Explore showed repeated same-publisher/same-title results for a selected topic. Added URL canonicalization for fragments/tracking parameters/trailing slashes and duplicate suppression by publisher, visible title, and selected topic. Distinct publishers, distinct article titles and separately sourced topics remain separate entries; source identities and citations still use the canonical HTTPS URL.
- Verification passed: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run test:repo` (**61/61**) and `git diff --check`. The feed contract tests use deterministic synthetic URLs. No health file or provider request was used.
- Automatic approval review rejected the proposed video-to-OpenAI extraction path because it would enable transfer of sampled health-video frames and filename to the provider. No video extraction code was added and no video data was sent. The existing local sampler remains disconnected from app review; audio remains unanalyzed. This requires explicit approval for that provider payload and destination before the integration can be enabled.
- Story, production-gate and package acceptance remain **0/11 stories, 0/8 production gates, 0/19 packages**. The screenshot route discrepancy and feed-card deduplication are defect fixes, not completed user stories.


### Persisted Explore feed duplicate presentation — 24 September 2026

- The live `/services` preview retained duplicate articles from an earlier search even after the server-side search deduper was added. Server deduplication only fixes new responses; it does not clean up cards already saved in the browser or native feed store.
- Added non-destructive grouping at render time for canonical HTTPS URL aliases and matching publisher/title/topic cards. The UI shows one source card while retaining all member IDs; Save applies to the grouped copies, Hide affects visible copies only, and Undo restores only the items that were visible before dismissal. Topic labels are combined when one source matched multiple selected areas. Existing feed rows are not deleted.
- Rechecked the live phone preview without starting another external health search. Explore went from 12 saved cards to 10 visible unique cards. The `/home` preview separately shows the six health areas in a readable two-column layout; the user-supplied one-letter-wrap image remains a route/preview mismatch, not the current Home rendering.
- Verification passed: typecheck, lint, `npm run test:repo` (**66/66**), and `git diff --check`. The five focused grouping tests cover publisher/title matching, URL aliases, topic merging, save state, and reversible dismissal state.
- This is an Explore presentation defect fix, not Story 4 acceptance. Overall remains **0/11 stories, 0/8 production gates, 0/19 packages**. Story 4 still lacks video results/detail, publication-date extraction, full personalization controls and full journey acceptance.

### History filters fit the mobile viewport — 24 September 2026

- Reproduced the phone-sized History screen in the live app. Seven category filters were placed in a sideways strip, leaving the fifth chip visibly cut off and giving each filter a small touch area.
- Changed the filters to wrap across rows with a 44-point minimum height. All seven labels are now visible at once; the active filter remains highlighted and filtering still updates the timeline in place.
- Live check at the phone preview: all seven filters rendered without clipping. Selecting **Vitals** changed the visible list from 21 to 12 captured entries; returning to **Everything** restored all 21.
- `npm run typecheck` and `npm run lint -- --no-cache` pass. The ordinary cached lint invocation could not write under `.expo/cache` in this environment; the no-cache lint check passed. No user records were changed.
- The attached skinny Home cards are from a stale/mismatched view: its browser context was `/services`, while its content is Home. The current `/home` render has six readable two-column areas. The Home summary still is not the requested connected history map. Overall remains **0/11 accepted stories, 0/8 production gates, 0/19 packages**.

### 720 profile map: live domains and coordinated history nodes — 24 September 2026

- The 720 profile map now derives its domain counts and expandable contents from the active profile, saved files, treatments, visits, insurance sources and selected health topics. Each domain opens its actual records/topics and offers the matching in-app destination; records can be opened from the map.
- Unified history timeline nodes, selection rings, spine and connection endpoints on the cobalt record palette. Event type remains visible on each card, so the blue timeline does not erase the source/category cue. Expanded map rows use the existing short motion and reduced-motion branch. The map clarifies that categories may overlap and links are organizational, not causal.
- Verified in the synthetic 390-point phone preview: counts reflected 5 of 6 domains with saved information and 22 current items; expanding Biometrics showed linked sample facts and their source/date, and its add action targeted the profile screen. Typecheck, lint without cache and the repository suite passed (**66/66**); diff check passed.
- This is a verified history/profile-map interaction slice, not Story 8 acceptance. All eleven story packages and all eight production packages remain unaccepted until their complete journeys/gates pass: **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. Native runtime, reduced-motion runtime, all viewport sizes, graph density and complete source/link journey remain open. No user test is due from this slice.


### History palette and bottom navigation refinement — 24 September 2026

- Applied the supplied color mix by screen role: the welcome and Ask flows keep their atmospheric plum-to-mauve gradients; record and Explore screens use a warm near-white canvas, white cards, and cobalt actions. Explore's featured source artwork now blends blue, peach, and mauve. The History summary is white with the shared blended orb, while record cards stay white and nodes retain distinct cobalt, teal, lilac, amber, and green category cues. Connection rails now transition from the first endpoint's color to the second; the cobalt timeline spine continues to mark chronology.
- Replaced the incomplete People bottom tab with the agreed Care tab. People & sharing remains reachable from Profile, with clear copy that family access is not yet available.
- Checked the phone preview at `/` and `/health`: the onboarding gradient now has a visible plum-to-rose blend, while History uses the light surface, category colors, and persistent navigation. Explore remains light and its gradient featured artwork appears when search results exist.
- Verification passed: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run test:repo` (**66/66**) and `git diff --check`.
- This closes the palette and navigation presentation defect only. It does not accept Story 8 or the Care, family, or production gates. Overall acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. Native and reduced-motion checks remain open.

### Blueprint color-mix refinement — 25 September 2026

- Compared the compiled phone preview on History (`/health`), Home (`/home`), Explore (`/services`) and Ask (`/ask`) with the three supplied mobile references. The light record/feed scenes already use a lavender-tinted near-white canvas, warm paper cards, cobalt actions and the blue–peach–mauve editorial artwork. Kept that separation instead of spreading the dark gradient across record screens.
- Ask had drifted toward a mostly dark-purple field. Its background now shares the onboarding plum–mauve–rose–plum gradient stops, with slightly clearer peach and lilac blooms. The composer is warm cream with plum text/action treatment; the disabled arrow uses a darker muted-plum glyph for legibility.
- Visually checked the updated Ask screen in the browser phone preview. History, Home and Explore were also reviewed; no search, model request, upload or profile-data change was made.
- `npm run typecheck`, `npm run lint -- --no-cache` and `git diff --check` passed. No repository test suite was run for this visual-only change.
- This closes one palette mismatch, not a user story or release gate. Acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. The full reduced-motion/native/viewport visual audit and end-to-end story checks remain open; no user acceptance milestone is ready from this slice.

### Mixed-tone color system refinement — 25 September 2026

- Consolidated the recurring scene recipes in `src/theme.ts`: onboarding, Ask Nura and the shared atmosphere now use the same deeper plum–mauve–rose gradient; the Home feature uses its coordinated plum-to-rose blend; Explore artwork uses blue, peach and lilac.
- Shifted the record/feed canvas closer to neutral paper while preserving warm cards, category colors and cobalt actions. Selected health-area chips now use the same cobalt treatment as the Explore reference.
- Compared the running phone preview on Ask, Home, History and Explore. The views retain their distinct roles: immersive Nura moments and light evidence reading. Existing sample results remained untouched; no new source search, upload or profile edit was performed.
- TypeScript, lint and diff checks passed. This is a palette-system refinement only; the acceptance baseline remains **0/11 user stories, 0/8 production gates, 0/19 packages**. Native, reduced-motion and full story acceptance checks remain open.

### Medical Registry citation navigation — 25 September 2026

- Fixed the citation-to-timeline mapping for Registry summaries. Direct fact/treatment/visit citations open the matching item; page-level extracted document citations open the connected local source file; user-authored relationship citations open one linked endpoint. Unknown citation IDs fall back to the full History view instead of requesting a nonexistent selection.
- Added focused tests for direct record, extracted document, relationship and unmatched citation IDs. `npm run test:repo` passed **72/72**; typecheck, lint and diff checks passed. A live tap-through of the citation path remains open.
- This is a source-navigation fix within M2, not end-to-end Medical Registry acceptance. The package baseline remains **0/11 stories, 0/8 production gates, 0/19 packages**; browser refresh, native persistence/motion and remaining M2 states stay open.


### Medical Registry citation tap-through — 25 September 2026

- Continued the synthetic Registry journey from the saved Cholesterol summary. Tapping citation **R2 · Total cholesterol** opened Health History with the exact accepted fact selected (`6.1 mmol/L`, 24 September 2026), and displayed its linked `Nura-Synthetic-Lab-Report.pdf`, source quote, page reference and correction/source actions.
- The source screen contained the expected summary evidence and selected record; the app did not route to an unrelated result or an unfiltered list. This verifies the direct-record citation branch in the live browser preview. The page-level document and user-link citation branches have focused code tests, but were not live-tapped in this journey.
- The preceding synthetic browser journey had explicitly linked the source file and accepted fact to the Cholesterol topic, run the per-run consent review, received a provider-backed source-scoped summary with citations and unknowns, and saved it as current. No personal health record or user-supplied file was sent.
- **M2 remains partial:** refresh/native persistence, all accept/edit/reject paths in one clean run, changing linked evidence and verifying stale/current version behavior, reduced-motion/native checks, and live taps for document/link citations remain open. Completion totals stay **0/11 stories, 0/8 production gates, 0/19 packages (0%)**.
- **Next:** verify summary freshness and retained-version navigation using only synthetic data, then complete the remaining M2 source-review and recovery cases before offering a user milestone.


### Ask evidence citation destinations — 25 September 2026

- Replaced URL-only citation taps in Ask with evidence-aware destinations. Local fact citations open the exact Health History item (including prior fact versions retained in history); selected health-area citations open their Medical Registry page; treatment and visit citations open their timeline entries; extracted document details resolve to the matching saved local file; user-authored link citations open a resolved endpoint. Public citations open only HTTPS URLs. Missing or out-of-scope local sources are visibly unavailable rather than appearing tappable.
- Coverage findings now make the cited policy term and related health evidence actionable from the assessment itself. Citation cards show source, date and a short evidence excerpt, with an explicit destination label.
- Verified the compiled browser app with an existing fictional saved answer, without starting another provider request or changing profile data: R1 opened `/registry?topicId=cholesterol`; R2 opened `/health?focusId=fact:4535c48c-3086-42a1-8334-3f17fcc73a94`, selecting the 6.1 mmol/L Total cholesterol fact and showing its report filename, page quote and source actions. The user's existing browser tab was left untouched.
- Added focused route-resolution tests for facts, superseded facts, topics, treatment, visits, document details, user links, HTTPS sources and missing/out-of-scope sources. TypeScript, Expo lint, diff check and the repository suite passed (**80/80**).
- This closes a citation-navigation defect across M3/M5, not either full story. Insurance assessment was not live-run in this slice; its complete policy comparison/version journey remains open. Native/reduced-motion acceptance and all production gates remain open. Totals stay **0/11 stories, 0/8 production gates, 0/19 packages (0%)**.
- **Next:** complete the Insurance Registry source/version comparison path and its synthetic accept/edit/dismiss/coverage journey, then internally verify the same citations from an insurance answer.

### Insurance term history disclosure — 25 September 2026

- The Insurance Registry now groups all accepted source-linked coverage entries by original policy source. Current entries stay visible; corrected earlier versions and user-removed entries remain available in a collapsed, animated review-history section and are labeled separately. Sources with historical entries but no current record entry stay visible.
- The history interaction reports its expanded state to assistive technology and skips layout motion when the OS requests reduced motion. Per-term notes are labeled “Source details,” not displayed as verbatim source quotations; the original document still opens in source review.
- Added four focused tests for corrected-version retention, user retraction, historical-only sources/unrelated-fact exclusion, and ordering. The existing phone preview at `/insurance` showed the saved sample file awaiting review and the honest empty-policy state; no accepted policy facts were present to exercise the expanded card in the UI. No file upload or provider/model call was made.
- Verification passed: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run test:repo` (**84/84 tests**) and `git diff --check`.
- **Status:** M3 remains partial. This closes corrected-term history presentation only; comparison of replacement policies across separate source documents, inspection of conflicting clauses across policies, and the full synthetic accept/edit/dismiss/coverage/citation journey remain open. Overall acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. Next: connect source-version relationships across distinct policy documents and internally complete the synthetic M3 journey without sending non-synthetic records.


### Mixed-tone palette and policy-source comparison foundation — 25 September 2026

- Tuned the shared paper canvas toward a visible lilac cast while keeping warm near-white reading cards and cobalt actions. Deepened the plum–mauve–rose atmosphere and refreshed its coordinated Home and blue–peach–lilac Explore blends. Identity-entry fields now use warm paper with dark text against the full gradient, matching the supplied screen reference. Updated the experience and storyboard specs to record the same color roles.
- Added a typed, persisted relationship for a user-marked policy replacement, separate from clinical/user health links. It validates that both sources are saved insurance documents and rejects duplicate or circular history. Browser workspace v1 loads without losing data; native SQLite stores and removes the relation.
- Insurance now lets the user choose an earlier policy, confirm the relationship, inspect exact-label matches between accepted current entries, open either source, and remove the link. Different, identical, ambiguous, and one-sided entries are distinguished; missing wording is explicitly not called an exclusion and the screen does not decide which policy is active.
- Regression suite passed **90/90**, and TypeScript, Expo lint, and `git diff --check` passed. Checks cover source validation, cycles, comparison states, missing terms, ambiguous labels, and browser migration. The app was not visually re-captured in this pass; native, reduced-motion and live policy-document journeys remain unverified.
- This is a palette correction and a partial M3 foundation, not story acceptance. Overall remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. Next: internally exercise the synthetic two-policy accept/edit/dismiss/coverage/citation journey and continue the whole-app visual/motion audit.

### Insurance comparison evidence navigation — 25 September 2026

- Added a “View source quote” action to each accepted value in a linked-policy comparison. It resolves the exact insurance asset, source and extraction claim; the review screen opens that saved extraction, scrolls to the matching claim and highlights its quoted page evidence without entering correction mode.
- Added target-resolution tests for the valid policy path, missing provenance, wrong-purpose assets and unavailable sources. The full repository suite passed **93/93**; TypeScript, Expo lint and `git diff --check` passed.
- This closes a comparison-to-evidence navigation gap in M3, not Story 3 acceptance. The complete synthetic two-policy accept/edit/dismiss/coverage/citation journey has not been run in the UI; policy conflict semantics, coverage answers grounded in selected health evidence, and mobile/native motion checks remain open. Acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**.
- **Next:** complete the synthetic two-policy journey, verify both document quote destinations and typed coverage assessment citations, then return to the broader visual/motion pass.


### Current-state correction — 25 September 2026

- Re-audited the app after commit `409011c`. The connected video path is `app/intake.tsx` → `app/review.tsx` per-file confirmation → `src/services/intakeClient.ts` → `server/index.mjs` → `server/adapters/videoProcessor.mjs` and `server/adapters/openaiResponses.mjs` → timestamped candidate claims in the existing review decision flow. Video audio is not sent or analyzed. This is a code-path verification, not a live provider/model acceptance run.
- The earlier build-board statement that video was still waiting on authorization is stale. Its consent UI is already in the app; no provider payload is sent until the person chooses the explicit file-review action. A complete synthetic video UI journey remains open.
- Audio upload/transcription is still absent, and this machine has no local Whisper/faster-whisper recognizer. A provider-backed implementation would transmit the chosen voice recording for transcription and then a timestamped transcript for candidate extraction. Automatic approval review rejected the proposed code change because this audio payload and external destination had not been specifically authorized. The next step is waiting for the user’s choice on per-file in-app consent for that exact flow; no audio was sent and no approval gate was bypassed.
- Full story and production gate counts remain **0/11 accepted stories, 0/8 accepted production gates, 0/19 accepted packages**. Those counts require complete journeys, production gates, and user acceptance, not source inspection alone.


### Insurance-to-health relevance and citation pass — 25 September 2026

- Ran two consented synthetic comparisons from `/insurance` → Ask Nura using only fictional policy records. With no health fact selected, the response stated the 2025/2026 wording changes, missing terms and insurer questions without claiming personal relevance; the activity trace matched the returned evidence.
- Repeated with only the fictional “Example clinic visit” selected. The provider answer described the cardiology copay and visit cap as possibly relevant only if the visit met the policy definition, stated what the sample record did not establish, and did not make a coverage determination. The generic-prescription term was explicitly left unlinked because the visit note contains no prescription.
- Tightened the model instruction against attaching every selected health record to every policy term. The coverage panel now labels a linked item as selected health context and explains that its presence does not establish applicability. A policy citation tap opened its exact dated policy fact in History.
- Verification passed: TypeScript typecheck, changed-file ESLint, `git diff --check`, and repository suite **116/116**. This is an internally verified M3 comparison slice, not full M3 acceptance: policy upload/review decisions, conflict/error recovery, native/reduced-motion checks and the rest of the acceptance journey remain open. Overall stays **0/11 stories, 0/8 gates, 0/19 packages**.


### Audio processing groundwork — 25 September 2026

- Added local media-type/duration preflight and a pure mapper that keeps candidate claims tied to exact quoted text and a timestamped segment index. Added both suites to `npm run test:repo`.
- This is not audio intake, transcription or provider support: no audio UI or route is connected and no recording or transcript was sent. The specific provider-transfer consent decision remains pending. The helpers are local groundwork only.
- Typecheck, changed-file ESLint, diff check and the full **116/116** repository tests pass. P4 remains partial.


### Insurance snapshot scanability — 25 September 2026

- The `/insurance` page now gives each policy a compact “At a glance” list of approved medical limits, cost-share terms, premium amount and life cover when present. Each item opens the exact saved policy quote.
- Key medical details missing from the approved extraction are now listed on the policy card instead of appearing only as a count or after opening several breakdown sections. Copy explicitly says that not found in this summary does not mean excluded.
- Tightened the missing-detail matcher so an annual visit cap cannot satisfy the separate annual/lifetime medical-limit fields; a focused regression test covers both cases.
- A synthetic two-policy browser preview confirmed the new cards render with accepted sample terms, missing details, explicit exclusions, source actions and the existing change summary. This checks the browser accessibility tree and source actions; it does not pass the entire insurance-story acceptance journey or native visual review.
- `npm run typecheck`, changed-file ESLint, `git diff --check` and `npm run test:repo` pass; repository tests are **119/119**. Full ESLint has zero errors and one pre-existing unused-variable warning. Insurance Story 3 remains partial; package acceptance remains **0/11 stories, 0/8 production gates, 0/19 overall**.

### Adaptive onboarding map and scoped-area navigation — 25 September 2026

- Removed the four-area display cap from the profile map. One to four selected health areas retain the roomy constellation; five through all nine available areas use a compact three-column network. Every chosen area remains visible, color-coded, connected to the profile node and independently tappable.
- The detail sheet identifies the active area and states that its choices apply to that area only. The selected-area controls wrap into multiple rows, so the active chip and all other selected areas stay visible together instead of being hidden offscreen.
- Rechecked the isolated fictional onboarding preview with five and all nine areas selected. The selected count and map count matched; each selected area opened its own scoped sheet. The preview used a separate nura.localhost origin; temporary synthetic choices were cleared and the user's saved origin was not changed.
- Latest verification: npm run typecheck, npm run lint -- --no-cache, npm run test:repo (121/121 tests), and git diff --check passed. These are internal checks, not story acceptance.
- No user story or production gate is accepted by this change. Totals remain 0/11 stories, 0/8 gates, 0/19 overall. Native-device/reduced-motion acceptance and the complete profile journey remain open.
- Next: continue the G0 mobile visual audit, with active-area visibility, narrow-screen layout, and reduced-motion behavior included.


### Onboarding name clarity and responsive focus map — 25 September 2026

- The profile name is now explicitly required as a display name or nickname; a legal name is not requested. Country, birth date, contact details and measurements remain optional. Removed a contradictory helper line that implied every field could be skipped. Submitting an empty name stays on the identity step and shows an inline explanation.
- Reworked the narrow onboarding header and health-area chooser so the progress labels no longer collide with the step title, the selected count is separate from its helper, and all nine area bubbles fit at phone widths. Scene transitions dismiss the keyboard and reset the new step to its top position.
- In an isolated fictional browser preview at 360, 390 and 430 px widths, the nine-area selector fit within the phone viewport. Selecting all nine updated the count to 09 and rendered nine individual, interactive nodes in the connected profile map. The map continues below the selector in the scrollable onboarding screen. Empty-name validation stayed on the identity step. No preview runtime errors were reported.
- Verification passed: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run test:repo` (**121/121**), and `git diff --check`. This is a focused UI/interaction verification; native-device and reduced-motion review remain open.
- Acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. Story 1 remains partial because the full profile synthesis, correction/recontextualization and restart journey has not passed its acceptance contract.
- **Next:** continue the G0 mobile visual audit across the full onboarding storyboard and reduced-motion states, then proceed through the remaining story journeys and production gates.


### Onboarding chooser clarity and complete first synthesis — 25 September 2026

- Updated the compiled focus-area selector so each animated, category-colored bubble contains its icon and selection state, while the full area name sits below it. Long labels no longer wrap inside the circles. The 3-column chooser and the separate live profile map remain distinct; the map fits all selected areas, including more than four.
- The display name is required as a name or nickname, not a legal identity. Country, birthday, contact details and measurements remain optional. Updated both storyboard artifacts and the mobile layout specification to match the app copy.
- In a new isolated synthetic profile, the chooser started at **00 selected**. Selecting five areas updated the count and showed all five individually tappable nodes and their color-coordinated links in the live map. Rechecked the visual layout at **360 × 780**, **390 × 844**, and **430 × 932**; labels remained readable and the 360-pixel map header and counters fit. Previously saved preview selections remain visible by design; they are not first-run defaults.
- A synthetic end-to-end profile synthesis exposed a retrieval defect: the broad first summary query could return only eight items from a consented 12-item profile, causing entered height and weight to be reported as unknown. First synthesis now retrieves the complete selected context (bounded at 32 items) and its user-authored links; if that bound is exceeded, the omitted-item count is reported and omitted details are not labeled unknown. Normal Ask searches retain the eight-result relevance cap.
- Re-ran the live summary with the 12-item fictional scope. It cited the entered **168 cm** height and **62 kg** weight and described the sample records as present but not detailed; the unknowns correctly identified missing readings, results and medicine details. The consent preview explicitly excluded name and contact information. No real health data was sent.
- Added retrieval tests for all selected facts/topics/links, bounded overflow reporting and preservation of the regular Ask result cap. Verification passed: TypeScript typecheck, Expo lint, `npm run test:repo` (**123/123 tests**), and `git diff --check`.
- This is an internally verified onboarding/retrieval slice, not full M1 acceptance. Reduced-motion and native-device checks, complete correction/recontextualization/restart acceptance, and the other ten user journeys remain open. Counts remain **0/11 accepted stories, 0/8 accepted production gates, 0/19 packages (0%)**.
- **Next:** continue M1 through correction and recontextualization using cited synthetic values, then verify persistence/restart and reduced-motion behavior before any user review.


### M1 synthetic correction and recontextualization — 25 September 2026

- Continued in the isolated browser app at `/profile-summary` using only fictional profile details. Added a sample note distinguishing user-entered height and weight from lab results, then reviewed the per-run scope and chose to recontextualize.
- The live agent run cited the new profile note and both selected measurements. It kept chosen focus areas separate from confirmed findings and left unsupplied readings and source-record details under “doesn’t know yet.” The run used 13 selected profile items and excluded the profile name, contact details, birthday and public search.
- Saved the complete profile-summary answer, citations, unknowns, next details, trace and revision label with the assistant message. After refreshing `/profile-summary`, the browser restored the updated answer, cited source list, unknowns and completed activity trace instead of returning to “Create my first understanding.” The same metadata is included in the native message-store JSON path; on-device SQLite restart remains unverified.
- Corrected the consent sentence construction; the live preview reads “13 selected profile items.” Reopening the consent sheet to verify its copy and canceling did not start another run.
- Verification passed: TypeScript typecheck, Expo lint, `npm run test:repo` (**123/123 tests**) and `git diff --check`. The browser refresh and recontextualization checks used fictional profile details only.
- This internally verified browser slice does not establish Story 1 acceptance: native persistence/restart, reduced-motion/device checks and the full onboarding-to-edit journey remain open. Totals remain **0/11 stories, 0/8 production gates, 0/19 packages (0%)**.
- **Next:** inspect reduced-motion behavior and native persistence/restart, then continue the remaining M1 acceptance checks. No user-test milestone is ready yet.


### Retrieval state gate and health-history design exploration — 25 September 2026

- Closed a retrieval safety gap: Ask context now admits only facts marked `confirmed` or `reviewed`. Candidate, pending, rejected, superseded, missing and unknown statuses are dropped at the server request boundary. A regression test covers the full status list.
- Refined profile setup so the selected health-area map is shown before the chooser; adding/removing an area updates the map without opening detail entry, while tapping a map node opens its area-specific detail choices. Browser interaction was internally checked with fictional data. This changes onboarding interaction but does not establish M1 acceptance.
- Updated the map and selection copy to call these “tracking preferences,” state that they are not diagnoses or medical records, and direct the person to the next profile review to add past reports. The upload action currently lives on `/profile-summary`; the “X-ray or scan” detail chip itself only records a tracking preference and does not open intake.
- Product distinction: choosing “Joints and movement” or “X-ray or scan” saves a tracking preference; it does not select or upload a medical report. The flow must keep topic preference, self-reported detail, source evidence and AI suggestions distinct. Multiple files and a plain-language note should enter one batch, then real processing events lead to a source-level review and one explicit approved-memory save.
- Verification passed after the regression fix: TypeScript typecheck, Expo lint with cache disabled, `npm run test:repo` (**124/124 tests**), and `git diff --check`. Acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. Story 1's correction/recontextualization, native persistence/restart and reduced-motion acceptance remain open; the other ten stories and eight production gates also remain incomplete.
- **Next:** complete required checks, commit and push this slice, then apply the selected health-history design and make the “track an area / add current detail / upload past record” journey explicit. No new user-test milestone is ready yet.


### Tracking choices versus medical records — 25 September 2026

- Clarified the onboarding labels: the visual is now called **Your tracking profile / Areas you chose**, the supporting copy says selections are tracking interests rather than diagnoses or records, and detail chips are labeled tracking preferences. The screen points forward to profile review for adding past reports.
- Confirmed the current route behavior: “X-ray or scan” only adds/removes a tracking topic. The actual medical upload action is currently on `/profile-summary` as **Add health records**, after the profile review; it offers supported file choices and keeps extracted suggestions in review until the person decides.
- This is a truthful-copy correction only. The connection-map visual remains under design review; no health-history option has been selected or implemented. Acceptance remains **0/11 stories, 0/8 production gates, 0/19 packages (0%)**.
- **Next:** complete the whole auth-first setup contract in the storyboard and align its implementation; no timeline-layout option is awaiting selection.


### First-run setup scope correction — 25 September 2026

- The rejected A/B/C timeline mockups answered the wrong question and have been removed. The user is asking for one coherent end-to-end setup journey, not a choice of timeline layout.
- Updated the Story 1 mobile storyboard and shot-by-shot wireframe to define: verified email/mobile sign-in → active profile owner → required profile name → responsive multi-select health word cloud (no four-topic limit) → optional topic details → one batch of multiple health files plus self-reported text → explicit processing consent → event-driven extraction/duplicate/date/topic/conflict checks → source-level user review → approved-only memory save → month/year timeline → separate optional Insurance setup.
- Critical distinction is now explicit: topic choice is a preference; typed text is self-reported; a document is evidence; AI output is a candidate. None silently becomes a diagnosis or confirmed memory.
- Product challenge recorded: require a profile name and verified account, but collect full date of birth, height/weight or other demographics only where a clear feature need is explained. The user can skip topic selection and still add records. Insurance remains a separate policy batch, and comparisons must distinguish “excluded,” “not found,” “unclear,” and “potential issue to clarify,” with source citations.
- At this storyboard checkpoint, the compiled app still opened at profile setup without login/TAC, and upload was separate from the topic chooser. This storyboard change did not count as implemented product capability.
- After this contract update, verification passed: npm run typecheck, npm run lint -- --no-cache, npm run test:repo (125/125), inline storyboard JavaScript syntax, and git diff --check. These checks do not verify the unbuilt login/batch flow or make M1 ready for user testing.
- Acceptance remains **0/11 stories, 0/8 production gates, 0/19 accepted packages (0%)**. M1 cannot be handed to the user until the complete synthetic in-app sequence works and is internally verified.
- **Next implementation slice at that checkpoint:** establish authentication and the active-person boundary, then connect batch intake through event-driven extraction, evidence review, approved persistence and the health timeline. Insurance comparison with health context remains a later, separately consented stage.


### Combined health intake: user description review — 25 September 2026

- Added an optional plain-language description to `/intake` alongside multiple selected medical files. The user may link it to one chosen health area; the note is clearly identified as user-authored and is not sent to the model or presented as a finding.
- The description is stored as a pending draft in browser demo state and native SQLite. `/review` presents it with the source-review queue and offers edit, add-to-record, or confirmed removal. Adding it creates a `Written by you` fact with explicit self-reported provenance; on native storage, adding the fact and removing the draft happen in one SQLite transaction. Until the user supplies an event date, the timeline uses the date the note was entered and says that explicitly. No AI extraction or interpretation is claimed for the note.
- Internal preview check at `/intake` confirmed the text field, topic choices, sample-file state and review action are present in the mobile accessibility tree. Browser snapshot tests cover draft restoration. This check did not exercise a full UI save/restart, native-device persistence, or the file-plus-note processing journey.
- Verification passed: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run test:repo` (**126/126 tests**), and `git diff --check`.
- Story 1 remains partial. No story or production gate is accepted: **0/11 stories, 0/8 gates, 0/19 overall**. Provider-backed login, server-side owner isolation, unified batch extraction, note interpretation (if explicitly consented), user-supplied event dates, a single final review/save point and full phone/reduced-motion acceptance remain open. No user-test milestone is ready.
- **Next:** connect all files in the same intake to a single consented run while preserving source-by-source statuses and review; then decide and implement how a user description may be interpreted with explicit consent, without converting it directly into a medical finding.


### One-consent staged-file processing — 25 September 2026

- `/review` now collects all staged files of the current purpose under one explicit consent sheet that lists each filename and explains the configured AI service receives them one at a time. User-authored notes remain separate and clearly identified.
- The batch coordinator emits per-file queued/reading/complete/failed/stopped states. One failed file does not discard successful extractions; stopping keeps completed sources linked, and unstarted files stay ready for retry. Selecting any linked file opens its own saved extraction instead of uploading it again.
- Native source-to-file links now await SQLite persistence before the UI marks an extraction complete. Mismatched source hashes still hide claims and clear the link; source-opening also ignores stale async results after the user changes files.
- Added coordinator tests for continuing after an individual failure, preserving completed results, stopping before unstarted files, and not starting a pre-cancelled run.
- Internally opened `/review?purpose=medical`, inspected the phone-sized file list and consent sheet, and canceled without sending a file. No live extraction was initiated. The app had one staged sample file, so a multi-file click-through was not performed; coordinator behavior is verified by unit tests.
- `npm run typecheck`, `npm run lint -- --no-cache`, `npm run test:repo` (**129/129**) and `git diff --check` pass. No full acceptance package passes from this slice; totals remain **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. No user-test milestone is ready.
- **Next:** make the app start at verified email/mobile sign-in and establish the active-person boundary through a swappable identity port. Use only an explicitly synthetic preview verifier until a real OTP provider is configured; this will not count as production identity or isolation. Then consolidate claims across the approved batch into one review surface/save and add cross-file duplicate/date/conflict checks.


### Login-first synthetic preview — 25 September 2026

- Added `/sign-in` before profile setup. It supports email or mobile layout, accepts only reserved fictional identifiers (`preview@nura.test` or `+1 555 555 0100`), displays a local six-digit preview code, and never sends email/SMS or accepts a real address/number. Preview sessions persist locally (web storage or device SecureStore) and contain only a fixed fictional profile marker. Profile now exposes sign-out; signing out leaves local preview records in place and points users to Privacy to clear them.
- Protected app routes now require the local preview session. The login UI, code step, successful transition to profile setup, and sign-out back to login were clicked through in the running phone-sized web preview using only the fictional sample workspace.
- Added adapter tests for reserved sample identity validation, wrong/expired/replayed/missing codes, and restoration markers. `npm run typecheck`, `npm run lint -- --no-cache`, `npm run test:repo` (**132/132**) and `git diff --check` pass.
- This is a demo sign-in interaction, not verified account authentication, account recovery, server-side authorization or person-level isolation. P1 is still not passed; no user story or production gate is accepted (**0/11 stories, 0/8 gates, 0/19 packages**). This is not a full user-test milestone, so no separate test handoff is being offered.
- **Next:** combine staged medical files and the user-authored description into one evidence review/save surface after the single consented batch run, preserving source/date/conflict status and requiring explicit user decisions before writing profile memory. Production OTP and server-authoritative profile authorization remain required before P1 can pass.


### Cross-file review cues — 25 September 2026

- `/review` now loads claims for every staged, source-linked file and includes a claim only after its original file hash matches. It compares exact normalized detail names, units, values and valid calendar dates across distinct sources.
- Same value and date is shown as a possible repeat; same field and date with different values is shown as a conflict; repeated values with uncertain dates remain a possible repeat. Incomplete dates are not assumed to mean January 1. Rejected, superseded and retracted suggestions are excluded. The view links each cue back to its source file.
- These deterministic cues do not merge records, select a value, change claim state, or write memory. Synonym matching, unit conversion, full batch decisions and final-save recovery are not implemented. A multi-file synthetic UI click-through remains unverified; current local preview contained only one linked sample source.
- Service tests cover same-date matches, conflicts, different-date sequences, rejected claims, incomplete dates and decimal-comma safety. Typecheck passed (4.31s), lint passed without warnings using `--no-cache` (8.74s), repository tests passed (**137/137** in 0.84s), and `git diff --check` passed. In this managed checkout, the default ESLint cache write is denied outside the active writable workspace; bypassing the cache resolves it. Story and gate totals remain **0/11, 0/8, 0/19 accepted**. No full user-test milestone is ready.
- **Next:** integrate all source claims and the user-authored note into one staged review queue with one explicit save action, item-level recovery, and no profile-memory writes before that action. Then verify the experience with a synthetic multi-file batch on a phone-sized screen.


### Unified review save and preview-file isolation — 25 September 2026

- `/review` now stages accepted, edited and dismissed claim choices together with selected self-reported notes. One explicit **Save reviewed items** action commits the staged operations in sequence; a failed item remains available to retry while successful items are removed from the queue.
- Found why the browser showed `Failed to fetch`: the local API’s default CORS list omitted the active `localhost:8094` preview origin. Added the current localhost, loopback and `nura.localhost` preview origins. The app now opens the saved source claims and evidence after the exact-duplicate event.
- Fixed a second intake defect: the seeded `demo://` “Example blood test.pdf” is a synthetic timeline placeholder, not an attached file. It was previously shown and queued as uploadable, which caused a fetch failure. Intake and review now exclude placeholder URIs; a focused helper test protects this boundary.
- Internally verified in the running preview using only the built-in fictional lipid-profile PDF: consent named the single real file; the duplicate check returned its source-linked suggestions; in an isolated preview, one claim stayed out of the registry until the single save action, then the UI confirmed it was saved. On the original preview, the placeholder no longer appeared in the review batch and the file reached nine source-linked suggestions. No non-synthetic document was sent.
- Verification passed: typecheck **4.85s**, lint without cache **9.24s**, repository suite **146/146** (**0.76s** reported test duration), and `git diff --check`. Current usage check shows **7%** weekly usage and `ordinaryUsageAllowed: true`; no Codex rate limit is active. High reasoning effort and this long thread can add response latency, but neither is a repository test/build bottleneck.
- This is still partial P4/M1 work. A synthetic multi-file UI run that compares distinct sources and stages a note alongside claims, a complete owner-scoped production account, self-report interpretation, native/reduced-motion checks and production gates remain open. Totals remain **0/11 accepted stories, 0/8 production gates, 0/19 packages (0%)**. No full user-test milestone is ready.
- **Next:** verify a synthetic two-file batch end to end (distinct source claims, duplicate/conflict cues, selected user note, one save and item-level retry), then continue the M1 sign-in/owner-isolation and native/reduced-motion acceptance gaps.


### Parallel build consolidation — 26 September 2026

- **Ask Nura:** added a visible Stop action that aborts the active request. Streamed answers and memory proposals remain provisional until `run_finished`; errors, cancellation, late events and finish-without-answer cannot leave a usable stale answer. The question is restored for retry. No live model run was performed.
- **Self-reported description:** added an explicit checkbox for one fictional sample note, a local-only text organizer, source-linked exact-quote suggestions, visible unresolved passages, and pending review actions. It does not call an AI provider, interpret general language reliably, or write profile memory automatically. The selected description remains on device; the local demo stores source metadata and bounded quotes. User/provider transfer approval is not assumed.
- **Health timeline:** source-file cards no longer repeat as separate events when accepted facts already represent the same source. Mixed-category facts from one canonical source and event date appear together while keeping each detail’s category, source, correction and Ask actions. Different event dates remain separate; unanalyzed files and standalone facts remain visible. Year headings and missing-date groups remain in place.
- **Insurance:** saved replacement links stay visible when one source has no current accepted terms and now offer source review or link removal. Fixed the missing shared-state export that otherwise made the remove action unavailable. The two-policy end-to-end journey remains unverified.
- **Explore and intake:** the retrieval date is labeled separately from publication date; cross-file duplicate/conflict cues now request date clarification when one report lacks an event date. Preview copy distinguishes a saved sample file from a file actually analyzed, and Home no longer offers a prominent reset control.
- **Health History visual check:** the open `/health` preview rendered the styled timeline card, filter chips, year headings, record cards and bottom navigation at phone scale. The screenshot that showed unstyled text is not reproduced in the current preview. This was a visual check of the route, not a full story journey or a native-device check.
- **Verification:** `npm run test:repo` passed **179/179**; `npm run typecheck` passed; `npm run lint -- --no-cache` passed; `git diff --check` passed. These are automated/repository checks plus one route-level browser inspection. No native simulator/device acceptance, full synthetic multi-file UI run, production-auth/isolation check or live AI self-report run was performed.
- **Status:** still **0/11 accepted stories, 0/8 accepted production gates, 0/19 accepted packages (0%)**. Implementation has advanced, but no story or gate is rounded up from partial code. The requested 50% checkpoint means **10 of the 19 packages must fully pass their acceptance contract**; it is not met yet. M1, M3, M4, M5 and M8 remain partial; the remaining stories and production gates are also open. No whole-user test milestone is ready to hand to the user.
- **Next:** complete an internal synthetic M1 pass from sign-in through profile setup, combined file/note review, user decisions, save and source-linked history; then close the remaining acceptance checks for the highest-value stories. Keep the note organizer labeled local-only until a provider-backed path is explicitly approved and verified.


### M1/M3 integration follow-up — 26 September 2026, 02:55 +08

- **Health History visual check:** inspected the live `/health` phone preview at 390 × 844. The current page has the branded warm-light surface, readable filter chips, year headings, aligned timeline nodes, source-linked cards and bottom tabs. The earlier unstyled screenshot does not match the current served bundle. The current preview lists seven captured events. No speculative CSS change was needed; this is a route-level visual inspection, not full M8 acceptance.
- **M1 synthetic service journey:** added a repository integration test that launches the local service in temporary storage and uses synthetic PDF fixtures plus a request-intercepting synthetic model adapter. One approval covers all staged files; the sequence verifies successful files around a retryable extraction failure, cancellation, an untouched post-cancel file, a local-only user note in the same final review/save queue, source-linked accept/edit/reject choices, item retry and preservation of original extraction evidence. No third-party request or user health data is used. The test passes as part of the full suite; it is service-level coverage, not an in-app M1 pass.
- **M3 compact policy overview:** expanded source-backed highlights to include policy identity/status/dates, life benefits and riders, medical limits/care, premium/payment details and policy values. The overview stays compact by default and offers an accessible, reduced-motion-aware show-all control. Exclusions, unclear wording and missing details remain distinct; synthetic catalog test passes.
- **Verification:** `npm run test:repo` passed **184/184** after registering the M1 journey and insurance catalog checks. Full `npm run typecheck` passed with exit 0 and no diagnostics; full `npm run lint -- --no-cache` passed with exit 0 and no diagnostics (about 3 minutes). `git diff --check` passed. No native-device, full visual-motion, multi-file app-UI, live-model or production identity/isolation acceptance was performed.
- **Status:** **0/11 user stories, 0/8 production gates, 0/19 accepted packages (0%)**. The 50% target requires 10 fully accepted packages and is not currently met. M1, M3 and M8 have additional verified slices but remain partial. No whole-user test milestone is ready.
- **Next:** finish an internal in-app M1 run through synthetic sign-in, required profile setup, multi-file intake, unified review/save and the resulting source-linked history; then run typecheck/lint on the consolidated code and continue on the highest-priority remaining criterion. Production authentication, identity isolation, account persistence, family sharing and privacy/release gates remain open.


### Build restart and verification follow-up — 26 September 2026, 08:01 +08

- **Preview recovery:** both the web preview on 8094 and local API on 4175 were unreachable before restart. Restarted the Expo web preview and local API; the preview now serves the Nura start screen with the profile entry point, and the in-app tab is kept open for continued work. The local API reports synthetic demo mode. The private `.env` was loaded by the local process; no key value was displayed, shared, or used for a provider request.
- **Current code evidence:** the recent focused slice suite passed **46/46**; the synthetic M1 service journey passed **1/1** with loopback access; the video sampler passed **3/3** in isolation; and `git diff --check` passed. The serialized full repository run remains **201/203**. Its two failures (M1 cancellation fixture and video sampler timeout) passed in isolated reruns, but the full-suite failures remain unresolved and must be rerun under a stable load before the suite is called green.
- **Consolidated typecheck:** retried, remained silent without diagnostics, and was interrupted when the task turn ended; there is no typecheck pass for this checkpoint. Full lint is also unverified on the consolidated diff.
- **Build workers restarted:** design/motion source audit, Explore/feed detail, and agentic-foundation/security slices have been reactivated in parallel. Their code and test results will be consolidated before acceptance status changes.
- **Milestone/status:** still **0/11 accepted stories, 0/8 passed production gates, 0/19 accepted packages (0%)**. The live preview is recovered, but no whole-user test milestone is verified. No user handoff route is ready.
- **Next work:** await and integrate the three bounded work slices, run the complete repository suite without competing build processes, then typecheck and lint the consolidated changes. The next potential user milestone remains M1 from synthetic sign-in through profile setup, batched health intake, review/save and source-linked history; it will be handed off only after the full in-app journey and phone/reduced-motion checks pass. Production auth/isolation, persistent cloud storage, multimodal processing, family sharing, privacy lifecycle, operations, and release governance remain open.


### Preview recovery and verification checkpoint — 26 September 2026, 09:44 +08

- **Preview recovery:** the in-app browser at `http://localhost:8094/` loaded Nura’s sample start screen. The local agent service returned `ok: true` from `/healthz` in `local_demo_synthetic_only` mode with Ask, document extraction, trusted search and persistent demo repository capabilities enabled. The earlier `/health` probe returned 404 because the service route is `/healthz`; the API was responding. No API key value was read or exposed, and no real health data or provider request was used for this check.
- **Changes consolidated:** Ask memory proposals now require a positive save request and either a value repeated in that request or an allowed cited personal-record source; accepted source references are promoted into answer citations, while topics, links, public sources and insurance terms cannot support a personal-memory proposal. Ask responses remain provisional through transport close. Insurance clarification removal now updates against current state after persistence rather than overwriting concurrent changes. Health-history parsing now treats `YYYY-MM-DD` as a calendar date in the device timezone, rejecting impossible dates so a Jan 1 event cannot display or group as Dec 31 in time zones west of UTC. The profile map adapts above four choices; source/date timeline grouping and in-scope feed consent/source actions remain covered by focused tests.
- **Verification since the prior checkpoint:** full repository suite with loopback access passed **210/210**; `npm run test:latest-slices` passed **48/48**; timeline-focused tests passed **13/13**; TypeScript typecheck passed; Expo lint passed with **0 errors and 1 existing exhaustive-deps warning** at `app/index.tsx:402`; `git diff --check` passed. The complete-suite run includes the prior three local-listener tests that had reported `EPERM` under restricted execution; with loopback permission and serialized test execution, they passed. These are code/test checks, not full application-story acceptance.
- **Current completion:** still **0/11 accepted stories, 0/8 passed production gates, 0/19 accepted packages (0%)**. The 08:30 +08 target of 50% accepted scope was missed. The implementation has advanced, but no complete story or production gate has passed all route, visual/motion, persistence, recovery and evidence requirements.
- **Current milestone:** Story 1 remains in progress. The browser preview and local service are running, but the end-to-end user sequence has not been verified in the app from synthetic sign-in through owner/profile setup, one batched intake, source review/save, and non-duplicated dated timeline; no user-test handoff is ready.
- **Next implementation slice:** audit and close the first-run route sequence and its route guards, then run that complete synthetic journey in the phone-sized app at 360, 390 and 430 px, including a refresh and reduced-motion pass. Keep production authentication/identity isolation, cloud sync, provider safeguards, family permissions, privacy lifecycle, hosted operations, and release governance open until their full gates pass.
- **Blockers and remaining scope:** production identity and cross-person isolation are not implemented; the current agent/repository service is local and single-profile. Cloud storage/sync, family permissions, full consent/export/deletion, multimodal/provider reliability, clinical/privacy/legal review, production monitoring and release readiness remain incomplete. No real-data user run is authorized by this synthetic-preview evidence.


### Route, file-activity, and Explore presentation pass — 26 September 2026, 09:50 +08

- **M1 route correction:** tightened first-run profile detection so country-only, birthday-only, name-only, and topic-only state cannot unlock protected app routes; new users need both a name and country. The focused profile and route-gate checks pass. This fixes one deep-link bypass, not identity verification or M1 acceptance.
- **Explore search activity:** the live event stream still drives activity state, but each row now names the chosen topic and the source count returned for that topic rather than repeating “Searching trusted health sources.” Row arrival and completion animate from real events; reduced motion uses the same information without movement.
- **Search brief presentation:** search requests now ask for a compact overview and two cited, source-supported points, without personal assessment or action recommendations. The default card shows a two-sentence at-a-glance preview with an explicit full-overview control; article details show a short version instead of repeating the entire brief. This does not expose model scratchpad or chain-of-thought.
- **M3 policy answer grounding:** the local validator now requires the model’s benefit/limit/exclusion/unclear category to match conservative wording checks and the cited accepted policy text to contain the exact quoted finding. Unsupported assessments and their model-only citations are removed. “No exclusions listed” remains unclear and cannot be restated as “no exclusions.” Prompt guidance and synthetic regression cases were added; this is a bounded validator fix, not acceptance of the two-policy workflow.
- **Document review and navigation:** file-review milestones enter as they arrive, honor reduced motion, and show an activity spinner only for a real `started` event. Web route changes now use a visible shared slide/fade; native stack transitions remain governed by the existing navigator.
- **Verification:** `npm run test:repo` passed **214/214**, including the new feed presentation tests; `npm run test:latest-slices` passed **53/53**; `npm run typecheck` passed; `npm run lint -- --no-cache` passed with **0 errors and 1 existing exhaustive-deps warning** at `app/index.tsx:402`; `git diff --check` passed. The `/services` route loaded in a separate local preview, but that workspace had no selected topics. No public search, uploaded health file, live model call, native device pass, or full in-app M4/M1 journey was performed.
- **Status:** **0/11 accepted stories, 0/8 passed production gates, 0/19 accepted packages (0%)**. M1, M4, M5, M3, and the other partial stories remain in progress. No user-test milestone is ready.
- **Next build list:** (1) internally run and close M1 from synthetic sign-in through required profile, multi-file intake plus note, review/edit/reject, one save, dated timeline, refresh, and reduced-motion checks; (2) make Ask proposals durable only after explicit approval and verify retry/source navigation; (3) finish policy-term grounding and the two-policy comparison journey; (4) run M4 with synthetic selected topics and verify event-driven activity, concise source-linked brief, save/hide, and recovery; (5) continue the remaining stories M2/M6/M7/M8/M9/M10/M11; (6) build and evidence production gates P1–P8. Family/caregiver isolation is not built; P7/P8 have not started.
- **User-test handoff:** none yet. The feed screen was visually inspected in the preview but had no selected topics; searching requires a fresh explicit consent and would contact the configured provider, so no such request was made.


### Continuous offline-build checkpoint — 26 September 2026, 10:27 +08

- **Profile setup (M1):** new profile routes now require both a display name and country; a country-only, date-only, name-only, or topic-only profile cannot deep-link past setup. Existing profiles with saved user-authored records remain accessible. Focused route/profile checks pass.
- **Policy evidence (M3):** coverage findings must match the policy term’s classification and quote its exact saved wording. Unsupported detail or a benefit/exclusion mismatch is removed; an incomplete exclusion section is not described as “no exclusions.” Four grounding regressions pass. This is a partial safety layer, not a clinical or complete policy evaluation.
- **Explore and motion (M4):** feed activity rows now identify the selected topic and real returned source count/status; completed/started rows animate only on service events and honor reduced motion. Search briefs show a short “At a glance” preview with an explicit expand action. Generated briefs are asked for a bounded overview. Review activity and web route transitions also gained event-based, reduced-motion-aware feedback.
- **Ask memory (M5):** approval waits for durable persistence; native fact and provenance commit atomically, browser persistence is awaited, and failures remain retryable. Proposal sources link to the exact supporting records or show that a reference is unavailable.
- **Verification:** repository suite **220/220 passed** (including synthetic local-loopback integration tests); latest-slice suite **53/53 passed**; `npm run typecheck` passed; full lint passed with **0 errors and one existing warning** at `app/index.tsx:402`; `git diff --check` passed. The default sandbox first denied loopback integration-test binds; the same full synthetic suite passed when local loopback access was allowed. No provider or public web request was made.
- **UI review:** the open browser remained at the Nura start screen. I did not alter the user’s browser data or claim a completed in-app journey. No whole-user milestone is ready for user testing.
- **Acceptance:** still **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. M1, M3, M4 and M5 have additional verified slices but remain partial. Provider-backed identity/owner isolation and each story’s complete normal app journey remain open; all P1–P8 gates remain open.
- **Next slice:** internally run M1 as one synthetic in-app journey from sign-in through required profile setup, a multi-file plus note intake, explicit consent, review decisions, save, and source-linked month/year history. Then continue the highest-priority unfinished acceptance check. A route or service test alone does not make M1 ready for user review.
- **Connectivity:** continue local work and verification offline. Push, remote provider checks and deployment checks are deferred until connectivity returns; no work is paused.

- **Git checkpoint:** committed and pushed to `origin/main` as `fd4e038`; subsequent local work should continue from that commit.


### M1 first-run probe — 26 September 2026, 10:32 +08

- A temporary `127.0.0.1:8094` preview opened the profile step with a restored sample session and prefilled `Jordan Sample` / `Malaysia`; the form therefore showed its existing-profile name wording. This is not evidence of a fresh sign-in or clean first-run journey. The source of that restored browser state was not established.
- No profile values were edited, no file was uploaded, and no reset or deletion was performed. The temporary tab was closed. The user's original preview remains unchanged.
- **M1 acceptance remains blocked on a clean synthetic test session:** establish a separate synthetic identity/storage context without clearing or overwriting the existing browser workspace, then run the complete path. Do not infer first-run behavior from the restored profile.


### Connectivity restored · synthetic first-report path and resume slice — 26 September 2026, 13:26 +08

- **Isolated in-app M1 probe:** used the separate Expo preview on port 8095, not the existing user preview on 8094. With synthetic Riley Sample data, the local sign-in rehearsal opened profile setup; five top-level health areas and two nested details remained distinct. A built-in fictional lipid-report PDF and a self-reported glucose note were staged together, processing was explicitly approved for the one file, and the configured local demo service returned eight source-linked claims. The displayed values/ranges were checked against page 1 of the fictional PDF. All eight candidate claims and the note were explicitly saved. The resulting `/health` history showed the note and a single dated report event (21 Jan 2025) containing the eight values; the PDF was not duplicated as a separate Everything event. A browser refresh retained this synthetic history.
- **Map clarity fix:** the profile overlay previously described selected topics as “areas with saved information” even where a category showed zero saved records. It now reports separate counts for current timeline items, top-level chosen areas, and nested selected details. The live overlay reads `12 current timeline items · 5 chosen health areas · 2 selected details`; the updated label was confirmed in the app.
- **Ask and policy slices:** long Ask answers now open to a complete-sentence excerpt capped at 360 characters with an accessible expand/collapse control; full answer and citation state are retained. Conditional exclusion wording is categorized for clarification rather than described as universally not covered. The Ask presentation test is now part of both standard test scripts.
- **Preview integration:** the development CORS defaults include the separate 8095 preview origins; explicit origin overrides remain exact. This enables isolated local testing and is not a production origin change.
- **Verification:** `npm run test:repo` **227/227 passed** (loopback-only synthetic integration listeners allowed); `npm run test:latest-slices` **59/59 passed**; `npm run typecheck` passed; `npm run lint -- --no-cache` had **0 errors and one existing warning** at `app/index.tsx:402`; `git diff --check` passed. The restricted test run initially denied local listener creation; the same full suite passed with loopback permission. No real personal data or provider request was used in this resumed verification.
- **Acceptance:** still **0/11 accepted user stories, 0/8 passed production gates, 0/19 accepted packages (0%)**. M1 has an internally verified single-report-plus-note browser path, not its full journey. A multi-file UI batch, edit/reject/unresolved review, owner isolation, verified production OTP/recovery, full cold-reentry and reduced-motion/native checks remain open. The sample account is an explicitly synthetic local code rehearsal. No user-test handoff is ready.
- **Visual check limit:** the 720 profile overlay and new summary were inspected in the live app shell. The in-app browser remained at 1280×720; its viewport override did not apply, so exact 390×844 device acceptance is still open.
- **Next slice:** continue M1 by proving a multi-file UI batch with an edit, rejection, unresolved item and one save, then verify exact source/date grouping and re-entry without reprocessing. Continue the independent Ask and insurance UI checks after this highest-priority M1 gap. Production identity, account/person authorization and all P1–P8 readiness work remain uncompleted.


### Web/native motion driver recovery — 26 September 2026

- Expo's web preview had been logging that the native animation module was unavailable while app transitions requested `useNativeDriver: true`. Added one shared platform policy: iOS and Android keep the native driver; web uses the JavaScript driver. Applied it to all 14 affected route/component files without changing motion timings or reduced-motion decisions. The app root enables React Native's documented experimental LayoutAnimation support on Android.
- Cleared the isolated Metro cache and reloaded the existing synthetic preview. `/health` rendered the saved Riley Sample timeline; navigating to `/care` rendered the care screen successfully. The rebuilt web log contained no missing `RCTAnimation` warning. The existing agent service returned healthy on `127.0.0.1:4176/healthz`. No model/search request was made.
- **Verification:** `npm run test:repo` **230/230 passed**; `npm run test:latest-slices` **62/62 passed**; `npm run typecheck` passed; `npm run lint` had **0 errors and one existing exhaustive-dependencies warning** at `app/index.tsx:403`; `git diff --check` passed. Platform-policy tests cover iOS, Android, web, and unknown-platform fallback. Browser route verification is not native-device or exact-size acceptance.
- **Acceptance:** **0/11 stories, 0/8 production gates, 0/19 accepted packages (0%)**. Motion has a verified web compatibility fix, but full motion coverage, reduced-motion visual review, and iOS/Android device checks remain open. M1 is still the highest-priority incomplete user journey; the current single-report-plus-note path does not pass M1.
- **Next:** continue M1's clean synthetic multi-file UI review path, including item-level edit/reject/unresolved choices and retry. Keep the 8095 synthetic session isolated from the user's 8094 preview.

### Reconnect resumed · Ask consent, note safety, and first-run evidence — 26 September 2026, 15:50 +08

- Ask consent: added individual saved-fact selection beneath the broader health-facts consent row. In the live synthetic preview, 9 facts were shown; unchecking one changed the visible count to 8/9. The pending question was canceled before Continue, so that check sent nothing. A separate earlier synthetic Ask run was explicitly confirmed in-app and returned eight report-value citations; selecting a citation opened its exact source-linked history item.
- First-run M1 probe: a separate 127.0.0.1:8095 demo session completed the local email-code rehearsal, required display-name/country setup, five tracking areas and one nested glucose detail. The bundled lipid PDF was recognized as the already-saved sample source and opened without reprocessing. A fictional glucose note was organized on the local preview only after its per-note confirmation. The date “15 January 2025” was incorrectly suggested as “glucose 15”; it was dismissed before save and the organizer now masks natural-language dates and preserves decimal results. The unresolved target-range sentence remained separate.
- The note was explicitly included in the staged save. /health then showed it as its own dated timeline event beside the source-backed report event; a page reload retained both. This was a browser re-entry check only, not a cold native restart or proof of account isolation.
- Multi-file verification: the repository's M1 intake integration test passes for one approval, source-linked processing, staged decisions, retry and cancellation. The live IAB could not surface the native file picker while the Mac session was locked; no multi-file browser upload was made, so that acceptance criterion remains open.
- Code changed: app/ask.tsx, app/intake.tsx, src/services/askHealthFactSelection.*, and server/agent/localSelfReport.*; standard test commands now include four fact-selection regressions.
- Verification: npm run test:repo 236/236 passed; npm run test:latest-slices 66/66 passed; npm run typecheck passed; npm run lint reported 0 errors and one pre-existing exhaustive-dependencies warning at app/index.tsx:403; git diff --check passed. The local web preview returned HTTP 200 and the local demo agent health route returned ok: true.
- Published checkpoint: fa36a6b (Add precise Ask consent and safe note parsing) was pushed to origin/main.
- Status: 0/11 accepted stories, 0/8 passed production gates, 0/19 accepted packages (0%). No user-test handoff is ready. M1 remains partial: multi-file UI selection, all edit/reject/unresolved paths on a fresh file batch, native/reduced-motion/device checks, verified OTP/recovery and person-level isolation remain open.
- Next slice: recover a usable native file chooser or establish a supported file-input test path, then run one true multi-file first-profile batch through review and save. Keep other acceptance work moving if that UI limitation persists.


### Numeric-date self-report safety follow-up — 26 September 2026, 16:03 +08

- The regression test reproduced `01/15/2025` being parsed as a glucose value. The local-only organizer now masks numeric dates using slash, hyphen, and dot separators before it extracts measurement candidates.
- Verified: self-report focused tests **10/10**, repository tests **237/237**, latest-slice tests **66/66**, typecheck passed, lint **0 errors / 1 pre-existing warning at `app/index.tsx:403`**. This deterministic local preview organizer did not invoke an AI provider.
- Full-app acceptance remains **0/11 stories, 0/8 gates, 0/19 packages**. M1 is still the highest-priority open journey; the native file picker was unavailable from the locked desktop session, so an in-app multi-file run has not passed.
- **Next:** use a supported test environment/file-input path for a multi-file first-run batch and verify one consent, per-file activity, review edits/rejections/unclear items, save, source/date grouping, and re-entry. User test: **none ready**.


### Current progress and multi-file date clarification — 26 September 2026, 18:43 +08

| Build slice | Current verified state | Remaining exit checks |
|---|---|---|
| G0 · Design and motion | All eleven shot-by-shot storyboard flows and the visual/motion contract exist. Several compiled routes have focused visual and interaction work. | Finish compiled-app comparison against the storyboard, phone-size and reduced-motion review, and native-device verification. |
| M1 · Profile and first health history | Fresh browser workspaces now start without sample identity, topics, files, facts, treatment or visit data. Local synthetic sign-in and required profile setup are present. A two-file synthetic lab batch was processed in the app after one explicit consent; source-linked candidate values and real per-file activity appeared. | Complete item-level edit/accept/reject/unclear/date decisions, save once, confirm dated source-linked history and re-entry, test error/retry/cancel and native/reduced-motion paths, then verify production identity and owner isolation. |
| M2/M8 · Registry and timeline | Partial registry, source navigation, correction history, deduped source-event grouping and timeline filtering are implemented. | Verify full intake-to-wiki behavior, date/provenance corrections, relationship history, native persistence, visual states and the complete user journey. |
| M3–M7/M9/M11 · Insurance, Explore, Ask, treatment, care, symptoms, privacy | Each has partial local/demo capabilities; several have focused service and browser evidence. | Complete end-to-end journeys, evidence/version handling, safety/evaluation, persistence, and user-facing error, recovery and consent cases. |
| M10 · Family/caregiver access | Not built. | Separate people, scoped grants, revocation, audit and cross-profile isolation. |
| P1–P8 · Production readiness | P1 is only a synthetic sign-in rehearsal; P2–P6 have partial foundations; P7 and P8 are not started. None has passed production acceptance. | Production identity/isolation, consent ledger, secure cloud storage/sync, multimodal pipeline controls, agent safety/evaluation, provider reliability, operations/security, accessibility, governance and release evidence. |

- **Strict acceptance score:** **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. This does not mean the repository has no implementation: 10 stories have partial code and evidence, one story (M10) is not built, six production gates have partial foundations, and two are not started. Partial work does not count as an accepted package.
- **Fresh-start correction:** the new workspace now shows zero health areas/details/saved items before user selection. The original 8094 preview was not changed.
- **Real synthetic batch finding:** January and February fictional reports each exposed a report date and two candidate values. Cross-file comparison previously hid that report-date context because it only reads claim-level result dates. It now shows the source report dates while keeping “result date not stated” explicit; a report date is not silently promoted to a test date. The existing PL0005 sample source was unavailable to this batch comparison, so that comparison remains incomplete. No candidate from this batch was saved.
- **Code changed locally:** `app/review.tsx`, `src/services/intakeBatchAnalysis.mjs`, its declaration and tests, plus fresh-workspace bootstrap and review-button accessibility changes in `src/state/`.
- **Verification:** focused batch-analysis tests **7/7**, repository suite **239/239**, latest-slice suite **67/67**, typecheck passed, lint **0 errors / 1 existing warning at `app/index.tsx:403`**. The repository suite needed loopback permission for its synthetic HTTP integration tests; the initial sandbox attempt had three `EPERM` listener failures, and the permitted loopback rerun passed. No provider was called by the test suites. The synthetic document processing used the app's visible consent and fictional files only.
- **Current work:** M1 batch review still needs explicit date decision and complete save-to-history verification. The batch now explains which dates came from source metadata; it does not guess that they are the measurement dates. User test: **none ready**.
- **Next slice:** make the result-date decision explicit in review, then verify both sources through one save and source-linked month/year history without auto-merging. Afterwards continue M1 re-entry/recovery and the M2/M8 registry-timeline criteria. No production gate is complete.
- **Checkpoint state:** commit `50ea70d` (`Clarify report dates in batch review`) contains the code, regression coverage and evidence above and is pushed to `origin/main`. The worktree is clean. This checkpoint does not change any story or gate acceptance count.


### Health event date and review correction integrity — 26 September 2026, 19:33 +08

- Medical review now keeps the event/result date separate from the time the profile stored the claim. An omitted result date stays undated in the timeline; it is not replaced with the save time. A report-level date is shown as context but is not copied onto a specific result.
- Medical candidates can be edited with an optional, strictly validated `YYYY-MM-DD` result date. The accepted-claim correction path now preserves that date in both the source assertion and its linked profile timeline version. Clearing it explicitly leaves the event undated.
- Profile assertion validity starts at the save/correction time independently of the medical event date. Reconciliation updates the displayed event date without rewriting the profile assertion’s validity start. The local demo repository applies the same strict validation to accepted-claim corrections.
- Verification passed: focused date/repository tests **12/12**, repository suite **242/242** (including local-loopback synthetic integration journeys), latest slices **67/67**, typecheck, lint **0 errors / 1 existing warning at `app/index.tsx:403`**, and `git diff --check`.
- **In-app check:** on the separate synthetic preview at `/review`, opened the January sample report, used Edit with the result date left blank, staged and saved one claim, then opened `/health`. Its history row appeared under **Undated** as **Date not stated**, with the January report date retained on the source and not assigned to the result. No provider call or personal data was used.
- **Status:** the unknown-date edit/save/history branch is verified in the browser preview. A user-entered result-date branch, the complete multi-file-plus-note journey, native/reduced-motion review, and identity/isolation checks remain open. M1 remains partial; strict counts stay **0/11 stories, 0/8 production gates, 0/19 accepted packages (0%)**. **No user-test milestone is ready.**
- **Next slice:** run the app’s synthetic two-file-plus-note batch through one consent, event-driven processing, date/accept/edit/reject/unknown review, one save, source-linked month/year history and re-entry. Continue M2/M8 only after this first-history path is internally verified. D0’s profile-overview redesign remains pending user approval.


### Insurance evidence routing, profile copy and plan visibility — 26 September 2026, 19:57 +08

- M3 policy comparisons now show an exact-quote action only when a linked claim quote exists, otherwise open the saved policy source when available, or state plainly that no source link is available. Source fallback and the policy card's source action both stay within insurance assets; regressions cover colliding cross-registry IDs and blank identifiers.
- The profile setup audit confirmed that genuinely new profiles require a display name and country. Existing profiles can continue without re-entering them to preserve access to saved records; that conditional rule had been shown as the confusing “OPTIONAL FOR EXISTING PROFILES” field label. The field now uses a neutral label and contextual explanatory copy. A fresh workspace's source default remains blank; the Riley name seen in the browser is consistent with a saved snapshot for that browser origin, but the exact origin storage was not inspected or reset.
- The build board now starts with a visible 19-package status table, a single current target, and the approval rule for user-facing design direction. This improves observability only; it does not change acceptance counts.
- Verification: repository/integration tests **244/244**, latest slices **67/67**, typecheck passed, lint **0 errors / 1 existing warning at `app/index.tsx:403`**, and `git diff --check` passed. Synthetic tests only; no provider call or real health data.
- **Status:** still **0/11 accepted stories, 0/8 passed production gates, 0/19 accepted packages (0%)**. Ten stories have partial code/evidence, M10 is not built, P1 remains a local rehearsal, P2–P6 have partial foundations, and P7–P8 have not started. No whole-user test is ready.
- **Next:** complete the M1 multi-file-plus-note review/save/history/re-entry path and the associated mobile/reduced-motion checks. The evidence-first overview direction is approved and partially implemented; its remaining viewport and accessibility checks are tracked above.


### Approved evidence-first overview and M1 continuation — 26 September 2026, 23:43 +08

- **Approval carried through:** the user approved replacing the onboarding orbit with an evidence-first profile overview. The three bounded tracks were integrated: the design/motion contract now specifies the overview and interaction states; a dedicated profile overview service groups source-backed evidence separately from tracking preferences; synthetic journey/accessibility QA added regression checks for honest source states and accessible review controls. Shared screen/navigation integration stayed with the integration owner.
- **Overview changes:** the setup screen now distinguishes selected tracking interests from saved health evidence. Evidence is grouped under its originating source; source IDs are deduplicated, files with opaque storage hashes receive readable type labels, and a saved source with no reviewed details is not described as “linked.” The profile tab now counts unique source groups and uses copy that does not imply unreviewed file contents were analyzed.
- **Local preview evidence:** at 390 pt, the overview rendered legibly. In a separate clean local preview, synthetic sign-in rehearsal, required display name/country, an empty overview, six selected areas, one nested detail, and one bundled sample-report add were observed. The fixed preview code is not production OTP. A normal chooser attempt was not controllable through this desktop session; a local reference image then appeared in that test origin. It was not opened, processed, sent or saved, and that origin was not reset. No multi-file review/save/history journey passed.
- **Verification:** `npm run typecheck` passed; `npm run lint -- --no-cache` exited 0; `npm run test:latest-slices` passed **77/77**; `npm run test:review-accessibility` passed **2/2**; `npm run test:repo` passed **254/254** after allowing the local synthetic integration listeners; and `git diff --check` passed. Tests used synthetic data and no external AI provider.
- **Current milestone:** D0 is implemented but still needs 360/430 pt, reduced-motion, keyboard/tap-target and accessibility checks. M1 remains incomplete: repeatable multi-file selection, consent-backed activity, clear/edit/reject/unclear/date review, a single save, source-linked history, re-entry and native/owner-isolation checks remain open.
- **Progress:** still **0/11 accepted user stories, 0/8 production gates and 0/19 packages (0%)**. Partial code and passed slices do not count as accepted packages. **No whole-user test milestone is ready.**
- **Next implementation slice:** establish an isolated, repeatable multi-file input path that does not touch existing browser storage; then verify one full M1 batch through review, one save and history re-entry. Separately finish the D0 360/430 and reduced-motion checks. The user can review only after that whole journey passes internally.
- **Blocker:** desktop file-picker automation is unavailable in the current session, blocking the multi-file app journey and therefore M1. Use a supported browser file-input test path or native-capable test environment. No blocker changes production-gate acceptance; P1 identity/isolation is independently still open.
