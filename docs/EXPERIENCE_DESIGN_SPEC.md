# Nura experience and interaction direction

## What the blueprint establishes

`Nura-Blueprint-v2.html` is the interaction and visual reference for the product. It describes a native-feeling, immersive mobile experience built around an atmospheric gradient, a persistent animated orb, dense evidence cards, and small interactions that unfold in place. This implementation should carry those patterns into a real app, not copy the HTML's illustrative health facts or claim its depicted services already work.

## Visual system

- **Atmosphere:** onboarding, profile synthesis, Home’s profile hero, and Ask share a full-bleed plum-to-dusty-rose gradient (`#48335C → #B27D91 → #453152`) with soft peach and lilac light. Identity entry fields sit on warm paper (`#FFFBF7`) so they read clearly against the gradient. The orb uses the same cream, cyan, lilac, violet, and peach blend in every state.
- **Reading surfaces:** history, registries, care, and the feed use a visibly lilac-paper canvas (`#EDE5EF`), warm cream cards (`#FFFBF7`), and a deeper lilac secondary surface (`#E8DEEB`). Keep the canvas distinct from the cards so long records do not flatten into a white page.
- **Color roles:** plum carries brand structure and primary controls on light surfaces; vivid cobalt (`#1769E8`) marks deliberate actions, source links, and record nodes where appropriate; teal (`#2B8178`), peach, orchid, and sage distinguish health domains. Keep status colors semantic: green only for genuinely complete/positive states and amber for attention. Avoid turning every node or link blue, and avoid using blue as a decorative wash.
- **Editorial feed:** public-source artwork blends soft blue (`#C0DDF2`), peach (`#EBC3B6`), and muted violet (`#7C7199`). Selected topic chips and deliberate source actions use vivid cobalt. Cards keep readable ink on paper; use the gradient for a featured visual, not as a background behind every article.
- **The orb:** a luminous layered gradient, subtle breathing at rest, and a soft halo. It remains the same component in onboarding, the composer, processing and response surfaces.
- **Type:** friendly rounded sans-serif for most content, with light editorial display type and selective italic/serif emphasis. Compact labels and metadata support high information density without making body copy tiny.
- **Cards:** one reusable surface language with meaningful variants for insight, reminder, metric, record/document, media, recommendation, action, and alert. A few primary cards lead; secondary and tertiary cards can be information-dense but quieter.
- **Density:** show the important health picture, next actions, and domain map together. Keep details scannable, source-linked, and expandable. The first screen should feel rich and specific, not like a sparse splash page.

## 720 profile entry

**Approved direction — evidence-first profile overview.** Replace the onboarding orbit/rays with a clear overview on the health-area step. Keep the Blueprint v2 plum-to-rose scene, but use a warm-paper overview card that distinguishes chosen focus areas from saved evidence. Never draw a connection from a selected topic to the profile as if it were a medical finding.

The step begins with profile identity and status, followed by truthful counts for focus areas, selected detail preferences, and grouped record sources. Focus-area rows open their own detail editor; the selector below adds or removes areas. Show up to three record groups with source names, linked reviewed details, dates and honest states such as “Source linked” or “File saved.” Group extracted facts under their original source to avoid duplicate-looking cards. Fixture prefixes and file extensions stay out of the overview title; the original filename remains available in source details. Keep the overview useful when empty, without invented dates, diagnoses, review queues or completeness claims.

Selecting a topic remains a tracking preference, never a diagnosis or record. Detail preferences remain attached to their topic; record upload and plain-language notes stay a separate next step. Provide skip/continue controls without implying that blank domains are healthy or complete. Opened details, selected/deselected state and record sources must preserve their existing data semantics.

After the initial pass, show a concise synthesis with visible source/status cues and clear edit/add/correct actions. Only regenerate it from saved user input or reviewed evidence. A generated synthesis is a view of the profile, not the source of truth.

## Core journeys from the blueprint

1. **Arrive and establish the person:** welcome, secure account entry when built, choose self vs. caregiver, introduce privacy, gather identity and initial focus areas.
2. **Bring in records:** camera, one file, or multiple images/documents/videos. Show each item’s actual processing state. Today, only selection and local persistence are live; future reading must progress through real backend events and stop at a user review screen.
3. **Review and connect evidence:** concise result rows with exact source location, units, dates, conflicts, and actions to accept, edit, or reject. A confirmed record can open into details through a shared-element-style transition. The app currently has no extraction results to show.
4. **Everyday Home and Health:** one current, evidence-backed focus; next action; record list; source/date cues; the inline Ask composer. Empty states should tell the person what is missing and how to add it. Error states should recover without losing locally held data.
5. **Ask and follow up:** composer expands in place over the current screen, carrying context with it. The response can offer evidence, a clarifying question, and action chips; a full conversation opens only when the person continues. Until a grounded AI service exists, the app must not simulate a reply.
6. **Medicines, care, insurance and discovery:** registry pages and timelines built from actual sources. Coverage comparisons cite policy text and the health evidence used. Discovery items show why they appear, publisher, date, and source. Family sharing stays disabled until identity, consent, and access-control services exist.
7. **Safety and accessibility:** urgent flows must prioritize a clear action and suppress decorative waiting. Every state has text equivalents, useful tap targets, reduced-motion behavior, and readable contrast.

## Motion and touch language

Centralize motion durations, easing/spring choices, press scale, stagger timing, card entry, sheet movement, and orb state animation as named tokens. Buttons and tappable cards share consistent tactile press feedback. Staggers should be faster in long dense lists and slower when a few important insights arrive.

Use purposeful motion:

- Orb breathing at idle; listening halo only when capture is genuinely active; thinking only while a service job is running; response state only while real content is arriving; error state only after a failed job.
- Topic choices respond to selection with the shared press/selection feedback; the overview counts change from saved app state. Record cards appear only from actual profile records and retain their source grouping.
- Cards reveal supporting details in place; a document card may morph into its report detail; bottom sheets can be dismissed by drag and return to their resting point on a short drag.
- A media card has truthful idle/loading/playing/paused/complete/error states; nothing autoplays.
- Honor OS reduced-motion preferences by replacing movement with stable state and instant/short opacity changes.

Animation is not evidence of intelligence. A loader, state label, count-up, progress line, or orb change must be driven by the underlying persisted state or a real service event. Never play through fake extraction or delayed sample results.

## Implementation gate

The blueprint's fictional names, diagnoses, measurements, medicines, providers, insurance terms, answers, and recommendations are design examples only and must never become seeded user health data. Some backend-dependent journeys now have local demo services: Ask, consent-gated PDF/image extraction, policy comparison, and public health search. Show their active states only while the corresponding service is actually running, and label the local-demo boundary. The browser preview uses synthetic in-memory state; native persistence uses the on-device encrypted database. Production identity, cloud storage, account-level privacy controls, and clinical governance are not connected, so real health data must not be used in the local demo.
