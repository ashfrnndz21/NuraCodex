# Nura experience and interaction direction

## What the blueprint establishes

`Nura-Blueprint-v2.html` is the interaction and visual reference for the product. It describes a native-feeling, immersive mobile experience built around an atmospheric gradient, a persistent animated orb, dense evidence cards, and small interactions that unfold in place. This implementation should carry those patterns into a real app, not copy the HTML's illustrative health facts or claim its depicted services already work.

## Visual system

- **Atmosphere:** onboarding, profile synthesis, and Ask share one full-bleed plum-to-dusty-rose gradient (`#49345D → #A7798D → #493451`) with soft peach and lilac light. The orb uses the same cream, cyan, lilac, violet, and peach blend in every state.
- **Reading surfaces:** history, registries, care, and the feed use a pale lilac paper canvas (`#F3EEF4`), warm cream cards (`#FFFAF4`), and lilac secondary surfaces (`#F0E7F2`). This keeps long records easy to read while tying them to the immersive screens.
- **Color roles:** plum carries brand structure and primary controls on light surfaces; vivid cobalt (`#1769E8`) marks deliberate actions, source links, and record nodes where appropriate; teal (`#2B8178`), peach, orchid, and sage distinguish health domains. Keep status colors semantic: green only for genuinely complete/positive states and amber for attention. Avoid turning every node or link blue, and avoid using blue as a decorative wash.
- **Editorial feed:** public-source artwork blends soft blue, peach, and muted violet. Cards keep readable ink on paper; use the gradient for a featured visual, not as a background behind every article.
- **The orb:** a luminous layered gradient, subtle breathing at rest, and a soft halo. It remains the same component in onboarding, the composer, processing and response surfaces.
- **Type:** friendly rounded sans-serif for most content, with light editorial display type and selective italic/serif emphasis. Compact labels and metadata support high information density without making body copy tiny.
- **Cards:** one reusable surface language with meaningful variants for insight, reminder, metric, record/document, media, recommendation, action, and alert. A few primary cards lead; secondary and tertiary cards can be information-dense but quieter.
- **Density:** show the important health picture, next actions, and domain map together. Keep details scannable, source-linked, and expandable. The first screen should feel rich and specific, not like a sparse splash page.

## 720 profile entry

Keep a visible 720 constellation/map on the initial profile screen. It should show the profile domains from the beginning and visibly respond as the person adds information. Distinguish selected topics, user-entered details, saved source documents, and reviewed facts by shape/label/status; do not make an unreviewed selection look like a diagnosis.

The conversation can advance one focused question at a time inside this dense visual frame: who the profile is for, name and personal details, then health areas with a floating word-cloud/bubble interaction. Selecting a topic can reveal relevant follow-up choices; deselection removes it and its dependent unanswered branch. Preserve free text and “why are you asking?” paths. Provide skip/continue controls without implying that blank domains are healthy or complete.

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
- Topic bubbles drift gently and respond to selection. The profile map gains a node only after a real profile event.
- Cards reveal supporting details in place; a document card may morph into its report detail; bottom sheets can be dismissed by drag and return to their resting point on a short drag.
- A media card has truthful idle/loading/playing/paused/complete/error states; nothing autoplays.
- Honor OS reduced-motion preferences by replacing movement with stable state and instant/short opacity changes.

Animation is not evidence of intelligence. A loader, state label, count-up, progress line, or orb change must be driven by the underlying persisted state or a real service event. Never play through fake extraction or delayed sample results.

## Implementation gate

The blueprint's fictional names, diagnoses, measurements, medicines, providers, insurance terms, answers, and recommendations are design examples only and must never become seeded user health data. Some backend-dependent journeys now have local demo services: Ask, consent-gated PDF/image extraction, policy comparison, and public health search. Show their active states only while the corresponding service is actually running, and label the local-demo boundary. The browser preview uses synthetic in-memory state; native persistence uses the on-device encrypted database. Production identity, cloud storage, account-level privacy controls, and clinical governance are not connected, so real health data must not be used in the local demo.
