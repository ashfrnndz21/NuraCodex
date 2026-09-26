# Nura user story build contract

This document translates the product stories into build acceptance criteria. All eleven stories are in scope. A story is complete only when its mobile journey, persisted state, source handling, errors, and user-visible feedback work end to end.

## Current coverage snapshot

This snapshot was updated from the app code and synthetic checks reviewed on 2026-09-26.

| Story | Current state | Current foundation |
|---|---|---|
| 1. Living 720 profile | Partial | The phone-sized onboarding now uses the approved evidence-first 720 overview instead of the orbit/map: tracking interests stay separate from source-grouped saved evidence, and each chosen area still opens its detail editor. It keeps dynamic focus choices, dependent selections, profile fields and optional biometrics. A consent-gated first synthesis returns cited selected-profile evidence and unknowns, can recontextualize a user correction, and offers an explicit new-note save. Health intake supports multiple staged files plus an optional topic-tagged self-report persisted separately as a draft. One consent names every staged file; extraction is sequential and source-linked, with real per-file activity, retryable failures and completed-source retention on stop. A unified review queue stages claim decisions and selected self-reported notes together, then saves them from one user action; per-item failures remain staged for retry. Review can reopen each saved source without resending it. A separate fictional-sample checkbox can run a deterministic local text organizer for a single note; exact-quoted suggestions and unresolved passages remain pending and source-linked until reviewed. This is not AI interpretation and makes no provider call. A new synthetic service integration exercises two reports and a local-only note through one staged file-batch approval, extraction retry/cancel, source-linked accept/edit/reject, one save queue and item retry; it is service-level evidence, not a full in-app journey. Synthetic preview placeholders without attached file bytes are excluded from file intake. The timeline explicitly labels the entry date when no event date was supplied. Provider-backed sign-in/recovery, owner isolation, a multi-file UI run, natural-language self-report interpretation, cross-file topic matching and native/reduced-motion end-to-end checks remain incomplete. |
| 2. Medical Registry | Partial | Native facts, files, timeline and user-authored links are present. PDF/image extraction and review connect to the local demo backend; links are source references during agent retrieval. Timeline source details open linked originals and extracted claims with quote/page and review status, and pending claims hand off to review. User-entered fact corrections append a current version, retain the old value and validity dates, and navigate back to the prior source. A mobile topic-registry page shows selected health topics, only explicitly linked records, an explicit relation picker, timeline/source navigation and topic-scoped Ask. Accepted extracted claims can now be corrected through source review; the backend appends a user-authored assertion version, closes the previous version, preserves the original extraction/quote and rejects stale correction retries. Topic summaries use consented Ask, retain validated citations and unknowns, preserve earlier versions, become stale when linked evidence changes, render without raw Markdown, and append natively with transactional latest-version links. Broader cross-registry provenance, browser refresh persistence and native-device acceptance remain incomplete. |
| 3. Insurance Registry | Partial | A dedicated registry route accepts policy-purpose uploads, extracts candidate terms with page quotes, gates them through review, and stores accepted terms with source and claim IDs. The compact at-a-glance summary now covers approved policy identity/status/dates, life benefits/riders, medical limits/care, premiums/payment term and policy value; it expands accessibly while remaining compact by default. Explicit exclusions, unclear wording and missing details remain separate, and absent information is not treated as exclusion. Ask returns source-validated typed benefit/limit/exclusion/unclear assessments; the validator now requires each assessment category to match conservative policy-wording rules and its detail to quote the cited accepted term. Unsupported/mislabeled findings are removed, and missing exclusion wording cannot support a claim that the policy has no exclusions. Synthetic comparisons with and without selected health context were run, and each linked fact opens its exact history source. Corrected prior terms and user-removed entries remain visible. Users can mark one policy as replacing another and compare exact-label accepted terms with both saved claim quotes. If one side lacks accepted terms, the relationship stays visible with recovery/removal actions; the removal function is now exposed through shared app state. The full two-policy extraction/review/comparison/Ask journey, insurer-response capture, conflict/error recovery, native and reduced-motion checks remain incomplete. |
| 4. Personalized health feed | Partial | Explore now searches up to three selected topics per run with explicit consent through allowlisted public health domains, shows real search activity and source links, and saves/hides items in native local state. Activity rows name each selected topic and its actual returned source count; row entry and completion feedback animate from received events and honor reduced motion. The generated brief is requested in a concise overview plus two source-supported points, shown as a short at-a-glance preview with explicit expand/collapse; source details no longer repeat the entire brief. Article results expand into a source-linked detail state using the actual returned excerpt and matching topic brief; the full publisher source opens separately. Web route changes use a shared slide/fade while native stack transitions remain; reduced motion disables the added transition. Retrieval dates are labeled separately from publisher dates, which are not inferred from retrieval. Video detail/ingestion, editorial ranking, publisher-date extraction, browser-refresh persistence, and full user journey/phone-size/reduced-motion verification remain incomplete. |
| 5. Ask Nura | Connected demo slice | The local agent runs against a configured model, requires per-run consent, searches only facts, topics, links, and separately opted-in treatment/visit records supplied for that run, streams real milestones, returns citations and unknowns, and gates memory proposals behind user approval. It no longer appends all local repository assertions to every request. A visible Stop action aborts the request; partial answers and memory proposals stay provisional until a successful terminal event, and failures restore the question for retry. Multi-specialist orchestration, consent history, evaluation/security suites and broader registries remain incomplete. |
| 6. Medicines and treatment | Partial | A dedicated local registry stores current and past treatment records with dose, schedule, purpose, prescriber, care location, pharmacy, source, and dated revisions; the treatment history appears on Home and the health timeline. Ask now offers a separate opt-in for all saved treatment records on each run, sanitizes the selected fields, retrieves them with source citations, and forcibly excludes them from symptom support. Production consent history, broader record linking and clinical evaluation remain incomplete. |
| 7. Visits and care actions | Partial | Manual scheduled or unscheduled visits, a user-selected source-linked brief, local preview and user-entered outcomes with optional saved-file attachments are connected. People can add dated follow-up actions, link the currently selected source files, and mark an action done or reopen it; updates persist with visit change snapshots. Ask can retrieve visit and action history only when separately opted in for that run. Native records persist in SQLite; browser records are synthetic and in-memory. Calendar import, reviewed export/share and reminders remain incomplete. |
| 8. Health timeline and connections | Partial | The mobile history view has selectable dated records and user-authored links on a warm-light canvas with category-coded record, care, treatment, vital and lifestyle nodes. Year headings group displayed events; facts from the same canonical source and event date now appear in one source event across mixed categories, with the original source and each captured detail still reachable. An analyzed source file is hidden from the main timeline when its extracted facts already represent it, while standalone/unanalyzed files remain visible and the Documents filter still lists files. Selecting an event reveals linked source details and evidence status, and pending claims open review. New links persist an explicit user-selected relation type and are included in consent-scoped Ask context. Evidence-backed relationship provenance, source-claim version history, reduced-motion/native verification and full visual navigation remain incomplete. |
| 9. Symptom support | Partial | A dedicated safety-first flow captures symptoms transiently, offers an immediate user-selected escalation path, requires per-run context consent, excludes treatment and visit records at the server boundary, streams real retrieval/evidence milestones, and only saves a user-authored note on explicit action. Clinical validation, broader emergency localization, and production-grade safety evaluation remain incomplete. |
| 10. Family and caregivers | Not built | No separate person profiles, scoped consent, or caregiver access. |
| 11. Privacy and control | Partial | Profile now opens a data inventory with counts and expandable saved values/sources for profile, topics, facts, files, treatments, visits, links, reading and Ask history. Confirmed controls clear this browser/device's Nura data and the separate loopback demo processing repository (source metadata, extracted claims, accepted assertions and activity). The consent ledger, export, per-record correction controls in this view, account/cloud deletion, external-provider retention controls and secure-erasure verification remain incomplete. |

## Stories and acceptance criteria

### 1. Create a living 720 health profile

The normal app journey begins with verified email or mobile one-time-code sign-in; no health details are requested before verification. The person chooses the profile owner, enters a required profile name and only the additional demographics needed for a stated purpose, then chooses any number of health topics or skips directly to adding records. A topic or detail choice is a tracking preference, not a diagnosis, document or confirmed fact.

The person can add multiple health sources and a plain-language self-report in one batch. After explicit processing consent, Nura runs real extraction, duplicate, date, topic-suggestion and conflict checks and shows operational milestones from the service. It produces source-linked candidate claims, not memory writes. The person reviews each clear or uncertain item, edits or rejects mistakes, confirms identity and source relationships, and saves the approved facts as versioned profile memory. The timeline uses event dates and preserves original sources, unknowns and corrections. Insurance is offered only after this health-profile save, through its separate policy intake and review.

Completion requires verified sign-in/recovery; owner isolation; a required name; accurate multi-select behavior above four topics; skip-to-upload; multi-file plus self-report batch; honest processing/error states; evidence-level review; approved-only memory writes; restart/re-entry; and a coherent month/year timeline. Full date of birth, body measurements or other sensitive demographics must not be mandatory unless a specific feature justifies and explains the need.

### 2. Maintain a Medical Registry as a personal health wiki

The person can open a medical registry and ask direct or cross-record questions about their conditions, history, and evidence. Registry summaries link to the original record and the relevant captured values, identify what the selected sources do not establish, and show when linked evidence has changed since the saved version. A refresh creates a new summary version while retaining the earlier one. Corrections preserve history rather than silently replacing prior information. Related conditions, labs, visits, medicines, and care details can be navigated through explicit links whose meaning is clear.

### 3. Maintain an Insurance Registry

The person can add policy documents and review extracted benefits, limits, exclusions, dates, and source passages. They can ask how coverage relates to their care needs. Every comparison identifies the policy evidence and the health information used, distinguishes unknown coverage from confirmed gaps, and lets the person correct extracted details.

### 4. Provide a personalized, sourced health feed

The person sees relevant reading and video based on the health areas they chose and their confirmed profile context. Each item identifies its publisher and source, explains why it is relevant, and can be saved or dismissed. The feed does not turn inferred or uncertain health facts into diagnoses, and the person can manage personalization.

### 5. Support grounded agentic conversations

The person can ask natural questions across the registries. Before retrieval, the app explains the information scope and obtains the required consent. The visible activity shows real milestones such as retrieving a record, checking a source, or preparing an answer; it never presents hidden chain-of-thought. Answers identify supporting sources, uncertainty, and missing information. Any proposed profile change or consequential action is shown for approval before it is saved or performed.

### 6. Track medicines and treatment

The person can maintain current and past medicines, dose and schedule as provided, purpose, prescribing clinician, pharmacy, and treatment changes. Each detail can point to its source or be clearly labeled as user-entered. The person can review, correct, and stop a medicine without erasing its history. Nura can use the confirmed treatment context in later questions.

### 7. Prepare for visits and capture outcomes

The person can create a visit brief from selected, confirmed profile details, prepare questions, and choose what to share. After the visit they can record outcomes, instructions, and follow-up actions, each linked to the visit and its source. The app does not invent a clinician's advice or mark a task complete without the person's input.

### 8. Explore history and relationships visually

The person can move between a chronological view and a connections view on a phone-sized screen. Timeline items represent actual dated records or user-confirmed events; selecting one reveals its source, captured details, and explicit links. Nodes, labels, and lines use a coordinated visual system so record type, relationship, and selected state are understandable without color alone. Lines communicate recorded associations, not medical causation. Zoom, filtering, empty states, and selected-item details remain usable on mobile.

### 9. Get bounded symptom support

The person can describe a symptom and receive safe next-step information grounded in their confirmed context. The experience checks for urgent warning signs and clearly escalates to emergency or clinician care when indicated. It does not diagnose, prescribe, or delay urgent care. The answer states its limits and the sources or profile details it used.

### 10. Keep family and caregiver records separate

The person can create or access another person's profile only with the required authority and consent. Each person's records, questions, and sources stay separated. Sharing is scoped, visible, revocable, and auditable. The app never mixes one person's health facts into another person's profile or answers.

### 11. Review and control personal information

The person can see what is stored, where it came from, how it is used, and what they have shared. They can correct information, withdraw consent, export their records, and delete selected records or the account through clear confirmation and completion states. Deletion and retention behavior is explained accurately and applied consistently across local and synced copies.

## Cross-story design and interaction bar

- Every screen is designed for a real mobile viewport, including safe areas, keyboard, scrolling, and small-device layouts.
- Every tap has immediate feedback and a purposeful transition. Expanding cards, topic bubbles, source nodes, filters, and review actions communicate what changed.
- The visual system uses the reference's blended palette with purposeful category colors, readable contrast, and coordinated node/link styling; purple is not the only data color.
- Loading, empty, success, error, permission, review, and reduced-motion states are designed, not left to default navigation behavior.
- Motion explains state change and hierarchy. Reduced motion preserves the same information and controls.
- AI activity reflects real app/backend events. It never fabricates analysis progress or exposes private chain-of-thought.
- Health claims, extracted values, and relationships retain provenance, time, confidence, and correction history. No inferred relationship is presented as clinical causation.


### History correction implementation — 24 September 2026

- The timeline now renders captured dates in a readable format, keeps expandable record summaries separate from card action buttons, and links a corrected fact to its preceding version/source. Synthetic browser verification confirmed the previous version stays in history and its original source remains navigable. TypeScript and lint checks pass. This advances Story 2 and Story 8 but does not complete either story.


### Explore detail interaction — 24 September 2026

- Feed article titles now expand and collapse into an animated, reduced-motion-aware detail state showing only the source excerpt, the selected-topic reason, an available search brief, and a direct publisher link. No full article text is fabricated. TypeScript and lint checks pass; all 8 existing repository tests pass. Story 4 remains partial.


### Profile, grounding, motion and Ask save follow-up — 26 September 2026

- **M1:** route gating requires both profile name and country for a new profile; partial demographics or selected topics cannot bypass setup. Existing saved records preserve access. Focused service tests pass. Full in-app first-history journey, verified identity, owner isolation, and the complete evidence-review/save flow remain open.
- **M3:** a returned coverage finding must match the category identified in its cited term, and its detail must be an exact quote from that accepted term. Unsupported assessments and ungrounded “no exclusions” claims are rejected. Synthetic tests pass; the full two-policy journey, comprehensive answer grounding/evaluation and production safety work remain open.
- **M4:** live feed rows identify topic and actual search status/count, compact briefs expand on request, and activity/navigation motion honors reduced motion. Route rendering and helper checks are verified; full feed journey, phone-size/reduced-motion visual review, browser-refresh behavior and production provider controls remain open.
- **M5:** a user-approved memory proposal reports success only after persistence; native fact and provenance writes are transactional, browser writes are awaited, and save failure is retryable. Proposal references navigate to the cited record when available. Focused persistence checks pass; multi-tool orchestration, broader evaluation/security and full user journey remain open.
- Consolidated evidence: `npm run test:repo` **220/220**, `npm run test:latest-slices` **53/53**, typecheck passed, lint **0 errors / 1 existing warning at `app/index.tsx:402`**, and `git diff --check` passed. These results do not close any story package. Overall remains **0/11, 0/8, 0/19 (0%)**; no user-test milestone is ready.


### M1 browser evidence and profile-map count correction — 26 September 2026

A clean synthetic preview origin on port 8095 was used without clearing the existing 8094 preview. The in-app path verified the local demo-code rehearsal, required profile fields, five primary areas plus two nested details, one approved built-in fictional lipid PDF together with a self-reported note, eight source-linked extraction suggestions checked against the PDF, one explicit review/save action, and a month/year history containing one report event plus the user note. Reloading `/health` preserved the displayed browser history. The PDF is represented by its captured event in Everything rather than a duplicate file card. This does not prove production OTP, active-person authorization, a multi-file upload batch, every review decision state, native restart, exact 390×844 layout, or reduced-motion acceptance; Story 1 remains partial.

The profile map summary now distinguishes current timeline items, primary chosen health areas, and nested selected details. It no longer treats a tracking choice as saved medical information.

The resumed code slices also add a 360-character expandable first view for long Ask answers and route conditional policy exclusions to clarification. Full answer/citation state stays available. Automated checks passed: repository tests **227/227**, latest slices **59/59**, typecheck, and lint with **0 errors / 1 existing warning at `app/index.tsx:402`**. The Ask presentation and profile-map summary tests are included in both standard test commands. No complete story or production gate is accepted; total remains **0/11, 0/8, 0/19**.


### Shared motion driver compatibility — 26 September 2026

- All current `Animated` call sites now share a platform policy: native driver for iOS/Android and JavaScript driver on web. Android enables the documented LayoutAnimation runtime flag at app startup. Existing motion token values and reduced-motion behavior are unchanged.
- Verification: platform policy tests pass, the rebuilt `/health` and `/care` browser routes render, and the Expo web log no longer reports the missing native animation module. This is a shared foundation improvement; it does not complete any story. Native-device, reduced-motion, 390×844 and 360×780 visual acceptance remain open.

### Ask consent and self-report regression follow-up — 26 September 2026, 15:50 +08

- Ask's general health-context consent now expands to individual saved facts and shows an included/total count. Live synthetic preview confirmed 9/9 → 8/9 after excluding one fact; canceling the staged question sent no request.
- The first-run local self-report organizer falsely read “15 January 2025” as a glucose value and split “6.3” at the decimal. It now masks full ISO and month-name calendar dates before numeric extraction and keeps decimal values in one sentence. Regression tests cover both cases. Unsupported wording remains marked unclear.
- Live synthetic profile setup reached five selected areas and one nested detail. The bundled report resolved to an existing saved source, so it was not reprocessed. A fictional note was explicitly included and saved as a separate timeline event; /health reload preserved the note and the report history.
- The native multiple-file picker did not surface in the locked desktop session. The M1 integration test did pass batch consent/retry/cancel and source-decision behavior, but the in-app multi-file path remains unverified.
- Full verification: repository suite 236/236, latest slices 66/66, typecheck passed, lint 0 errors / 1 pre-existing warning at app/index.tsx:403, and git diff --check passed.
- This is partial evidence for Stories 1, 2 and 5 only. Overall remains 0/11 stories, 0/8 production gates, 0/19 packages (0%). No user-test milestone is ready.


### Numeric-date measurement guard — 26 September 2026, 16:03 +08

- The local-only self-report organizer now masks numeric dates (`MM/DD/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`) before measurement matching. Regression coverage confirms a date is not emitted as a glucose value, while the existing decimal measurement case stays intact.
- Verification: focused self-report **10/10**, repository **237/237**, latest slices **66/66**, typecheck passed; lint has **0 errors and 1 pre-existing warning at `app/index.tsx:403`**.
- Story 1 remains partial; this does not complete any story or gate. Counts remain **0/11, 0/8, 0/19 (0%)**. No user-test handoff is ready. The next M1 acceptance work is the unverified in-app multi-file batch and the full review/save/re-entry path.
