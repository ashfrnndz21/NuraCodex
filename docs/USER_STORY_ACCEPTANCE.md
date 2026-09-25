# Nura user story build contract

This document translates the product stories into build acceptance criteria. All eleven stories are in scope. A story is complete only when its mobile journey, persisted state, source handling, errors, and user-visible feedback work end to end.

## Current coverage snapshot

This snapshot is based on the app code reviewed on 2026-09-24.

| Story | Current state | Current foundation |
|---|---|---|
| 1. Living 720 profile | Partial | The phone-sized onboarding has dynamic focus bubbles, dependent selections, a changing 720 map, profile fields and optional biometrics. A consent-gated first synthesis now returns cited selected-profile evidence and unknowns, can recontextualize a user correction, and offers an explicit new-note save. Identity/account recovery and the full shot-by-shot onboarding remain incomplete. |
| 2. Medical Registry | Partial | Native facts, files, timeline and user-authored links are present. PDF/image extraction and review connect to the local demo backend; links are source references during agent retrieval. Timeline source details open linked originals and extracted claims with quote/page and review status, and pending claims hand off to review. User-entered fact corrections append a current version, retain the old value and validity dates, and navigate back to the prior source. A mobile topic-registry page shows selected health topics, only explicitly linked records, an explicit relation picker, timeline/source navigation and topic-scoped Ask. Accepted extracted claims can now be corrected through source review; the backend appends a user-authored assertion version, closes the previous version, preserves the original extraction/quote and rejects stale correction retries. Topic summaries use consented Ask, retain validated citations and unknowns, preserve earlier versions, become stale when linked evidence changes, render without raw Markdown, and append natively with transactional latest-version links. Broader cross-registry provenance, browser refresh persistence and native-device acceptance remain incomplete. |
| 3. Insurance Registry | Partial | A dedicated registry route accepts policy-purpose uploads, extracts candidate terms with page quotes, gates them through review, and stores accepted terms with source and claim IDs. The registry now shows a compact at-a-glance list of source-linked approved limits/cost-share terms and a visible list of key medical details absent from the approved summary, with explicit wording that absence is not exclusion. Ask returns source-validated typed benefit/limit/exclusion/unclear assessments; synthetic comparisons with and without selected health context were run, and each linked fact opens its exact history source. Corrected prior terms and user-removed entries remain visible. Users can mark one policy as replacing another and compare exact-label accepted terms with both saved claim quotes. The full two-policy extraction/review/comparison/Ask journey, conflict/error recovery, native and reduced-motion checks remain incomplete. |
| 4. Personalized health feed | Partial | Explore now searches up to three selected topics per run with explicit consent through allowlisted public health domains, shows real search activity and source links, and saves/hides items in native local state. Article results now expand into a source-linked detail state using the actual returned excerpt and any matching topic brief; the full publisher source opens separately. Video detail/ingestion, editorial ranking, publication-date extraction and browser-refresh persistence remain incomplete. |
| 5. Ask Nura | Connected demo slice | The local agent runs against a configured model, requires per-run consent, searches only facts, topics, links, and separately opted-in treatment/visit records supplied for that run, streams real milestones, returns citations and unknowns, and gates memory proposals behind user approval. It no longer appends all local repository assertions to every request. Multi-specialist orchestration, consent history and broader registries remain incomplete. |
| 6. Medicines and treatment | Partial | A dedicated local registry stores current and past treatment records with dose, schedule, purpose, prescriber, care location, pharmacy, source, and dated revisions; the treatment history appears on Home and the health timeline. Ask now offers a separate opt-in for all saved treatment records on each run, sanitizes the selected fields, retrieves them with source citations, and forcibly excludes them from symptom support. Production consent history, broader record linking and clinical evaluation remain incomplete. |
| 7. Visits and care actions | Partial | Manual scheduled or unscheduled visits, a user-selected source-linked brief, local preview and user-entered outcomes with optional saved-file attachments are connected. People can add dated follow-up actions, link the currently selected source files, and mark an action done or reopen it; updates persist with visit change snapshots. Ask can retrieve visit and action history only when separately opted in for that run. Native records persist in SQLite; browser records are synthetic and in-memory. Calendar import, reviewed export/share and reminders remain incomplete. |
| 8. Health timeline and connections | Partial | The mobile history view has selectable dated records and user-authored links on a warm-light canvas with white record cards, category-coded cobalt, teal, lilac, amber and green nodes, and endpoint-colored connection rails; the continuous cobalt chronology rail distinguishes time from user-authored relationships. Selecting an event reveals its linked source, extracted claims and evidence status, and pending claims open review. New links persist an explicit user-selected relation type and are included in consent-scoped Ask context. Evidence-backed relationship provenance, source-claim version history, reduced-motion/native verification and full visual navigation remain incomplete. |
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
