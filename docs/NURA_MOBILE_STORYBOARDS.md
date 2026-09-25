# Nura Mobile Storyboards and Motion Specification

**Purpose:** implementation-ready mobile design contract for all 11 Nura user stories.  
**Design references:** Nura Blueprint v2 interaction philosophy; the selected light, cobalt-node medical-history timeline; the selected New / Same / Conflict / Replaces / Whose? record-review states.  
**Scope:** screen hierarchy, components, interaction and animation states, loading / empty / error behavior, mobile constraints, and acceptance checks. This is a product design specification, not a claim that unimplemented services already exist.

---

## 1. Product experience contract

Nura should feel like an intelligent companion that notices what matters, brings forward relevant information, explains its sources, and helps the user act. The primary pattern is:

**Nura prioritizes → surfaces context → user explores → Nura explains → user chooses an action.**

Keep the experience editorial and contextual. Avoid turning the product into a data dashboard, a conventional CRUD app, or a chat screen surrounded by unrelated cards. Prefer progressive disclosure and an expanding card or sheet that remains visually connected to the item the user selected.

Every screen should make these clear:

1. What is relevant here?
2. Why is it relevant, and where did it come from?
3. What can the user do next?

Nura can present “what changed” and “what may be related.” It must distinguish recorded facts from external education, candidate extractions, user-entered details, and model-generated interpretation. It must never communicate correlation as causation.

### Visual reconciliation

The two references describe different, intentional mobile surfaces; do not flatten them into one theme:

- **Onboarding and Nura-led conversations:** follow the Blueprint v2 phone scene. Use the deep indigo-to-plum-to-dusty-rose atmospheric background, slow peach/lilac ambient light, frosted translucent cards, warm cream type and action buttons, and the animated conic-gradient orb. On the identity step, use warm-white input fields with dark readable text against the gradient. A tap visibly selects a bubble, reveals its related detail bubbles, updates the profile map, and changes the live count. These are full-screen scenes, not a white form page with a purple banner.
- **Medical history and evidence review:** follow the selected light record-history reference. Use a soft lilac-paper canvas (`#EDE5EF`) with warm cream evidence cards (`#FFFBF7`), readable charcoal type, cobalt record nodes and relationship lines, and category colors used consistently with labels/icons alongside them. Keep this surface calm enough to scan dense dates and evidence; preserve a clear canvas/card contrast rather than turning the whole screen white.
- **Data color:** cobalt identifies record nodes and rails in the history view; mint means complete/in range; amber means review/uncertainty/conflict; indigo-violet-peach belongs to Nura's presence and the onboarding atmosphere. Do not make all health information purple.
- **Reference hierarchy:** strong editorial headlines, quiet controls, translucent scene cards for conversation/onboarding, and clean white evidence cards for the timeline. Do not mix the two surfaces in one screen without a clear transition.
- **Contrast and motion:** atmosphere and glow stay behind content. Every tap has immediate feedback and a purposeful transition; reduced motion keeps selection, state, and hierarchy visible without drift or movement.

The onboarding screenshot previously produced by the app drifted from this contract: it used a pale canvas, a boxed gradient banner, a static gradient disc, pill chips, and empty gray graph placeholders. Those are not the Blueprint v2 onboarding scene. The timeline's light/cobalt styling remains the selected direction for record history.

---

## 2. Mobile layout system

Design first for a **390 × 844 pt** phone viewport, then verify at **360 × 780** and a larger phone around **430 × 932**. Use the actual safe-area insets and system keyboard. The web target is a preview surface; a desktop browser must not determine mobile layout.

### Persistent app shell

- Compact top bar: Nura wordmark or contextual page title; a small orb appears only where Nura has a meaningful presence; search / profile controls remain quiet.
- Main content scrolls vertically. The headline, reason/context, and primary action appear early; long evidence lists follow.
- Bottom navigation remains stable and thumb-accessible: **Home · History · Explore · Care · Profile**. Ask is a contextual composer / full conversation, not necessarily a top-level tab.
- Family / caregiver profile selection is visible in Profile and anywhere the active person matters. The active person's identity must never be ambiguous.
- A compact **Ask Nura** composer can dock above bottom navigation on Home, History, registry details, and relevant care pages. It must not cover the final card or system gesture area.
- Use a shared bottom-sheet primitive with top handle, clear title, contextual summary, fixed safe-area-aware action, and drag-to-dismiss. Do not put long forms in a short sheet; expand to a full-screen flow when the keyboard or content requires it.
- Tap targets should be comfortably touchable (about 44 pt minimum where practical), with visible focus and pressed states.
- Avoid side-by-side grids for critical records on narrow phones. Use one primary column; only use a two-column layout for short, noncritical summaries that remain legible at 360 pt.

### Card hierarchy

- **Primary editorial card:** one high-priority insight or next action, with why it matters and a clear CTA.
- **Evidence/record card:** date, record type, concise title, short detail, status and source chip; expands in place.
- **Secondary card:** reminders, saved content, upcoming appointment; quieter surface and shorter content.
- **Review card:** source snippet alongside candidate value; one explicit action per decision.
- **Empty/error card:** plain explanation plus one useful next step, never a dead end.

---

## 3. Shared component and state inventory

Create the design around composable, accessible primitives:

- App shell, contextual header, bottom navigation, person switcher.
- Editorial headline, reason/context line, insight/action card.
- Orb state indicator, compact Ask composer, conversation view.
- Timeline rail, typed record node, event card, source chip, relationship path.
- Focus-topic bubble and conditional branch, live profile map.
- Candidate-claim review row, source preview, status badge.
- Registry / wiki topic header, evidence list, version history.
- Feed / video card, visit brief section, permissions row.
- Bottom sheet, inline expanding card, confirmation dialog.
- Loading, empty, error, offline, unavailable, permission-denied, consent-required, reduced-motion components.

### Explicit state machines

**Shared control:** resting → pressed/focused → selected or expanded → success, unavailable, or error. A pressed effect is feedback, not a state transition.

**Record intake:** selected on device → metadata saved → duplicate check → consent to processing → queued → extracting → candidate review → accepted into registry / rejected / processing error. Display a state only after the underlying service emits it.

**Claim review:** candidate → accepted by user / edited and accepted / rejected / needs clarification. Store original claim, changed value, evidence location, user action, and time.

**AI run:** idle → consent/scope review → run started → permitted retrieval/tool activity → evidence found / conflict / missing evidence → clarification or answer stream → run complete / run error. There is no timer-based “thinking” advancement.

**Timeline record state:** date and category are stable; candidate / reviewed / confirmed / superseded and duplicate/conflict status are explicit. A visual relationship cannot change a record's evidence status.

---

## 4. Motion system

Treat motion as **state feedback, hierarchy, and orientation**, never as proof of intelligence. Use a central token set. The supplied brief's starting ranges are appropriate for the storyboard: fast about 140 ms; standard about 320 ms; major reveal about 400–600 ms; press scale about 0.985 over 80–120 ms; restrained dense-list stagger around 40–100 ms. Tune in implementation against real devices and reduced-motion settings.

- **Press:** scale to 0.985 with slight surface brighten, then settle smoothly; no large bounce.
- **Card entrance:** primary content 400–600 ms; secondary 300–450 ms; subtle stagger 40–100 ms. Do not replay a cascade on every scroll.
- **Expand/morph:** retain the same card identity and anchor, then reveal content in place in about 260–420 ms. Avoid “fade out → unrelated page.”
- **Sheets:** controlled spring entrance around 320–450 ms; follow drag; snap back when gesture does not dismiss; use immediate or short opacity change with reduced motion.
- **Selected topic branch:** selection feedback first; reveal dependent bubble branch in a short stagger, then update the profile map when the save succeeds. Collapse only dependent unanswered selections on parent removal.
- **Timeline focus:** node enlarges slightly and gains a halo / selected outline; matching card receives a clear focus state; selected relationship path highlights only after the user requests it.
- **Chart:** draw only actual data. Do not count up fictional or inferred health values.
- **Orb:** idle breathing can be very subtle; listening only during active capture; thinking/retrieving only during real service activity; responding only while response content arrives; error is subdued. Stop when run ends or view becomes inactive.
- **Loading:** status text and subtle shimmer may accompany a real queued/extracting/searching state. Never run a generic timer animation in place of a service.
- **Reduced motion:** remove continuous breathing/drift and large travel. Keep status, selection, source links, and hierarchy through stable color, outline, icon, and text.

### AI-visible activity is not chain-of-thought

Display only operational milestones that the app or agent service actually reports, such as “Checking the records you selected,” “Found two matching results,” or “Preparing an answer from these sources.” Do not display private hidden reasoning or invent intermediate steps. On failure, show the last completed milestone and a calm, recoverable error.

---

## 5. Story 1 — Create a living 720 profile

**Goal:** identity and health-focus setup feels light, visual, and editable, while the profile genuinely accumulates state. A selected topic is the user's chosen focus, not a diagnosis.

### 1A. Welcome / choose who the profile is for

**Hierarchy:** Nura orb + short welcome → one-line purpose (“A clearer picture of your health, at your pace”) → action **For me** → secondary **I’m helping someone** → short privacy/context note.

**Components:** compact orb, editorial title, large primary action, secondary action, brief “why build this” disclosure.

**Interactions/states:** tap choice uses tactile press and a small selected confirmation; self continues to identity. Caregiver choice begins a separate-person setup and must not merge that person's data into the user's. A future account/sign-in step can be introduced without interrupting the design story; clearly distinguish local demo state from a real account.

**Motion:** orb's gradient is present but restrained; title/card settles once. Selected option compresses and transitions to the next scene with a short directional transition, not a hard jump.

**Acceptance:** the user can explain what the profile is for, can choose the active person, and can skip or revisit optional details.

### 1B. Identity and first details

**Hierarchy:** progress context (e.g., “The person behind the profile”) → country selector → preferred/name field → birthday → phone/email choices → optional current height/weight/biometrics → concise explanation of why each item helps → continue/skip.

**Components:** inline text fields, country picker sheet, birthday picker, contact-method selection, small live profile map anchored beside or below form, privacy note.

**Interactions/states:** field focus is obvious; validate on blur/continue, not every keystroke. Country selection opens searchable sheet. When name/birthday/biometric details become valid, the profile identity node and relevant demographic details update. Optional information remains optional. Show keyboard-safe CTA and preserve scroll position.

**Motion:** on valid save, add one labeled signal to the map and draw a short line from identity; no decorative live graph while the user types invalid partial values. Animate new elements once, reduced-motion falls back to highlight/outline.

**Acceptance:** country, contact and birthday are handled clearly; edits persist; incomplete optional fields are not treated as zero or healthy.

### 1C. “What is part of your health?” focus cloud

**Hierarchy:** compact prompt and selected count → free-floating but stable word-cloud bubbles of major areas (e.g. blood pressure, cholesterol, sleep, heart, sugar, medicines, family history, joints, other) → selected areas → contextual “why this helps” → Continue / tell me in my own words.

**Components:** size-varied focus bubbles, accessible selected state, dynamic dependent-choice cloud or anchored branch card, “something else” text entry, removable selected chips, small profile map.

**Interactions/states:** tap selects/deselects; selecting cholesterol reveals related choices (lipid panel, LDL/HDL, medicine, routines) without navigating away. Selection creates a profile topic only after app state confirms it. Bubble size must not imply diagnosis severity. Removing a parent removes only its dependent unanswered choices; if durable facts exist under it, ask before removal. “Why?” opens a short explanation sheet.

**Motion:** immediate pressed scale, selected fill/outline, branch appears from the parent with restrained stagger; map node and typed edge update on persisted event; collapse follows parent removal. Do not permanently drift bubbles under text; if idle drift is used, keep it barely perceptible and stop offscreen/reduced-motion.

**Acceptance:** selection is immediately understandable; follow-ups are contextual; no selection is represented as a confirmed medical condition.

### 1D. First understanding / profile synthesis

**Hierarchy:** “Here’s what Nura has from you” → concise synthesis grouped into what user entered / focus topics / saved sources / unknown domains → source/status labels → edit, remove, add more, rephrase/correct → confirm starting profile.

**Components:** synthesis card, evidence/status chips, inline edit or source sheet, profile map, prominent **Looks right / Save this starting point** and **Edit something**.

**Interactions/states:** generated summary is derived from saved inputs only. User edit creates a new version or corrected fact, never silently overwrites. “Add more” returns to relevant scene. Confirm commits initial profile state. Model unavailable uses a transparent structured summary; it must not fake an LLM answer.

**Motion:** summary sections reveal gently; tap an item expands in place to source and exact value. On confirmation, selected map nodes settle and Home appears with a short continuation transition.

**Acceptance:** user can understand what is known, what is not known, where it came from, and correct it before accepting.

---

## 6. Story 2 — Build a Medical Registry / health wiki

### 2A. Registry overview

**Hierarchy:** “Your Medical Registry” + concise, evidence-backed overview → active focus/important recent changes → domain/topic list (conditions/concerns, labs/results, records, encounters; treatment links to Story 6) → review-needed count → add source / add a detail.

**Components:** compact editorial summary, topic rows, source-backed evidence cards, status filters (current/history/review), add-record action, contextual Ask.

**Interactions/states:** tap topic opens wiki page; tap review-needed goes directly to candidate review. Empty state says the registry is incomplete because nothing has been added, not because the user is healthy. Storage error preserves content and offers retry.

**Motion:** one leading card settles; dense rows use short nonrepeating stagger. Review count animates only when underlying count changes.

**Acceptance:** every fact can be traced to its input/source and evidence state.

### 2B. Topic wiki page

**Hierarchy:** topic title and current state → short plain-language synthesis with cited claim links → current facts distinct from historical/superseded facts → evidence/source list → explicitly stored related pages → open questions / missing records → Ask about this topic.

**Components:** summary card, claim chips, “Current / History” switch, evidence rows with date and source location, typed relationship list, compact Ask composer.

**Interactions/states:** tap any claim opens exact fact and original source location. Correction appends a version and marks prior value superseded. Suggested relationships are visually different from confirmed links and require confirmation. Stale summary state says “This summary needs refreshing” and falls back to structured facts.

**Motion:** summary expands in place; selecting evidence highlights the matching citation and opens preview as a sheet; path highlight is limited to selected relationship.

**Acceptance:** generated text is never the only storage location for a health fact; old values remain visible with valid dates.

### 2C. Source/evidence detail

**Hierarchy:** source title/type/date → captured claim(s) → page/region or timestamp → interpretation status and confidence → edit/confirm/reject → related facts.

**Components:** source viewer/thumbnail, page/region highlight, claim rows, status badge, review actions.

**Interactions/states:** original remains attached; source unreadable/unavailable has a recovery state. Candidate can be accepted, corrected then accepted, or rejected. No claim reaches confirmed registry without user action.

**Motion:** source preview expands from the evidence card; page/region highlight appears when source is available. Do not animate a false highlight when location extraction is absent.

**Acceptance:** user can jump from a registry assertion to the exact source evidence and back.

---

## 7. Story 3 — Build an Insurance Registry

### 3A. Add a policy

**Hierarchy:** explain what policy records unlock → select card/photo/PDF → choose who the policy covers → policy-period context → processing consent → status/progress.

**Components:** policy upload tile, document picker/camera, person selector, consent summary, processing-state row.

**Interactions/states:** possible duplicate policy asks user to compare; no automatic merge. Permission denied explains device setting and offers file picker. Upload failure retains local selection where possible. Active processing progress comes only from service events.

**Motion:** file enters intake tray and receives status chip; real queued/extraction events update progress. Never display parsed coverage before the extraction returns.

### 3B. Review extracted coverage

**Hierarchy:** policy source preview → extracted coverage claims grouped into benefits, limits, exclusions, providers, dates → confidence/review status and exact passage → accept/edit/reject each claim → accept reviewed policy.

**Components:** two-pane-on-wide or stacked-on-phone source-and-claim layout, passage highlight, amount/date rows, status badges.

**Interactions/states:** ambiguous wording/low confidence remains Needs review. “Not found” is distinct from “excluded.” Conflicting pages/values preserve both claims for resolution. For each accepted claim, maintain source location and valid period.

**Motion:** reveal claims in small grouped sequence only after service event; user acceptance changes badge and creates a confirmed entry in registry/timeline. Provide undo/review if appropriate.

### 3C. Insurance policy page and comparison

**Hierarchy:** policy status/date → key coverage terms → provider/benefit detail → selected health/care need → “What the documents support / What is unclear / Possible gap” → citations on both sides → questions to insurer.

**Components:** policy passport card, benefit rows, health-context citation, evidence-linked comparison, uncertainty callout, question draft action.

**Interactions/states:** comparison asks which profile/context to use if ambiguous. Unknown term never becomes a negative coverage decision. User can mark comparison item useful/incorrect and correct the plan. No definitive payment guarantee.

**Motion:** selected two-source comparison draws a contained connector between health evidence and policy passage; uncertainty label remains visible. Do not render a giant graph.

**Acceptance:** every comparison cites the policy and the selected confirmed health context; missing documents are explicit.

---

## 8. Story 4 — Explore a personalized health feed

### 4A. Feed

**Hierarchy:** contextual lead (“For your questions about…”) → primary relevant article/video → smaller editorial items → why this appears → source/date → save, dismiss, ask Nura.

**Components:** editorial media card with restrained visual, source metadata, relevance explanation chip, play button only when applicable, save/dismiss controls, topic settings.

**Interactions/states:** feed uses user-selected/confirmed context only, subject to personalization consent. User can inspect why and disable that context. No results state explains the query/context and offers adjust topics; network failure preserves saved items.

**Motion:** card entrance follows editorial hierarchy with 40–100 ms stagger. Media preview never autoplays. Save state gives restrained confirmation. Dismiss moves item away only after the user action, with undo.

### 4B. Article/video detail

**Hierarchy:** title and publisher/date → article or player → “Why Nura showed this” → source link and content type → concise Nura explanation/action → save/dismiss/ask.

**Components:** accessible media player, source card, relevance note, Ask composer.

**Interactions/states:** playback has idle/loading/playing/paused/complete/error. External source unavailable has retry/open source. Nura's explanation separates external education from personal health record.

**Motion:** player controls respond tactually; progress reflects real playback. Reduced motion disables ambient media motion, not controls.

**Acceptance:** user can identify source, publication date, personalization reason and manage feed relevance.

---

## 9. Story 5 — Grounded, agentic conversations

### 5A. Contextual composer and consent

**Hierarchy:** originating context (“About the lab result you opened”) → compact question field with sample prompts → send → scope sheet listing exact record categories/counts → consent action / cancel.

**Components:** in-place expanding composer, small real-state orb, category toggles, excluded-data list, source count, disclosure of model/service use, cancel and send.

**Interactions/states:** composer expands in place before full conversation only when needed; keyboard adjusts layout. Consent defaults follow product policy but user can inspect selections. Cancel sends nothing and closes cleanly. Context-scoped Ask carries only selected linked items. No files are included unless the file pipeline explicitly supports and the user consents to that run.

**Motion:** composer grows smoothly; sheet rises and tracks drag; selected categories use immediate checkbox/toggle feedback. Orb changes to listening only for active capture and thinking only after the confirmed request begins.

### 5B. Conversation with live milestones

**Hierarchy:** messages with clear speaker distinction → compact live activity card → evidence rows / clarification → answer and next actions → persistent composer.

**Components:** user/assistant message, activity milestone list, evidence chips/cards, clarification choice chips, error/retry panel, memory proposal card.

**Real event-to-UI contract:**

| Backend/app event | User-facing display | Orb state |
|---|---|---|
| consent confirmed / run started | “Starting with the information you selected” | Thinking/retrieving |
| authorized registry query started | “Looking through your selected records” | Thinking |
| source/evidence returned | “Found 2 records to compare” with evidence cards | Thinking, then responding when answer content starts |
| conflict or missing evidence returned | “These records don’t agree” / “I couldn’t find…” with source context | Responding |
| clarification required | Present one focused question and choices | Listening only while composer/capture is active; otherwise idle |
| answer content begins | Render actual answer stream and citations | Responding |
| run finished | Final cited response and next actions; activity collapses but can be expanded | Idle |
| run error/cancel | Preserve question, show completed steps and retry/edit | Error subdued, then idle when dismissed |

**Interactions/states:** tapping citation opens source; tapping a fact opens its wiki page; next-action chips route to real visit brief / save question / registry action. Model memory suggestion is proposed, never automatic. User approval performs the write and shows source/run attribution. Retry reuses the question but requires consent again if scope changed.

**Motion:** milestones enter as real events, short fade/slide only; no fake token spinner or delayed labels. Answer text may stream as returned but should avoid jitter and keep scroll controllable. On reduced motion use static status dots and short opacity changes.

**Acceptance:** every answer is supported by listed evidence or says why it cannot be answered; trace lists application actions, not private model reasoning.

---

## 10. Story 6 — Medicines and treatment

### 6A. Treatment registry

**Hierarchy:** current treatment summary → current / past / needs review sections → each item shows medicine/treatment, dose or schedule when recorded, reason, source, valid dates → add item.

**Components:** timeline-aware list row, status badge, source chip, “current / past / review” filters, add action.

**Interactions/states:** no medication list is explicitly empty/unknown, not “none.” A document-derived medication remains candidate until user review. Past medicine is retained and visually distinct; stop action requests date and preserves history.

**Motion:** list filters crossfade while retaining scroll; adding accepted treatment inserts dated item at top/current period with one short highlight. Avoid health-advice color semantics.

### 6B. Medicine/treatment detail and edit

**Hierarchy:** name and current/past status → recorded dose/timing and purpose → prescribed by / where obtained → source(s) and timeline changes → interactions with user-confirmed records, if supported → edit / mark past / ask.

**Interactions/states:** corrections append version; conflict between prescription and clinic note shows both with a conflict badge and resolution choice. Missing details are asked, not inferred. Reminder setup only uses user-confirmed instructions and must not advise starting/stopping/changing treatment.

**Motion:** history expands in place; source opens into sheet. Changing current/past animates status and timeline placement only after save succeeds.

**Acceptance:** a previous dose/instruction is not erased; Nura can retrieve confirmed context later.

---

## 11. Story 7 — Prepare for a visit and capture outcomes

### 7A. Visit home / upcoming visits

**Hierarchy:** next visit or “prepare for a visit” → recent visit history → associated clinic/team and source → prepare brief / add outcome.

**Components:** visit card, timeline entry, appointment details, add visit action.

**Interactions/states:** empty state offers add visit or create an unscheduled brief. Calendar permission is optional; denial does not block manual entry. Imported appointment is labeled by source.

### 7B. Brief builder

**Hierarchy:** visit purpose and date → suggested confirmed profile items grouped by type → why each may be relevant → user selection/removal → questions to ask → continue.

**Components:** selectable evidence rows, question composer, source opens, “not sure” section.

**Interactions/states:** user approves every item included. Candidate or disputed records are excluded by default or visibly flagged. Changing selection updates brief count. Brief generation is unavailable/error-safe and must not invent advice.

**Motion:** selected rows check and highlight; preview assembles from actual selected items with restrained stagger. Removing item retracts it from preview.

### 7C. Brief preview/share and post-visit outcome

**Hierarchy:** person/visit header → chosen health snapshot with sources → user's questions → share/export controls → after visit: notes/instructions/follow-up capture → review what becomes registry memory.

**Interactions/states:** share action shows destination/what leaves the app and requires confirmation. Post-visit text is user-entered unless linked to a clinician source. Extracted clinician instruction stays candidate until reviewed. Follow-up can become a dated event.

**Motion:** brief transforms from builder to preview with shared layout continuity; no automatic message sending. Save shows confirmation and timeline entry.

**Acceptance:** no unselected detail is included in the brief; follow-up and clinician instructions retain source and review status.

---

## 12. Story 8 — Timeline and connections

### 8A. Record History timeline (primary health-history surface)

**Hierarchy, top to bottom:**

1. Compact Nura brand/header with search/profile actions.
2. “Your health journey” / **Timeline** and one-line context.
3. Segmented **Timeline | Connections** control.
4. Filter chips (Everything, Documents, Care, Treatment, Vitals) and visible active filter.
5. Year/month header and captured-event count.
6. Dated vertical chronology: date rail → cobalt record node on blue rail → white record card.
7. Record card contains record title, concise detail, type badge, source/location chip, relationship/status chip, optional “What was captured” expansion.
8. Sticky contextual **Ask about this history** composer above bottom navigation.

**Record row/card:** date and month remain legible at left. The rail is thin and continuous. Each cobalt node uses an icon and optional distinct shape/inner glyph; category is also written on the card. Card content appears in this order: title, plain-language summary, source/date chip, related item chip, review/status badge, expandable captured values. Do not show all PDF text in the row.

**Interactions:** filter selection updates count and list; tapping card or node focuses both, expands the same card with captured values/source, then offers “View source”, “Connect”, and “Ask Nura”. Year navigator scrubber may move to a date group but is secondary and must not obscure chronology. Ask from selected record passes only record + explicitly linked accepted items into the consent UI.

**Motion:** node tap gets a brief scale/halo; matching card border/raised surface changes. Expanded details morph downwards while card's identity and date remain fixed. New confirmed record animates into its actual event-date position with a temporary outline, not necessarily the top. Filter changes short-crossfade and preserve year/month context. Rail remains stable. No auto-drawing all links through timeline.

**States:** no records → useful “Start with one piece of your story” plus Add record/manual detail. No records for selected filter → “No treatment records in this period” and clear filter. Records pending review remain marked. Storage error shows saved-vs-not-saved truth. Source unavailable does not remove record.

### 8B. Record detail

**Hierarchy:** title/type/status and event date → source date/import date distinction where relevant → captured fields/units → source page/region/time → linked records (typed) → history / corrections → Ask.

**Interactions:** “Same” opens existing record pair, asks user whether these are same record if uncertain; do not merge automatically. “Conflict” presents both claims and exact passages. “Replaces” marks prior item as superseded with effective date, preserves old value. “Whose?” holds item aside until owner is chosen. “New” means a new claim/source was identified, not automatically accepted.

**Motion:** source preview grows from selected record; exact page/region highlights only when available. Review action updates badge after persistence. Offer undo if safe.

### 8C. Connections mode

**Hierarchy:** mode title and explainer (“Links you made or reviewed”) → selected entity / search → one connection at a time or focused neighbor list → relationship label/source/time → open either endpoint.

**Interaction:** select record to emphasize its evidence path. Hide unrelated paths. Relationship detail explicitly says “mentioned together,” “measured during,” “prescribed at,” “user connected,” etc. Do not use line proximity, shared color or glowing edges to imply causation. Create connection sheet selects two existing items, user describes type, confirms, and saves attribution.

**Motion:** selected path draws once over roughly 350–600 ms; inactive lines fade to quiet gray; related endpoint cards highlight. Reduced motion uses static line + selected border. No pan/zoom graph as the default phone control unless it can be operated and read accessibly.

**Acceptance:** chronology clearly answers when; focused Connections clearly answers what was explicitly associated and why.

---

## 13. Story 9 — Bounded symptom support

### 9A. Symptom entry and clarification

**Hierarchy:** “What’s going on?” → free-text or guided symptom fields (when started, severity, relevant symptom options) → profile context use explanation/toggle → send / urgent action instruction.

**Components:** conversation composer, short structured follow-ups, contextual scope summary, urgent warning prompt available without chat.

**Interactions:** ask only focused safety-critical questions. If urgent warning signs appear, move directly to escalation state, never keep user in a long intake. Do not imply diagnosis based on profile similarity.

### 9B. Next-step response

**Hierarchy:** immediate safety instruction if indicated → short explanation and limits → user-supplied symptoms/context used → safe options (contact emergency/clinician, prepare notes, monitor if appropriate under approved policy) → source and save choice.

**Motion:** urgent screen uses direct transition and static prominent action; suppress orb breathing, shimmer and decorative waiting. Nonurgent response uses the same evidence-backed Ask states; only actual service events change activity.

**States:** service unavailable gives a truthful safe fallback and does not keep user waiting; no profile context states which information was not available. Save to history is an explicit user choice.

**Acceptance:** urgent signals cause fast, unambiguous escalation; product never claims diagnosis or delays care.

---

## 14. Story 10 — Family and caregiver boundaries

### 10A. People/profile switcher

**Hierarchy:** active person with avatar/name and clear “Viewing [person]” label → profiles user may access → add/invite person → permissions context.

**Interactions:** selecting another profile requires a deliberate switch and confirms the name before displaying records. Every Home, History, Ask, and Care screen retains the active-person indicator. No cross-profile data in retrieval context.

### 10B. Invitation, authority and consent

**Hierarchy:** person identity → relationship/authority explanation → requested access scopes → duration/review → invite/consent state.

**Components:** invitation card, record-category scopes, view/edit/share permissions as distinct capabilities, confirmation and revocation.

**States:** pending invite, declined, expired, accepted, revoked, service unavailable. Without real identity/auth/authorization, family sharing must be nonfunctional or a clearly labeled demo—not pretend-secure access.

### 10C. Family profile view

**Hierarchy:** family member's own profile summary → allowed registry/appointments/questions only → source/status → supported caregiver actions.

**Motion:** active profile change uses a small crossfade and name/avatar update; do not morph personal data across screen in a way that implies merging. Permission revocation removes access after confirmation, updates UI, and confirms event.

**Acceptance:** owner, actor, active person and permissions are clear in every action; records and AI context remain separated.

---

## 15. Story 11 — Understand and control personal information

### 11A. Data overview / “What Nura knows”

**Hierarchy:** profile facts, selected topics, uploaded sources, conversations/preferences, connections, shared people → count/status and source → filters (confirmed, needs review, inferred suggestion, expired) → export/delete controls.

**Components:** data-category list, state/status badge, source chips, purpose/usage detail, access log summary where available.

**Interaction:** tapping any item reveals exact value, source, who added it, confidence/review state, validity, linked summaries/pages and where it was used. Correction creates new version. Removing a fact explains effects on derived wiki pages.

### 11B. Consent and sharing controls

**Hierarchy:** current data-use permissions (AI, discovery, upload, family) → what each enables → enabled/disabled state → last used / active shares → revoke or change.

**Interaction/states:** per-run Ask consent stays distinct from persistent personalization consent. Withdrawal immediately prevents future use; describe consequences accurately. Family access scope is separately revocable. Failure to update server-side consent is explicit and recoverable.

### 11C. Export and deletion

**Hierarchy:** scope to export/delete → what included/retained → confirm identity if supported → irreversible confirmation → progress and completion receipt.

**Motion:** confirmation sheet is sober and predictable, without playful bounce. Progress only from actual service events. On success reflect deleted/exported state, refresh dependent pages, and give recoverable access to export file as applicable.

**Acceptance:** user can inspect source and use, correct/remove selected data, withdraw consent, export, or delete; no false “deleted everywhere” claim if backups/sync are not covered.

---

## 16. Record status visual language

The reference's labels require behavior, not just badge colors. Use text, icon/shape and color together:

- **New:** solid cobalt or teal-accent marker plus “New”; a source/claim was added.
- **Same:** neutral blue-gray or outlined chain/equal icon plus “Same”; possible duplicate or confirmed match is identified. Until confirmation, say “Possible same record.”
- **Conflict:** amber badge with warning shape plus “Conflict”; both claims remain available for review.
- **Replaces:** amber-outline/arrow badge plus “Replaces”; prior version is kept with a closed validity period.
- **Whose?:** peach/amber question badge plus “Whose?”; source held aside until profile owner is verified.
- **Needs review:** amber outline with readable label; do not use green.
- **Confirmed / Reviewed:** muted teal/green check and explicit text; avoid implying clinical verification if only user-confirmed.
- **Superseded / Past:** quiet gray treatment and date boundary; remains navigable.

The timeline's default event node stays cobalt and carries a category glyph; the status badge lives on the card. This keeps the timeline visually coherent while retaining status differences.

---

## 17. Multimodal intake and state-driven experience contract

These screens are design-ready but depend on real services. The UI must have an explicit service-event contract and must not simulate extracted information.

### Upload / intake state-to-motion

| Data event | UI state | Motion / feedback |
|---|---|---|
| file picker returns selected source | Selected-on-device tray with name/type/size | File card enters; no “analyzing” wording |
| metadata saved | Saved locally/on server accurately identified | Quiet check and source row appears |
| exact hash match | Possible exact duplicate with both source identities | Pair cards highlight; user compares; never auto-delete |
| perceptual image match | Possible visual duplicate / user confirmation | Side-by-side previews and explicit compare action |
| upload consent granted | Uploading/queued | Progress only if actual bytes/status are known |
| OCR/PDF extraction event | Extracting page N / candidate claims returned | Status row updates from events; source page opens |
| image OCR returned | Candidate claims with region, date and confidence | Region highlight only if coordinates are supplied |
| video/audio transcript events | Timestamped transcript/frames | Time chips navigate to actual source timestamp |
| candidate claims ready | Review queue | Claims appear with exact evidence, confidence, review controls |
| accept/edit/reject | Persisted decision | Badge and registry/timeline update only after save success |
| service error/cancel | Recoverable failure, candidate retained if safe | Stop progress, preserve source, retry/cancel choices |

### Source fidelity requirements

- Preserve original source; extracted data is a distinct set of candidate assertions.
- Exact duplicate detection uses content hash, not filename alone. Similar images prompt user comparison.
- PDF/image claims show page and region where possible; video/audio claims show timestamp.
- Conflicting units, dates, identity, or values must stop for review.
- No file content becomes confirmed profile memory automatically.
- UI says whether a file is only saved, currently being processed, or actually interpreted.

---

## 18. Persistent state, agent orchestration and design integration

The front-end states above should map to domain events/services rather than bespoke screen-only booleans. Define a contract for each capability with:

**user action → authorization/consent → domain command → source-backed result/event → persisted state → UI transition → acceptance check.**

Examples:

- Select “cholesterol” → persist chosen focus → emit focus-added → reveal related selections and update profile map.
- Accept a candidate blood result → validate source/location and user decision → append confirmed assertion + timeline event → update wiki-page dependencies → show new cobalt node at the record's event date.
- Ask about that result → collect explicit scope → retrieve permitted facts → emit retrieval/evidence events → stream cited answer → offer separately approved memory write.
- Replace a policy → store new validity interval, close prior policy validity, preserve both → update coverage wiki and timeline.

A project-level **integration lead/master coordinator** should own the screen-to-service mapping and integration queue. It watches the two parallel workstreams (A: whole-app UI/motion design; B: AI/data/multimodal foundations), checks their contracts, and chooses the correct integration milestone. This is distinct from Nura's runtime agent orchestrator, which handles user intent, permitted tools, retrieval and answer composition. Any prototype fixture should be labeled as a fixture and must not drive “real work” animations.

---

## 19. Review and acceptance gates

### Gate 1 — Whole-app design contract

Deliver before broad implementation:

- Screen map covering all 11 stories and major state variants.
- Mobile wireframes at target sizes, including the screens listed above.
- Reconciled light-record / ambient-orb palette, category and status tokens.
- Clickable prototype for Story 1, the record timeline, source review, and contextual Ask.
- Motion sheet or short capture demonstrating bubble branching, profile-map update, record expansion, connection focus, sheet drag, and AI event states.
- Accessibility, reduced-motion and failure/empty variants on representative screens.

**User review:** is the overall visual direction and story journey right? The user should not need to review implementation code or debug layout defects.

### Gate 2 — Design system and interaction prototype

- Shared mobile shell, typography, cards, nodes, source/status badges, bottom sheets and motion tokens implemented on representative routes.
- Check 360/390/430 pt widths, safe areas, keyboard, scrolling, bottom navigation and light/dark system behavior as supported.
- Tap every visible control; no dead-end UI.
- Verify reduced motion and screen-reader descriptions of status.

### Gate 3 — Story 1 profile

Review path: choose profile owner → add identity → select a focus → add a related detail → inspect map change → correct one entry → read first synthesis and confirm. Each save/error updates or preserves the map correctly.

### Gate 4 — Stories 2, 6 and 8 registry/history

Review path: create a self-reported fact or accept a source-backed candidate → find it in Registry → find it at the correct event date in Timeline → inspect source and values → switch to explicit connection → Ask about selected item. Exercise New/Same/Conflict/Replaces/Whose? statuses using synthetic data.

### Gate 5 — Story 5 grounded Ask and memory

Review path: select a source/context → inspect consent → cancel and verify nothing is sent; repeat and consent → observe actual milestones → inspect citations/unknowns → approve or reject suggested memory write → ask a follow-up and verify persisted context.

### Gate 6 — Stories 3 and 4 insurance/discovery

Review policy claim/source, unknown vs. exclusion, health/policy comparison, cited result; then feed relevance reason, source/date, save/dismiss and privacy controls.

### Gate 7 — Stories 7, 9, 10 and 11

Review visit selection/sharing/outcome; urgent and nonurgent symptom paths; family person/scope switch and separation; source inspection, correction, consent withdrawal, export and deletion behavior.

### Gate 8 — Whole-app sign-off

Walk end-to-end on a phone, verify all stories link through the same profile, registry, sources, timeline, Ask context and permissions. Check offline, unavailable service, retry, persistence after restart on supported platform, and that no visual progress claim lacks a real event.

At every gate, share the working app/prototype, screenshots and short interaction recording plus a short acceptance checklist. Internal QA precedes user review; the user validates experience, not build breakage.

---

## 20. Current app audit and design implications

Current routes in Nura include:

- Onboarding/profile-start in the root route.
- Tabs for Home, Health, Connect, Services and Profile.
- Separate Ask, intake and review routes.
- Shared FocusCloud, HealthHistory, Surface, Orb, ambient background and Nura state.

Implementation snapshot reviewed on 2026-09-23:

- The interactive storyboard for all eleven stories is available at [`NURA_STORYBOARD_PREVIEW.html`](NURA_STORYBOARD_PREVIEW.html). It is a design/interaction artifact, not a claim that each story's service is already connected.
- Onboarding/profile-start now has animated focus bubbles, dependent detail choices, a changing 720 profile map, optional current biometrics and privacy-aware browser preview messaging. First evidence-aware synthesis, completion/re-entry and account recovery remain incomplete.
- Health History uses the selected light canvas and cobalt record nodes/rails, with focusable event details and user-authored links. Full typed relationship navigation, source version history and conflict reconciliation remain incomplete.
- Ask and document review are connected to the loopback demo backend. Ask returns real model output grounded in the selected context and accepted claims; PDF/image extraction creates candidates that require user review. A partial policy comparison can use reviewed policy terms and selected health evidence, and feed search can use allowlisted health sources when explicitly enabled. Video analysis, complete policy version/navigation, and the full registry wiki remain incomplete.
- Native data is stored locally. Browser preview starts with synthetic content, keeps edits in memory only and resets on reload. It is not persistent browser storage and must not be used with real health or contact data.
- The app still needs to complete the dedicated insurance, feed and medicines/treatment journeys; visit export and scheduled follow-up; symptom support; caregiver profiles; and privacy controls. The story acceptance table is the current coverage source of truth.

### Design priority order

1. Use the linked storyboard as the shared visual and motion reference for all eleven stories.
2. Implement design and agent/data tracks in parallel against the same typed entities and event contract.
3. Integrate one complete vertical story at a time; require state, provenance, real service events, animation and recovery states before calling it connected.
4. Verify each flow internally with synthetic data and show the user a phone-sized screenshot and interaction recording only after the build is stable.
