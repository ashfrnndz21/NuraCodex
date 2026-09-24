# Nura build board

**Build objective:** the complete Nura mobile app: all eleven user stories, the agreed visual language and motion, persistent source-linked health state, multimodal record intake, consent-scoped agentic intelligence, and production security/privacy/release readiness. Synthetic-data demo readiness is an intermediate milestone; production identity, isolated family access, secure persistence, lifecycle controls, operations, and governance are part of the 100% goal. Never present an unconnected service or simulated trace as live.

**Updated:** 24 September 2026  
**Integration owner:** the primary Codex build owner. The design and intelligence tracks may work in parallel, but only the integration owner marks a story connected after its screen, state, service, event, motion and acceptance check agree.

## Shared design review

- [NURA_STORYBOARD_PREVIEW.html](NURA_STORYBOARD_PREVIEW.html) is the clickable phone storyboard for all eleven stories, with screen concepts and interaction descriptions.
- [NURA_WIREFRAME_STORYBOARD.html](NURA_WIREFRAME_STORYBOARD.html) is the shot-by-shot visual flow: each phone screen is shown in sequence with next-action arrows and meaningful branch points.
- [NURA_MOBILE_STORYBOARDS.md](NURA_MOBILE_STORYBOARDS.md) is the detailed layout, motion and accessibility specification.
- [USER_STORY_ACCEPTANCE.md](USER_STORY_ACCEPTANCE.md) is the detailed per-story acceptance contract.
- [NURA_COMPLETE_BUILD_SCOPE.md](NURA_COMPLETE_BUILD_SCOPE.md) defines what 100% completion means, the eleven app-based test milestones, reporting format, and current audited baseline.
- [NURA_AGENTIC_FOUNDATION.md](NURA_AGENTIC_FOUNDATION.md) defines the memory, context, orchestration and event contracts.

**Important runtime distinction:** the storyboard HTML files are design/review artifacts, not a compiled end-to-end application. The Expo app starts at profile setup; the header has **Open the app**, and the page offers first profile synthesis and record intake. The compiled bottom navigation is Home, History, Care, Explore and Profile; People & sharing is reachable from Profile, but family permissions are not implemented. Ask, intake/review, Insurance, Treatment and Visit are dedicated routes, but multiple stories remain partial or absent. Opening a route does not mean every storyboard shot has been implemented.

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
| Design | Clickable storyboard for all eleven stories; health-history screen uses the selected light/cobalt direction; onboarding uses the Blueprint v2 atmospheric scene, shared animated orb, color-coded focus bubbles and live profile map; first profile synthesis has a reviewable source-cited result state; Home, History, Medical Registry, Explore, Insurance, Treatment, Visit and Data & Privacy have dedicated mobile routes. History source details open linked claims and pending-claim review. The Medical Registry now has topic pages, explicit record linking, source/timeline navigation and a topic-scoped Ask action. Visit selection, outcome capture and follow-up action state changes use an animated local review flow. | The storyboard does not equal compiled app coverage. Finish the shot-by-shot onboarding and remaining story screens, whole-app motion/visual pass, video detail/publication metadata and family journey. |
| Memory/state | Native profile, topic, fact, file metadata, typed user relationship, treatment and visit records with dated change history in local SQLite/SQLCipher; visit briefs retain selected source IDs. Topic-to-record connections require an explicit user relation. Accepted extraction claims now append assertion corrections with version, supersedes ID, validity close and user-entered origin; timeline corrections retain their source ID and source-claim ID. | Relationship evidence/valid-time provenance, cross-device canonical registry, durable cloud identity and isolated family profiles remain. Browser demo state is synthetic and in-memory; native correction persistence still needs device verification. |
| Agent | Live Ask run with per-run consent, selected context retrieval, actual tool events, citations, unknowns and user-approved memory proposals; profile synthesis and insurance use the same run path. Ask can now search treatment and visit/follow-up records only after separate default-off per-run choices; symptom support drops both record types at the server boundary. Retrieval no longer appends all local repository assertions to each request. Coverage assessments distinguish explicit terms from missing/unclear wording and validate references against selected sources. Synthetic profile and insurance runs passed. | Production identity/consent enforcement, durable consent history, canonical multi-registry retrieval, deeper policy analysis, clinical symptom evaluation, broader evaluations and operational controls. |
| Intake | PDF/image transfer, exact-byte duplicate detection, extraction into review candidates, source page/quote and accept/edit/reject flow are connected in code. A local-only MP4/MOV/WEBM frame sampler is implemented for clips up to 3 minutes, with at most six timestamped stills; it does not call a provider or app review screen. Synthetic PDF extraction, review/acceptance, duplicate detection and later Ask retrieval passed live checks. | Connect timestamped stills to extraction and candidate review after explicit authorization for this provider transfer; analyze audio; run the mobile journey; add batch intake and perceptual duplicate suggestions. |
| Stories 3–11 | Story 3 has partial registry/extraction/review and source-validated coverage comparison; Story 4 feed is partial with an expandable source-detail state that shows returned publisher text, any matching Nura search brief and a source link; Story 5 Ask has a connected demo slice; Story 6 has a local treatment registry with current/past status, dated change history, explicit per-run consent and source-backed Ask retrieval; Story 7 has manual visits, user-selected brief preview, outcome capture, dated user-entered follow-up actions and per-run Ask retrieval; Story 8 timeline includes treatment and visit entries plus user-authored relationships; Story 9 has bounded symptom support; Story 11 now has an expandable data inventory and confirmed local deletion controls. | Complete policy versioning/navigation, feed publication-date extraction and video detail, visit export/share and reminders, evidence-backed relationship provenance and extracted-claim correction history, clinical symptom evaluation, family permissions, consent history, export and account/cloud controls. |

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
- Video analysis remains blocked at the provider-transfer consent gate. A proposed code path would send sampled health-video frames to OpenAI; automatic approval review rejected it because the user has not specifically authorized that payload and destination. No bypass was attempted, and no video was sent.

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
