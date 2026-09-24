# Nura first-pass design and AI integration contract

## Objective

Design and connect one mobile-first Nura application across all eleven user stories. The first pass is a complete screen and interaction system plus the AI/data contracts that will drive it. A screen is not considered functional because it is clickable: its action must update shared state, call the right service where required, produce truthful feedback, and preserve source and review status.

## Source reconciliation

- The supplied product-design brief establishes the experience and motion language: editorial hierarchy, progressive disclosure, contextual actions, tactile touch, in-place expansion, a restrained Nura orb, and purposeful animation.
- The selected health-history image establishes the record-reading treatment: light mobile canvas, dated chronology, legible cards, blue record nodes/rail, concise evidence and source details, and a direct Ask entry point.
- Combine these contextually. Use atmospheric indigo, violet, peach and the Nura orb for Home, onboarding and AI moments. Keep dense evidence and timeline reading on warm-white or pale-neutral surfaces. Use coordinated category and review colors; purple is not the sole data color.
- The existing EXPERIENCE_DESIGN_SPEC.md still prescribes a full-screen plum/violet treatment. This contract supersedes that palette rule. Its interaction and motion principles remain useful.
- Never copy fictional names, measurements, diagnoses, medicines, providers, policies, or recommendations from design references into a real or demo health profile.

## Shared app shell

The product remains one Expo mobile app for iOS and Android. Web is the same app's preview target, not a separate dashboard. A quiet bottom bar exposes Home, Health/History, Explore, Care, and Profile. Ask is available contextually from the current screen and can expand in place. Keep person/profile identity visible whenever switching among personal or caregiver contexts.

Every component must have a state contract. Buttons/cards: idle, pressed, disabled, busy, complete, failed. Records: new, same/duplicate, conflict, replaces, owner-unknown, needs-review, accepted, rejected. Media: selected, checking-duplicate, queued, processing, review, accepted, failed, cancelled. Ask: idle, scope-review, retrieving, checking-evidence, clarifying, responding, complete, failed, cancelled.

## Story wireframe inventory and interaction design

Each screen is composed as a phone layout with safe areas, scroll, keyboard, bottom navigation and a bottom action area. Detail content should expand from the originating object or open in a connected sheet where possible.

### 1. Living 720 profile

Screens: Welcome; who this profile is for; identity details; health-focus cloud; conditional follow-up cloud; live 720 map; editable first synthesis.

Wireframe: compact Nura mark/orb and privacy cue; editorial question; one focused input group; six-domain profile map visible from the first step; floating topic bubbles; selection count and skip/continue action. The map distinguishes a selected topic, user-entered fact, source-added item and reviewed fact by label/shape as well as color.

Motion: input focus brings its linked domain into focus; selecting a bubble gives tactile press feedback, fills the bubble, reveals related unanswered choices with a restrained stagger and updates the map from the actual selection event. Deselecting retracts dependent unanswered choices but never silently deletes a confirmed fact. Synthesis unfolds as a source/status-aware summary with edit, add, correct and recontextualize actions.

### 2. Medical Registry

Screens: registry overview; topic/wiki page; source detail; evidence review queue; fact correction/history.

Wireframe: one concise sourced summary; recent records and changes; topic chips; expandable evidence rows; source page/region and date; explicit linked topics. Direct and cross-record questions open contextual Ask.

Motion: topic cards expand in place; a source row grows into its evidence detail; a correction creates a new version and moves the prior version into history. Summaries always expose the underlying evidence; generated wiki text is not the canonical fact store.

### 3. Insurance Registry

Screens: policy intake; extracted-policy review; policy passport; coverage comparison; questions for insurer.

Wireframe: policy identity and validity dates; benefits, limits, exclusions and providers as reviewable source-linked claims; compare against selected confirmed health context; show supported coverage, unknown terms and evidence gaps separately.

Motion: extracted clauses appear as review candidates only after real extraction; accepting a clause updates the policy passport and comparison. Conflict/replacement preserves the earlier policy and its validity period. A comparison reveals the relevant policy passage and health evidence side by side.

### 4. Personalized health feed

Screens: personal briefing/feed; article or video detail; why-this-is-relevant; personalization controls.

Wireframe: editorial lead item, then a short ranked list. Every item shows publisher, source, publication date and a plain reason for relevance. Save, dismiss, open source and reduce this topic are available.

Motion: cards settle in with a restrained stagger; no autoplay; opening a card preserves the reason and source; saving/dismissing updates the feed state. Search activity and results must come from the configured search provider, not invented sample results.

### 5. Agentic Ask

Screens: contextual composer; per-run scope/consent sheet; real activity and evidence; answer; clarification; source detail; approve/reject memory proposal.

Wireframe: compact composer attached to the current context; explicit scope preview; chronological user-readable activity; concise answer, citations, unknowns and next-step chips. Keep the originating record visible as context where useful.

Motion: composer expands in place; each milestone appears on the real backend event; evidence/source chips open their source; answer content reveals as it arrives; retry preserves the question. Do not expose hidden chain-of-thought or animate progress from a timer.

### 6. Medicines and treatment

Screens: current/past/review list; medicine detail; add/correct flow; treatment history.

Wireframe: name, recorded dose/schedule, stated purpose, prescriber, pharmacy, date range, source and review state. User-entered details are distinguished from extracted details. Stopping a medicine closes its validity period without erasing history.

Motion: list item expands into the same treatment detail; edit/review creates a version; status changes update the history and contextual Ask together.

### 7. Visits and care

Screens: upcoming visit; brief builder; share preview; post-visit outcome capture; follow-up list.

Wireframe: date and care team; selectable confirmed evidence; prepared questions; user-controlled share preview; notes/instructions/follow-ups attributed to the user's entry or a reviewed source.

Motion: selected evidence collects into the brief; preview expands from the visit card; outcomes appear only after user entry or document review; reminder completion requires a user action.

### 8. Timeline and connections

Screens: History chronology; filter state; selected record detail; Connections mode; relationship detail.

Wireframe: year/month headings; left date rail; cobalt record node and icon; white record card with label, date, one-line summary, source and typed relationship chips; sticky contextual Ask. Filters cover Everything, Documents, Care, Treatment and Vitals. Connections is a distinct mode, not a desktop graph squeezed onto a phone.

Motion: filter selection preserves scroll/date context and updates the result count; selecting a node adds a halo and expands that card in place; opening a link draws only the selected persisted path and reveals its type/source/time. Keep unrelated links subdued. A line means recorded association, never inferred causation.

### 9. Symptom support

Screens: symptom entry; clarification; urgent route; bounded next-step response; optional add-to-history review.

Wireframe: simple free-text/voice entry; focused clarification; urgent action prioritized at top when applicable; state what context was used, what is uncertain, and what the user can do next. No diagnosis or medication change instructions.

Motion: urgent routing immediately suppresses decorative movement and puts the action first. Non-urgent response activity tracks actual triage/retrieval events. Saving a symptom requires review.

### 10. Family and caregivers

Screens: person switcher; authority/invitation; consent scope; shared profile; sharing review; revoke access.

Wireframe: persistent “Viewing [person]” identity; separately scoped health history and conversation; clear permissions for records and actions; who shared what; revoke confirmation.

Motion: switching profiles visibly changes identity and data set before rendering the next profile. Revocation immediately updates access state. The demo may use local test profiles; production access requires authenticated identities and server-enforced grants.

### 11. Privacy and control

Screens: what Nura knows; source/use detail; consent controls; correct/remove; export; delete account.

Wireframe: profile facts and files grouped by source/status; active shares and consent; clear export/deletion outcomes; explain retention truthfully.

Motion: withdrawal stops future access; remove/export/delete actions show confirmation, progress and verified completion. Deletion must map through source files, derived wiki snapshots and indexed summaries, not just hide a card.

## Motion system

Start from the supplied motion vocabulary and tune on-device: fast feedback about 140 ms; standard transitions about 320 ms; important card/sheet entry around 400–600 ms; press scale around 0.985 for 80–120 ms; stagger dense items around 40–100 ms. Use controlled easing/spring, not large bounce. Centralize named tokens.

Orb state timing: idle 7 s, listening 3.4 s, thinking 2.2 s, responding 4.2 s, with state transitions sourced from real input/run events. Stop continuous motion when offscreen. Reduced motion removes drift, breathing and travel while retaining state through color, outline, icon, content order and short opacity changes. Every animation communicates state, feedback, hierarchy or orientation.

## AI/data foundation in parallel

### Canonical state

The canonical store is user/profile-scoped, source-linked assertions and typed relationships. Assertions preserve raw and normalized values/units, origin, evidence/review state, source ID and exact page/region/timecode, observed and valid time, confidence, correction/supersession chain and permission scope. Unknown is not a negative result. Every accepted correction appends a revision and audit event.

Separate durable confirmed profile facts from candidate extracted claims, explicit preferences, conversation transcript, and generated wiki summaries. The wiki is a navigable derived layer indexed by evidence IDs and evidence-set hash; source changes mark affected pages stale and refresh them without losing older snapshots.

### Multimodal intake

Use one real state machine: selected → metadata_saved → duplicate_check → consent → upload → queued → extracting → candidate_review → accepted/rejected/error/cancelled. Preserve the original. Exact cryptographic hash finds exact duplicates; perceptual image similarity suggests a match for user confirmation. Never merge solely on file name or matching text. PDF/image claims carry page and region; video claims carry frame/time and transcript timestamps. Low confidence, owner ambiguity, unit/date conflict or policy conflict stops for review. Only approved candidates enter the canonical registry.

### Runtime supervisor and specialist workers

Nura's runtime master is a deterministic, replaceable supervisor: authenticate profile → validate consent and scope → classify intent → choose bounded tools/workers → retrieve a minimal evidence packet → check conflicts/unknowns → return cited answer/action proposal → validate and render → request approval before durable write.

Use specialized workers only for bounded jobs: document extraction, policy-clause extraction/comparison, source-grounded health discovery, and symptom safety routing. Registry retrieval, medicine/visit summaries and simple timeline operations can be typed tools. No worker can bypass authorization, approve facts, perform a consequential action or write memory directly. The LLM never queries storage directly.

### Shared UI/service event contract

Every operation has runId, sequence, timestamp, stage, status, user-safe label, optional referenced entity IDs and counts. Candidate event types: run.started; consent.validated; intent.classified; tool.started/completed/failed; source.received; duplicate.possible; extraction.started/progress/completed; review.required; retrieval.completed; evidence.updated; answer.delta/completed; memory.proposed; run.completed/failed/cancelled. Enforce one terminal event, idempotent state updates and resumable delivery where supported. Exclude prompts, private reasoning, sensitive tool arguments and raw health payloads from UI trace text.

### Build-process master/integration owner

The project master (Codex integration owner) is distinct from Nura's runtime supervisor. It maintains a matrix of: story → screen/action → domain operation → API/tool → persisted state → emitted event → animation → acceptance evidence. It arbitrates contract mismatches, owns integration gates and only connects a UI state to a real service after the data/event contract exists. Designers may use clearly identified fixtures while wireframing; app animations must never represent fixture activity as a live agent run.

## Integration/review gates

1. Design contract: all-story mobile wireframes, palette reconciliation, motion/state inventory and component map.
2. Runtime contract: canonical entities, consent/policy boundaries, tool schemas, run/event schema, failure/cancel behavior.
3. Profile slice: selection/input → saved profile state → map/synthesis update → restart retains state.
4. Intake/registry slice: sample PDF/image → actual extraction → duplicate/conflict/review decision → accepted fact → source-linked registry and timeline.
5. Ask slice: scope approval → actual tool events → cited answer/unknowns → approved write → later Ask retrieves that write.
6. Remaining story slices: insurance/feed; medicine/visit; symptom/family/privacy, each connected to shared profile and timeline.
7. Whole app: every story walked on iOS/Android; motion, keyboard/safe areas, reduced motion, source history, error recovery, permissions and export/delete reviewed.

At each gate, internal checks happen first. User review is for the coherent journey, visual quality and whether actions mean what the story promises—not debugging.
