# Repository structure and source map

**Reviewed:** 5 October 2026  
**Purpose:** show where the running app, shared logic, local service, tests, fixtures, and product references live. This is a map of the current checkout, not a claim that every planned product capability is complete.

## Start here

- [`../AGENTS.md`](../AGENTS.md) is the Expo and repository working guide. [`../CLAUDE.md`](../CLAUDE.md) points to it.
- [`AGENT_BACKEND.md`](AGENT_BACKEND.md) explains local preview setup, environment configuration, service behavior, and demo limitations.
- [`NURA_BUILD_AUDIT.md`](NURA_BUILD_AUDIT.md) is the most recent consolidated implementation and verification snapshot in this checkout (4 October 2026).
- [`USER_STORY_ACCEPTANCE.md`](USER_STORY_ACCEPTANCE.md) defines the eleven story criteria. Its coverage snapshot is dated 2 October, so use the later build audit for newer status evidence.
- [`NURA_BUILD_BOARD.md`](NURA_BUILD_BOARD.md) is the chronological work log. Older checkpoints are history; they do not replace the latest audit.

## One canonical Nura repository

The repository root shown by Git is the one home for the Nura app, service, tests, synthetic fixtures, and project documentation. In Codex, open this local folder as the Nura project and start future Nura tasks from that project. This keeps task history associated with the Nura checkout; it does not move or copy the repository. `SingleIDContext` is a different project and stays separate.

At the start of this cleanup, the canonical checkout on `codex/m1-event-date-integrity` contained 286 changed paths (125 modified, 158 untracked, three deleted). The accumulated work is being reviewed and separated into feature-sized commits. Existing edits are preserved; a large status count alone is not evidence that files are obsolete. The earlier cleanup review found no generated/temp-file batch and found the main directories aligned with their runtime roles. All 122 remaining test files are referenced by at least one npm test script. `server/ports/SourceRepository.mjs` remains a documented architectural placeholder pending a port-design decision.

### Whole-repository cleanup assessment — 5 October 2026

The existing folder layout already gives Nura one clear repository home. The current cleanup is about making the accumulated work reviewable and proving each file's role, not moving app code into another nested directory.

- **Runtime layout:** route screens are in `app/`; shared UI, domain logic, state, and utilities are in `src/`; service orchestration is in `server/agent/`; external capabilities are separated into `server/ports/` and `server/adapters/`. The package entry is `expo-router/entry`.
- **Initial change inventory:** the 286-path working set was grouped by runtime area in Git and is now being reviewed as feature slices (Ask/conversation, health registry/markers, document intake/insurance, Explore/media, profile/setup, privacy/data lifecycle, and shared app/runtime/config/docs). Keep each slice's implementation, tests, and acceptance evidence together when reviewing and committing; do not relocate files just to make the status list look smaller.
- **Test discoverability:** all 123 `*.test.*` files under `app/`, `src/`, and `server/` are mentioned by at least one package script. `npm run test:repo` is the broad suite; smaller named scripts are for focused areas.
- **Documentation ownership:** this map explains repository structure; `NURA_BUILD_AUDIT.md` owns the newest consolidated status; `USER_STORY_ACCEPTANCE.md` and `NURA_COMPLETE_BUILD_SCOPE.md` own acceptance; `EXPERIENCE_DESIGN_SPEC.md` owns interaction direction; `NURA_BUILD_BOARD.md` and `NURA_DELIVERY_TIMELINE.md` are dated history/targets. Older snapshots remain historical evidence, not competing current status pages.
- **Confirmed cleanup:** removed `App.tsx` and `index.ts`, the unused Expo starter bootstrap pair. `package.json` selects `expo-router/entry`, and the only repository reference to `App.tsx` was from that unused `index.ts`. Keep `SourceRepository.mjs` until its port ownership is resolved. Keep the documented sample PDFs and historical design/build documents.

This cleanup is complete only after the initial 286 paths have been assigned to reviewed feature slices, each slice has focused verification, and the status docs reflect verified results. That review/commit slicing is still in progress; the counts above are an inventory, not a claim that every change has passed acceptance.

### Required workflow for current and future changes

1. Open the Nura project in Codex and confirm the Git root before editing. Do not start Nura work from `SingleIDContext`, a downloaded ZIP, or a second Nura copy.
2. Inspect the existing working-tree changes first. Keep unrelated edits intact; do not bulk reset, clean, move, stage, or commit them.
3. Make one feature slice with a clear owner, files, acceptance behavior, and relevant test script. Keep files in the current route/component/service/state/server layout unless runtime evidence shows a structural change is needed.
4. Verify imports, Expo platform resolution, routes, package scripts, documentation links, and runtime use before deleting or moving a file. Add a new test to the repository test command, not only as an unreferenced test file.
5. Run the relevant tests plus typecheck and lint, inspect the focused diff, then update the latest audit and work board with evidence and any open items. Keep historical checkpoints labeled by date.
6. Only after the current edits are mapped and reviewed should they be staged or committed as separate feature-sized changes. Future work should use the same rule so one huge mixed commit does not accumulate again.

The project is not considered “clean” merely because files are grouped into folders. Cleanup is complete when each retained file has a clear runtime, test, fixture, or documentation role; obsolete files have verified zero use; build/test scripts cover the relevant checks; and the current changes are traceable to small reviewed feature slices.

## Code map

| Location | Role | How it is used |
|---|---|---|
| `app/` | Expo Router screens and route layouts | The running route root is the repository-level `app/` directory. `app/(tabs)/` contains the main tabs. Keep routes here; do not move them to `src/app/` without changing and verifying Expo Router configuration. |
| `src/components/` | Shared screen components and platform-specific views | Routes import these components. `.web.tsx` and `.native.tsx` files are platform implementations resolved by Expo; they can appear unused in a plain text import scan. |
| `src/services/` | Shared domain rules, screen presentation helpers, and app-to-service clients | Most `.mjs` modules have adjacent `.test.mjs` files. `.d.mts` declarations provide types when TypeScript imports shared `.mjs` modules. |
| `src/state/` | Shared app state and persistence adapters | `NuraContext.tsx` connects UI state to native SQLite or browser persistence helpers. `browser*` and persistence `*.mjs` files are used by their adjacent tests and state provider. |
| `src/utils/` | Cross-screen utilities | Date parsing and other small shared helpers are imported by app and service code. |
| `server/index.mjs` | Local development API entry point | Started by `npm run agent:dev` and the integrated `npm run web` preview. |
| `server/agent/` | Request orchestration, evidence selection, validation, and use-case logic | The API composes these units for Ask, intake, feed, and profile-summary paths. |
| `server/ports/` | Backend capability boundaries | Adapter-independent contracts belong here; tests beside ports cover contracts where provided. |
| `server/adapters/` | Local-demo, model, media, and public-source implementations | `server/adapters/index.mjs` composes the adapters used by the orchestrator. Provider credentials remain server-side. |
| `scripts/` | Development launchers and acceptance/evaluation runners | These are invoked by `package.json` scripts; they are not app routes. |
| `assets/` | App icons and intentional synthetic sample documents | `assets/samples/README.md` explains the fictional report sample. Bundled PDFs are referenced by the intake flow, fixture registry, or acceptance tests and must remain available. |
| `docs/` | Product decisions, architecture, design, acceptance, and work history | See the reference index below. Historical snapshots should not be read as current runtime behavior. |

## Product and design references

- **Runtime instructions:** `AGENT_BACKEND.md`.
- **Latest state and test evidence:** `NURA_BUILD_AUDIT.md`; check its date before using it.
- **Acceptance contract:** `USER_STORY_ACCEPTANCE.md` and `NURA_COMPLETE_BUILD_SCOPE.md`. The scope document contains an older checkpoint near its top; its acceptance criteria remain useful, while the build audit is newer for implementation status.
- **Ongoing history:** `NURA_BUILD_BOARD.md` and `NURA_DELIVERY_TIMELINE.md`. These contain dated reports and planned dates; treat missed or past dates as historical.
- **Design:** `EXPERIENCE_DESIGN_SPEC.md` is the current interaction direction. `NURA_MOBILE_STORYBOARDS.md` and the two HTML storyboard files are design/review artifacts; implementation snapshots embedded in them are dated and can be stale.
- **AI/data architecture:** `INTELLIGENCE_AND_MEMORY.md` and `NURA_AGENTIC_FOUNDATION.md` describe intended boundaries and the local-demo foundation. Verify concrete current behavior against `AGENT_BACKEND.md` and source.
- **Pause/resume notes:** `NURA_PAUSE_RESUME.md` records a September handoff and older checks; it is not the current handoff state.

Several documents intentionally cover the same product from different angles: design, architecture, acceptance, and dated progress. They are references, not multiple runtime specifications. Avoid moving or deleting them until their links and historical decisions are reconciled in a separate docs consolidation.

## Verified orphan and open cleanup item

- `src/components/FocusCloud.tsx` was an unused earlier focus-selection prototype: no route, component, script, or test imported it. The live focus-area UI is implemented in `app/index.tsx`, so the orphan component has been removed.
- `server/ports/SourceRepository.mjs` currently has no import sites or conformance test. It looks like an architectural placeholder; it is retained because its intended replacement/removal should be decided alongside the backend port design, not guessed during a structural cleanup.
- Platform-specific component files and `.ts` wrappers next to `.mjs` logic are not treated as orphans: Metro/TypeScript platform resolution or a React Native-specific adapter uses them.

## Routine checks

Run `npm run typecheck`, `npm run lint`, and the relevant `npm run test:*` script for the changed area. `npm run test:repo` is the broad local suite. Browser rehearsals are `npm run test:m1-browser` and `npm run test:m1-connected-upload`; live-provider evaluation is `npm run eval:live-ai` and requires valid server-only credentials. These are different levels of evidence: synthetic tests do not establish live provider quality or production readiness.
