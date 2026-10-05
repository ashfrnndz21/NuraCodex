# Nura experience and interaction direction

## What the blueprint establishes

`Nura-Blueprint-v2.html` is the interaction and visual reference for the product. It describes a native-feeling, immersive mobile experience built around an atmospheric gradient, a persistent animated orb, dense evidence cards, and small interactions that unfold in place. This implementation should carry those patterns into a real app, not copy the HTML's illustrative health facts or claim its depicted services already work.

## Visual system

- **Atmosphere:** onboarding, profile synthesis, Home’s profile hero, and Ask share a full-bleed plum-to-dusty-rose gradient (`#48335C → #B27D91 → #453152`) with soft peach and lilac light. Identity entry fields sit on warm paper (`#FFFBF7`) so they read clearly against the gradient. The orb uses the same cream, cyan, lilac, violet, and peach blend in every state.
- **Reading surfaces:** history, registries, care, and the feed use a lilac-paper canvas with warm translucent cream and lilac cards. Use shared frosted fills, bright top edges, and soft category light so the background remains visible around and faintly through cards. Inputs and long-form evidence can use a more opaque warm surface when that protects readability; avoid pure-white blocks as the default card treatment.
- **Color roles:** plum carries brand structure and primary controls on light surfaces; vivid cobalt (`#1769E8`) marks deliberate actions, source links, and record nodes where appropriate; teal (`#2B8178`), peach, orchid, and sage distinguish health domains. Keep status colors semantic: green only for genuinely complete/positive states and amber for attention. Avoid turning every node or link blue, and avoid using blue as a decorative wash.
- **Editorial feed:** public-source artwork blends soft blue (`#C0DDF2`), peach (`#EBC3B6`), and muted violet (`#7C7199`). Selected topic chips and deliberate source actions use vivid cobalt. Cards keep readable ink on paper; use the gradient for a featured visual, not as a background behind every article.
- **The orb:** a luminous layered gradient, subtle breathing at rest, and a soft halo. It remains the same component in onboarding, the composer, processing and response surfaces.
- **Type:** friendly rounded sans-serif for most content, with light editorial display type and selective italic/serif emphasis. Compact labels and metadata support high information density without making body copy tiny.
- **Cards:** one reusable glass surface language with meaningful variants for insight, reminder, metric, record/document, media, recommendation, action, and alert. Use clear, saturated category marks with light glyphs for quick recognition, then reserve tinted glass for the larger card. A few primary cards lead; secondary and tertiary cards can be information-dense but quieter.
- **Density and polish review:** show the important health picture, next actions, and domain map together without repeating the same count or explanation in adjacent sections. Periodically audit every flow for foreground/background contrast, brand consistency across logo, buttons, badges and icons, text hierarchy and emphasis, line length, spacing, and unnecessary content. Use translucent tiles to group related content; keep all text comfortably readable over the actual surface and do not let decoration compete with evidence.

## 720 profile entry

**Approved direction — evidence-first profile overview.** Replace the onboarding orbit/rays with a clear overview on the health-area step. Keep the Blueprint v2 plum-to-rose scene and use a translucent plum-glass overview, with warm cream type and bright, contrasting category marks. Carry the same glass cues into Home and every registry: layered translucency, luminous edges, and controlled lilac, peach, blue, teal, and orchid accents. Do not place a large opaque cream panel on the immersive background. Keep inputs and long-form record reading on stable warm surfaces where they improve legibility. Never draw a connection from a selected topic to the profile as if it were a medical finding.

The step begins with profile identity and status, followed by truthful counts for selected context signals and grouped record sources. Main areas appear once in a circular bubble grid; choosing one opens its related-context sheet, and a selected bubble reopens that sheet. Remove an area from the sheet. Show up to three record groups only when saved sources exist, with names, linked reviewed details, dates and honest states such as “Source linked” or “File saved.” Group extracted facts under their original source to avoid duplicate-looking cards. Fixture prefixes and file extensions stay out of the overview title; the original filename remains available in source details. Keep the overview useful when empty, without an unnecessary empty record panel, invented dates, diagnoses, review queues or completeness claims.

Selecting a main area expresses interest in following it. Explicit context bubbles may also record the person’s report—for example, “I have a diagnosis or condition”—alongside symptoms, medicines, treatment, or care. Keep those self-reported signals distinct from source evidence and clinically verified facts. Exact details can be entered in the shared note/file intake and become profile facts only after the user saves or approves them. Provide skip/continue controls without implying that blank domains are healthy or complete. Opened details, selected/deselected state and record sources must preserve their existing data semantics. Present main areas as small circular topic bubbles; selecting one opens its related context choices. Keep selected areas in that one bubble grid instead of repeating them in a second list. The context sheet offers a visible remove action and may use translucent category tiles for longer labels.

**Context expansion motion:** fade in the scrim, then start the context sheet about 65 ms later with a short upward rise and restrained spring settle; bring expanded category choices in with a smaller fade/slide. Closing reverses the same motion. This makes the cause-and-effect of selecting an area legible without staging a long show. The OS reduced-motion preference keeps the same content and state changes while removing the spatial travel.

**Health record intake:** use the shared lilac-paper canvas, warm cream cards, dark plum/charcoal text and a cobalt primary review action. Keep context in one selected-area tile. The health note stays optional and collapsed until requested; when a selected area already supplies context, do not repeat the same area and signal chips inside the note editor. In the sample preview, the two synthetic PDFs are an explicit January-to-April comparison set; show the dates and comparison purpose, and keep this sample optional beside camera/file/photo choices. Do not add a second general reassurance card that repeats the file-review consent. Use translucency to group a category, with opaque-enough fill and text contrast for comfortable reading.

After the initial pass, show a concise synthesis with visible source/status cues and clear edit/add/correct actions. Only regenerate it from saved user input or reviewed evidence. A generated synthesis is a view of the profile, not the source of truth.

## Core journeys from the blueprint

1. **Arrive and establish the person:** welcome, secure account entry when built, choose self vs. caregiver, introduce privacy, gather identity and initial focus areas.
2. **Bring in records:** camera, one file, or multiple images/documents/videos. Show each item’s actual processing state. The current preview can stage files, ask once for explicit consent, and use real local events for bundled synthetic PDF examples; the connected ordinary-upload path is separately consented. Stop at source-linked suggestions for user review, and never turn a sample trace into evidence that an external provider ran.
3. **Review and connect evidence:** concise result rows with exact source location, units, dates, conflicts, and actions to accept, edit, or reject. A confirmed record can open into details through a shared-element-style transition. Local consented PDF/image extraction and source-linked claim review are partially implemented; item-level review, full batch re-entry, and device acceptance remain open.
4. **Everyday Home and Health:** one current, evidence-backed focus; next action; record list; source/date cues; the inline Ask composer. Empty states should tell the person what is missing and how to add it. Error states should recover without losing locally held data.
5. **Ask and follow up:** composer expands in place over the current screen, carrying context with it. The response can offer evidence, a clarifying question, and action chips; a full conversation opens only when the person continues. Until a grounded AI service exists, the app must not simulate a reply.
6. **Medicines, care, insurance and discovery:** registry pages and timelines built from actual sources. Coverage comparisons cite policy text and the health evidence used. Discovery items show why they appear, publisher, date, and source. Family sharing stays disabled until identity, consent, and access-control services exist.
7. **Safety and accessibility:** urgent flows must prioritize a clear action and suppress decorative waiting. Every state has text equivalents, useful tap targets, reduced-motion behavior, and readable contrast.

## Home briefing contract

Home is the person’s health brief after setup, not another onboarding chooser. Lead with the newest saved, approved health information or a Nura summary the person actually created and saved. Show its date and source. A saved summary must carry its saved date and a clear route to inspect the linked evidence; do not imply freshness when it has not been checked. Show a review action only when a real item is waiting. Do not fill the brief with generic “Nura’s view” cards, setup prompts, empty registry counts, or invented activity.

For a new profile, state plainly that no health record has been added and offer one first-record action. Setup height and weight remain profile context; they are not recent readings or health activity. Followed areas appear lower on Home as navigation shortcuts, never as the brief’s main activity or a required next step.

Use the available evidence to choose the chart: one dated reading is a starting point with its source and no personal baseline; two comparable readings show the two observed values and their difference without calling either a baseline; three or more dated, comparable readings may use a compact observed trend. Always show the dates and units, and never extend the chart into a forecast. Do not calculate a health score.

## Motion and touch language

Centralize motion durations, easing/spring choices, press scale, stagger timing, card entry, sheet movement, and orb state animation as named tokens. Buttons and tappable cards share consistent tactile press feedback. Staggers should be faster in long dense lists and slower when a few important insights arrive.

Use purposeful motion:

- Orb breathing at idle; listening halo only when capture is genuinely active; thinking only while a service job is running; response state only while real content is arriving; error state only after a failed job.
- Topic choices respond to selection with the shared press/selection feedback; the overview counts change from saved app state. Record cards appear only from actual profile records and retain their source grouping.
- Cards reveal supporting details in place; a document card may morph into its report detail; bottom sheets can be dismissed by drag and return to their resting point on a short drag.
- A media card has truthful idle/loading/playing/paused/complete/error states; nothing autoplays.
- Honor OS reduced-motion preferences by replacing movement with stable state and instant/short opacity changes.

Animation is not evidence of intelligence. A loader, state label, count-up, progress line, or orb change must be driven by the underlying persisted state or a real service event. Never play through fake extraction or delayed sample results.

## Health explanations and AI conversation presentation

Use the supplied health and AI interface references as composition guidance, not as a source of clinical claims. The useful pattern is a concise, readable result with supporting evidence close at hand:

- Start with a plain-language heading and a short answer. Break the rest into small, named sections such as **What your record shows**, **What this can mean**, **What is unclear**, and **Sources**. Keep a longer explanation collapsed until the person asks to read it.
- Keep the first evidence view to at most three distinct cited items, each with its date/source and a compact excerpt. If more evidence was cited, use one accessible “Show more sources” disclosure; keep every cited item reachable and avoid repeating the same source in multiple sections.
- Give every personal claim its value, unit, date, source and review state. Make a source action easy to find. Distinguish a measured fact from an educational explanation and from an unknown; do not turn an area selection into a diagnosis. If the person explicitly selects a diagnosis/condition context signal, label it as user-reported until supported and reviewed against a source.
- Use small translucent or tinted cards to group related information and follow-up actions. Keep the text on a stable high-contrast surface; translucency is decorative and never reduces readability. Pair status color with words or icons.
- Show analysis as a short sequence of real work, such as **Checking your permission**, **Reading report 1 of 2**, and **Preparing your review**, only when the service emits those events. Do not invent source counts, show hidden model reasoning, or keep a thinking animation running after the operation ends. Provide clear stopped, failed and waiting states with a next action.
- Use trends only when multiple dated, comparable measurements support them. Do not predict future values or present an overall health score without a validated method and appropriate review. Write neutral explanations; do not copy the mockups' personal treatment recommendations.
- Keep the main explanation scannable on a phone. A result card should answer “what did you find?”, “where did it come from?”, and “what should I review?” before asking someone to read a long narrative.

The supplied references support a warm paper/plum visual language, restrained category colors, grouped evidence, compact explanations and visible source context. They do not establish that Nura has processed real lab markers or that any depicted recommendation is clinically valid.

## Insurance Registry — approved direction B: Policy Dossier

Use the dossier as the primary view for each saved policy. Lead with the plan or insurer details the person approved, each linked to its source wording; keep the policy file name and review history visible. Follow with organized benefits and limits, explicit exclusions, wording to confirm, and details not found in the approved summary. Clearly distinguish user-approved extraction from verified insurer status or claim eligibility. Missing information stays unknown, never an exclusion. Keep policy versions and comparisons separate unless the person explicitly links a replacement. The mobile hierarchy should show the dossier before aggregate counters, with long term lists progressively disclosed.

## Implementation gate

The blueprint's fictional names, diagnoses, measurements, medicines, providers, insurance terms, answers, and recommendations are design examples only and must never become seeded user health data. Some backend-dependent journeys now have local demo services: Ask, consent-gated PDF/image extraction, policy comparison, and public health search. Show their active states only while the corresponding service is actually running, and label the local-demo boundary. The browser preview uses synthetic in-memory state; native persistence uses the on-device encrypted database. Production identity, cloud storage, account-level privacy controls, and clinical governance are not connected, so real health data must not be used in the local demo.
