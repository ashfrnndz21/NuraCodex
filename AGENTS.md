This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Canonical repository and change hygiene

- This Git checkout is the canonical Nura codebase. Start Nura tasks from the repository root and confirm the root with `git rev-parse --show-toplevel` before editing. Do not create another Nura copy, unpack an older ZIP over this checkout, or move Nura files into a different repository.
- `SingleIDContext` is a separate codebase. Keep its files, history, tasks, and project entry separate from Nura.
- Before editing, inspect `git status --short`. Preserve existing user changes; never reset, clean, stage, or commit the whole workspace as a shortcut. Work on one feature slice at a time and review only the files that slice changes.
- Use [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md) for the code map and contributor workflow. Use [`docs/NURA_BUILD_AUDIT.md`](docs/NURA_BUILD_AUDIT.md) for the latest verified state, [`docs/NURA_BUILD_BOARD.md`](docs/NURA_BUILD_BOARD.md) for dated progress, and [`docs/USER_STORY_ACCEPTANCE.md`](docs/USER_STORY_ACCEPTANCE.md) plus [`docs/NURA_COMPLETE_BUILD_SCOPE.md`](docs/NURA_COMPLETE_BUILD_SCOPE.md) for acceptance. Historical checkpoints are not current implementation evidence.
- Keep routes in the repository-root `app/` directory. Put reusable UI in `src/components/`, domain and presentation logic in `src/services/`, persistence/state in `src/state/`, and local API orchestration, ports, and adapters in `server/`. Do not create a second route root under `src/app/`.
- Keep additions in the existing feature/domain area. Move or delete files only after checking imports, platform resolution, tests, package scripts, documentation links, and runtime use. Add new tests to the relevant npm test script so repository verification actually runs them.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in the repository-root `app/` directory — every route file there is a screen, and `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utilities) outside `app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
