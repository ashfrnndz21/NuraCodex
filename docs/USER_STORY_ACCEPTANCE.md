# Nura user story build contract

This document translates the product stories into build acceptance criteria. All eleven stories are in scope. A story is complete only when its mobile journey, persisted state, source handling, errors, and user-visible feedback work end to end.

## Current coverage snapshot

This acceptance table is a product-story inventory. For the newest implementation and verification status, see [the whole-build audit](NURA_BUILD_AUDIT.md). Repository cleanup and passing synthetic tests do not by themselves accept any story: the strict product count remains **0/11 stories, 0/8 production gates, 0/19 packages** as of 5 October 2026.

| Story | Current state | Current foundation |
|---|---|---|
| 1. Living 720 profile | Partial | The evidence-first overview uses a translucent plum-glass surface and one circular area-bubble chooser. The provider-free M1 browser rehearsal now passes 82/82 in reduced motion, including Home layout, country text contrast, multiple areas, source-linked registries, Explore save/hide, privacy export, sign-out/recovery, zero-topic setup and 360/390/430 px overflow. The full synthetic Health → Insurance → Ask journey passes 72/72 in each motion setting. The connected ordinary-upload-to-Ask rehearsal now passes 32/32: five synthetic health PDFs and one policy PDF, failure/retry, Stop, date/conflict review, explicit decisions, one save, policy deferral/retry/approval, and an Ask response citing both source families after re-entry. Family history records a relationship with a chosen condition (such as “Mother · diabetes”) as self-reported context, not another person’s profile. Fixtures and model answers are synthetic; no real health data or external model request was used. Production identity/recovery and owner isolation, supported-native appearance/restart, and remaining recovery cases are still open. |
| 2. Medical Registry | Partial | Native facts, files, timeline and user-authored links are present. PDF/image extraction and review connect to the local demo backend; links are source references during agent retrieval. Timeline source details open linked originals and extracted claims with quote/page and review status, and pending claims hand off to review. User-entered fact corrections append a current version, retain the old value and validity dates, and navigate back to the prior source. A mobile topic-registry page shows selected health topics, only explicitly linked records, an explicit relation picker, timeline/source navigation and topic-scoped Ask. Accepted extracted claims can now be corrected through source review; the backend appends a user-authored assertion version, closes the previous version, preserves the original extraction/quote and rejects stale correction retries. Topic summaries use consented Ask, retain validated citations and unknowns, preserve earlier versions, become stale when linked evidence changes, render without raw Markdown, and append natively with transactional latest-version links. Broader cross-registry provenance, browser refresh persistence and native-device acceptance remain incomplete. |
| 3. Insurance Registry | Partial | A dedicated registry route accepts policy-purpose uploads, extracts candidate terms with page quotes, gates them through review, and stores accepted terms with source and claim IDs. The pre-approval extraction brief now checks 11 common health-policy areas: identity/version, dates/status, eligibility, benefits, limits, member costs, premiums, exclusions/conditions, provider network/geographic scope, claims/appeals, and coordination with other coverage. The strict provider schema carries insurer/plan/type/version/jurisdiction and effective/renewal/expiry metadata with page quotes across split PDF batches, and expanded source details show those quotes. Evidence gaps are labelled “not identified,” not “not covered.” This checklist is a guide, not a completeness guarantee; full two-policy recovery, conflict handling, native acceptance, and production guarantees remain open. The compact at-a-glance summary now covers approved policy identity/status/dates, life benefits/riders, medical limits/care, premiums/payment term and policy value; it expands accessibly while remaining compact by default. Explicit exclusions, unclear wording and missing details remain separate, and absent information is not treated as exclusion. Ask returns source-validated typed benefit/limit/exclusion/unclear assessments; the validator now requires each assessment category to match conservative policy-wording rules and its detail to quote the cited accepted term. Unsupported/mislabeled findings are removed, and missing exclusion wording cannot support a claim that the policy has no exclusions. Synthetic comparisons with and without selected health context were run, and each linked fact opens its exact history source. Corrected prior terms and user-removed entries remain visible. Users can mark one policy as replacing another and compare exact-label accepted terms with both saved claim quotes. If one side lacks accepted terms, the relationship stays visible with recovery/removal actions; the removal function is now exposed through shared app state. The full two-policy extraction/review/comparison/Ask journey, insurer-response capture, conflict/error recovery, native and reduced-motion checks remain incomplete. |
| 4. Personalized health feed | Partial | Explore searches up to three selected topics per run with explicit consent through allowlisted public health domains, shows actual source activity, and saves/hides items. It accepts “Medicine · Insulin”; family relationship details are generalized before search. Direct YouTube video URLs retain the original title/link and render the original thumbnail. The adapter runs a separate YouTube-only search, retries when it receives no playable video, and fails the edition instead of falsely reporting a completed search without a video. The focused synthetic search/presentation/curation checks pass 46/46. A synthetic browser rehearsal passes 74/74 in standard motion and 74/74 in reduced motion, confirming personalized headlines, item-specific Save/Hide/Restore labels, and Saved/Hidden state after reload. Live provider/video retrieval and outage recovery, editorial ranking, publisher-date extraction, and full feed-specific phone/native visual verification remain incomplete; the last live provider request returned HTTP 401, so no real video thumbnails or results have been verified. |
| 5. Ask Nura | Connected demo slice | The local agent requires per-run consent, uses only selected context, streams real milestones, returns citations and unknowns, and gates memory proposals behind user approval. The Health → Insurance → Ask journey passes 72/72 in standard and reduced motion with in-process synthetic responses, covering typed-text visibility, consent cancellation, selected policy/health evidence, cited answer, uncertainty, next step, source navigation, persistence and re-entry. The first view leads with a short answer and groups evidence by origin; general education appears only with a returned public-source citation. Policy, symptom and profile-summary intents omit that section. Handset visual review, semantic grounding evaluation, multi-specialist orchestration, consent history and production availability remain incomplete. |
| 6. Medicines and treatment | Partial | A dedicated local registry stores current and past treatment records with dose, schedule, purpose, prescriber, care location, pharmacy, source, and dated revisions; the treatment history appears on Home and the health timeline. Ask now offers a separate opt-in for all saved treatment records on each run, sanitizes the selected fields, retrieves them with source citations, and forcibly excludes them from symptom support. Production consent history, broader record linking and clinical evaluation remain incomplete. |
| 7. Visits and care actions | Partial | The reduced-motion synthetic browser rehearsal now covers a scheduled visit, explicit source selection and a user-written question in a local-only brief, user-entered outcome, dated follow-up completion, reload recovery and a separate undated visit. The visit checklist excludes Insurance Registry terms. Ask can retrieve visit and action history only when separately opted in for that run; server consent tests pass 47/47. This is synthetic local browser persistence, not production sync. Native calendar share-sheet confirmation, full source/version recovery, and supported-device/restart review remain incomplete. |
| 8. Health timeline and connections | Partial | The mobile history view has selectable dated records and user-authored links on a warm-light canvas with category-coded record, care, treatment, vital and lifestyle nodes. Year headings group displayed events; facts from the same canonical source and event date now appear in one source event across mixed categories, with the original source and each captured detail still reachable. An analyzed source file is hidden from the main timeline when its extracted facts already represent it, while standalone/unanalyzed files remain visible and the Documents filter still lists files. Selecting an event reveals linked source details and evidence status, and pending claims open review. New links persist an explicit user-selected relation type and are included in consent-scoped Ask context. Evidence-backed relationship provenance, source-claim version history, reduced-motion/native verification and full visual navigation remain incomplete. |
| 9. Symptom support | Partial | A dedicated safety-first flow captures symptoms transiently, offers an immediate user-selected escalation path, requires per-run context consent, excludes treatment and visit records at the server boundary, streams real retrieval/evidence milestones, and only saves a user-authored note on explicit action. Clinical validation, broader emergency localization, and production-grade safety evaluation remain incomplete. |
| 10. Family and caregivers | Not built | No separate person profiles, scoped consent, or caregiver access. |
| 11. Privacy and control | Partial | Profile opens a data inventory with counts and expandable saved values/sources; local approvals and processing choices remain visible and separate. The local export is now a ZIP containing the saved profile, source-linked records, and original files still readable on this device/browser. Its manifest excludes device URIs and lists originals that could not be included. A provider-free browser journey byte-compared all three synthetic original files against the archived copies. Local preview clear/reset controls are present. Production/versioned consent history, provider-aware withdrawal, selected-record correction/deletion in this view, account/cloud export and deletion, verified erasure/retention, large-export memory handling, and native-device verification remain incomplete. |

**Insurance dossier update — 5 October 2026:** the mobile Insurance Registry now follows the selected dossier hierarchy and includes source/original actions, the coverage list, separate explicit exclusions and unknown missing fields, plus expand/collapse for the full checklist. Connected synthetic UI evidence passes **33/33** and repository tests **564/564**. It remains a partial story: the preview deliberately has one accepted policy term, so it cannot demonstrate a fully populated real policy; native visual acceptance and the full policy conflict/recovery path remain open.

## Stories and acceptance criteria

### 1. Create a living 720 health profile

The normal app journey begins with verified email or mobile one-time-code sign-in; no health details are requested before verification. The person chooses the profile owner, enters a required profile name, country, date of birth, height and weight, then chooses any number of health topics or skips directly to adding records. This required-demographics choice follows the user's explicit onboarding direction: explain that date of birth calculates the displayed age; identify height and weight as self-reported, editable profile measurements, not diagnoses. A main area selection expresses interest in following it. Present areas as one circular bubble grid; selecting a new area or tapping an already selected area opens its related-context sheet. The sheet can record what the person reports about a diagnosis/condition, symptoms, medicines, treatment or care; label these as self-reported signals, not clinically verified facts. Expandable symptom/medicine tiles must show what is available and make the action obvious. Provide removal inside the sheet and remove that area’s nested signals with it. Exact details and source evidence enter through the shared note/file intake and require user review before becoming profile facts.

The person can add multiple health sources and a plain-language self-report in one batch. After explicit processing consent, Nura runs real extraction, duplicate, date, topic-suggestion and conflict checks and shows operational milestones from the service. It produces source-linked candidate claims, not memory writes. The person reviews each clear or uncertain item, edits or rejects mistakes, confirms identity and source relationships, and saves the approved facts as versioned profile memory. The timeline uses event dates and preserves original sources, unknowns and corrections. Insurance is offered only after this health-profile save, through its separate policy intake and review.

Completion requires verified sign-in/recovery; owner isolation; required name/country/date-of-birth/height/weight fields with their stated use; accurate multi-select behavior above four topics; skip-to-upload; multi-file plus self-report batch; honest processing/error states; evidence-level review; approved-only memory writes; restart/re-entry; and a coherent month/year timeline. Height and weight remain explicitly self-reported and editable; none of these profile choices may be treated as a diagnosis or silently shared with a provider.

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
- **M4:** live feed rows identify topic and actual search status/count, compact briefs expand on request, and activity/navigation motion honors reduced motion. The synthetic browser journey confirms Saved/Hidden persistence after reload in both motion settings. Live feed retrieval, phone/native visual review and production provider controls remain open.
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


### M1 provider-free in-app batch run — 27 September 2026, 08:55 +08

- A fresh isolated browser profile completed the real compiled web-preview journey: demo sign-in, required profile setup, five focus areas plus a detail, one synthetic self-report and two exact sample PDFs, explicit on-device consent, separate per-file events, review and one save.
- Review decisions were visible in-app: January LDL and April LDL included, synthetic April non-HDL corrected with its original extraction retained, April HDL dismissed, and unselected suggestions left pending. The app saved staged decisions together.
- /health showed three events with the expected dates and source relationships: one self-report, one January measurement, and one April report event grouping two accepted measurements. Reload persisted the history; opening the saved source did not reprocess the original. No duplicate report event appeared.
- Responsive web check at 360×780, 390×844, 430×932 found no horizontal overflow; the 390×844 view was visually inspected. Typecheck, no-cache lint, repository/integration 273/273, latest slices 80/80 and review accessibility 7/7 passed. The backend ran with no provider key and only local sample fixtures.
- **Remaining for Story 1:** production email/mobile verification and recovery, active-person authorization/isolation, skip-to-upload, ordinary connected upload path, unknown-date/conflict and offline/cancel recovery in the app, automated repeatability, native persistence and true reduced-motion/device checks. Story 1 remains partial; overall stays **0/11, 0/8, 0/19 (0%)**.


## Latest M1 verification — 27 September 2026, 09:50 +08

- `npm run test:m1-browser`: **16/16** passed using a disposable synthetic browser profile, isolated Expo web app and loopback service. It covered the local sample journey through review, one save, history/reload and 360/390/430 px overflow checks. Reduced-motion preference was enabled, but full motion behavior was not validated.
- `npm run test:repo`: **281/281**; `npm run test:latest-slices`: **85/85**; `npm run test:review-accessibility`: **7/7**; typecheck; no-cache lint; and `git diff --check` all passed.
- No provider was called; all 32 observed requests stayed on app/service origins; service storage contained two exact fixture sources and zero provider events. This provides partial M1 evidence only. Accepted counts remain 0/11 stories, 0/8 production gates and 0/19 packages. The whole-app experience is not ready for user review.


### M1 zero-area route contract — 27 September 2026, 10:00 +08

- The new regression test passes with required display name/country and zero selected topics/facts/assets, confirming the profile setup handler can continue to first-run `/intake?firstRun=true` and the profile route guard allows it. This proves the route contract only; the zero-area branch has not been visually exercised in the app.
- Latest-slice suite **86/86**, typecheck, no-cache lint and diff check pass. Strict story/gate acceptance remains **0/11, 0/8, 0/19 (0%)**.


### M1 zero-topic browser branch — 27 September 2026, 10:09 +08

- The isolated browser rehearsal passes **22/22** assertions across the existing provider-free synthetic file/review/save/history path and a fresh first-run profile with zero chosen areas.
- The fresh route rejects missing display name and missing country, preserves the entered synthetic name after country validation, allows zero topics, reaches /intake?firstRun=true, and presents the skip-to-health-history action.
- Full verification: browser **22/22**, repository/integration **281/281**, latest slices **86/86**, review accessibility **7/7**, typecheck, no-cache lint, and diff check pass. The provider key is empty; all 32 observed requests stayed on app/service origins; there were zero provider-like events and no browser network failures/exceptions.
- This verifies the branch and available skip action, not the post-skip screen behavior, native app, full reduced-motion behavior, verified production identity, or account isolation. M1 remains partial; strict progress is **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. No complete user-test milestone is ready.


### M1 zero-topic skip destination — 27 September 2026, 10:16 +08

- After required-name/country validation and the zero-area route to /intake?firstRun=true, the browser rehearsal now clicks the available skip action and confirms it opens /health for the new synthetic profile, Casey Zero.
- The full provider-free browser rehearsal passes **23/23**. Typecheck, no-cache lint, repository/integration **281/281**, latest slices **86/86**, review accessibility **7/7**, and diff check pass from the same source checkpoint.
- This remains local sample evidence only. Connected non-fixture upload, real in-app recovery, native restart, full reduced-motion review, production identity and owner isolation remain open. Strict acceptance remains **0/11, 0/8, 0/19 (0%)**.

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

### 720 profile visual and bubble-flow correction — 27 September 2026, 16:58 +08

- Replaced the oversized opaque cream profile overview with a translucent plum-glass card, warm high-contrast text, and restrained Nura cobalt/lilac/peach accents. Removed the duplicate selected-area row list; topic names appear once as circular bubbles. Selecting/reopening a bubble opens its context sheet; the sheet can remove the area and associated context. Hidden the large empty record card when no records exist, while retaining a truthful zero count and the next action.
- Shortened repeated guidance and removed duplicate counts from adjacent overview headings. The 390 px screenshot was inspected. At 360/390/430 px the M1 browser rehearsal reports no horizontal overflow.
- Verification: provider-free M1 browser **26/26**; TypeScript typecheck; no-cache lint; `git diff --check`. The script also completed consent, two-file synthetic extraction, claim review/save, source-linked history/reload, and the zero-topic skip path. No provider or real health data was used.
- Story 1 remains partial; **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. Supported native presentation/restart, real reduced-motion behavior, verified account login/recovery, owner isolation, and the remaining M1 recovery criteria remain open.


### T1 synthetic preview session boundary — 27 September 2026, 20:40 +08

- The loopback-only preview service now requires a server-issued opaque bearer session before dispatching protected `/v1/*` routes. The session has a bounded lifetime, revalidation runs from the app's startup path after reload, and sign-out revokes it. This is a synthetic preview identity: its public code does not prove email/mobile ownership, sessions are memory-only, and every sign-in maps to the same fictional profile.
- The HTTP integration suite passes **11/11**. It proves missing and malformed credentials are denied across intake, review, Ask, feed and demo-clear route families; unissued and revoked tokens are denied; HTTP checks reject an expired session; a client-supplied foreign profile ID is rejected; and CORS preflight permits the authorization header.
- The in-app browser rehearsal passes **42/42** with standard motion and **42/42** with reduced motion. It observes app-start session revalidation and rejects a locally unexpired but server-revoked token. Repository/integration passes **312/312**, with typecheck, no-cache lint and `git diff --check` green. Browser network observation recorded only the isolated local app and service origins; only synthetic fixtures were used.
- The T1 preview milestone is internally verified. **P1 and Story 1 remain partial:** this does not provide real OTP delivery/ownership, account recovery, durable identity or cross-person isolation, and it is not native-device acceptance. Strict totals remain **0/11 stories, 0/8 gates, 0/19 packages (0%)**.

### Preview sign-in timeout recovery — 27 September 2026, 20:50 +08

- App startup now bounds synthetic-session revalidation to three seconds. If the local session service does not respond, the app removes the unverified preview credential, returns to the login screen, and explains that the local service must be available before signing in again; successful sign-in clears the warning.
- The browser rehearsal blocks only the session-check route to reproduce the stalled request while allowing the app bundle to load. It confirms timeout, credential removal and the visible recovery message. Full M1 browser acceptance passes **43/43** in standard motion and **43/43** in reduced motion; repository/integration is **312/312**, with typecheck, no-cache lint and `git diff --check` green.
- This improves the local preview recovery path. It does not add offline access or change the production identity and isolation requirements; Story 1 and P1 remain partial.
