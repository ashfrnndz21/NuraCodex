# Nura pause and resume runbook

**Purpose:** preserve one continuous build thread when internet access is interrupted. Local implementation, synthetic verification, and build-board updates can continue offline. Only work that truly needs a remote service, repository sync, or public provider is deferred.

## Current handoff — 26 September 2026

- **Repository:** `/Users/ashleyfernandez/Projects/NuraCodex`, branch `main`.
- **Last published checkpoint before this slice:** `ebf4ab5` (`Checkpoint Nura recovery and verified slices`). The current UI/profile work and two parallel acceptance fixes are being consolidated; check Git status and the newest commit before resuming.
- **Build acceptance:** **0/11 accepted user stories, 0/8 passed production gates, 0/19 accepted packages (0%)**. This strict count does not convert partial code into completion.
- **Current slice:** require both name and country before first-run profile routes unlock; give Explore topic-specific live activity, a concise expandable source-backed brief, event-timed motion and a stronger web route transition; animate real document-review activity while honoring reduced motion. Two independent synthetic slices are in progress for durable Ask memory approval (M5) and policy-answer grounding (M3).
- **Last consolidated verification:** repository tests **214/214**, latest-slice tests **53/53**, TypeScript typecheck passed, lint passed with **0 errors and one existing warning at `app/index.tsx:402`**, and `git diff --check` passed. Rerun after agent patches and before calling this checkpoint complete.
- **Preview:** the in-app browser remains on the Nura start route at `http://localhost:8094/`; the local agent service is expected at `http://127.0.0.1:4175/healthz`. Check availability before relying on either. The `/services` route loaded in a separate preview with no selected topics. No search provider, model, or file upload was used in that inspection.
- **Sensitive data:** use synthetic health, profile, policy, and contact information only. Never display or copy `.env` values, and never send a real health record to any provider.

## If internet access drops

1. Keep the current checkout and local files. Do not reset, clean, rebase, or discard uncommitted work.
2. Record the branch, last commit, modified-file list, active agent slices, latest test results, and open acceptance criterion in this document and `NURA_BUILD_BOARD.md`.
3. Continue offline-safe work: implementation, local unit/integration tests, typecheck, lint, synthetic fixtures, design review, and acceptance documentation. Localhost-only tests are allowed when available.
4. Defer provider calls, public web searches, Git fetch/push, cloud/deployment work, and any test that would transmit health data. A failed network-dependent check is “not run/blocked,” never a pass.
5. Make a local checkpoint commit after a coherent slice when tests pass. If internet is unavailable, leave it committed locally and record the SHA; push it after connectivity returns. Never force-push.
6. Keep the 30-minute progress cadence active. A status update should say what advanced offline, what was deferred for connectivity, the exact remaining acceptance criterion, and the next local slice. Do not stop the build just because remote work is unavailable.

## Resume when internet returns

1. Continue in this same Codex task and checkout. Start with this runbook, `NURA_COMPLETE_BUILD_SCOPE.md`, `USER_STORY_ACCEPTANCE.md`, and the latest section of `NURA_BUILD_BOARD.md`.
2. Check `git status`, current branch, local commits, and the recorded SHA. Fetch the remote and reconcile changes normally; do not overwrite local commits or uncommitted files.
3. Integrate any agent work, rerun changed-slice checks, then run the full required typecheck, lint, repository/integration suite, relevant security/data-isolation checks, and visual acceptance. Update documentation only with observed results.
4. Restart the local web and agent services only if they are down; confirm the preview route and `/healthz` respond. Health status alone is not a story acceptance result.
5. Push local checkpoints once remote connectivity is confirmed. Record the pushed SHA and keep the worktree clean or list remaining changes explicitly.
6. Resume from the highest-priority incomplete acceptance criterion, currently the end-to-end M1 first-history journey; then continue M5/M3 and the remaining stories and production gates. A route or passing unit test alone does not qualify a complete package.

## User resume message

When ready, say: **“Internet is back. Resume Nura from `docs/NURA_PAUSE_RESUME.md`; continue the build and report the exact accepted package counts.”**



## Continuous-build checkpoint — 26 September 2026, 10:27 +08

This section supersedes the earlier in-progress counts above. **The build remains active through an internet outage; there is no planned pause or handoff gap.** Continue implementation, synthetic-only checks and evidence updates locally. Do not wait for internet to resume local work.

- **Repository:** `/Users/ashleyfernandez/Projects/NuraCodex`, branch `main`; base checkpoint `ebf4ab5`. Current implementation and evidence are in the working tree and must be checkpointed locally after consolidation. Never reset or discard them.
- **Latest verification:** repo tests **220/220 passed**, latest slices **53/53 passed**, typecheck passed, lint passed with zero errors and one pre-existing warning at `app/index.tsx:402`, and diff check passed. The full suite needed permission for its synthetic loopback-only integration servers; it made no provider calls.
- **Current acceptance status:** **0/11 user stories, 0/8 production gates, 0/19 overall**. M1/M3/M4/M5 have partial verified work only. No complete in-app user-test milestone is ready.
- **Next local slice:** one internally verified synthetic M1 app journey: sign-in → required profile setup → multi-file and self-report intake → consent → review/adjust/reject/resolve → save → linked year/month history and re-entry. Continue independent offline-safe work after that. Do not ask the user to diagnose unfinished screens.
- **Deferred only for connectivity:** remote push/fetch, external provider tests, public-source checks, cloud/deployment and hosted security checks. Mark them blocked/not run until online; never count an attempt as a pass. Use no real health/profile/policy information and never expose `.env` values.
- **Resume message:** “Internet is back. Resume Nura from `docs/NURA_PAUSE_RESUME.md`; continue the build and report the exact accepted package counts.” Continue in this same task and report the local commit/push result honestly.
