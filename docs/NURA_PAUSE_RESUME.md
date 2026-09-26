# Nura pause and resume runbook

**Purpose:** preserve one continuous build thread when internet access is interrupted. Local implementation, synthetic verification, and build-board updates can continue offline. Only work that truly needs a remote service, repository sync, or public provider is deferred.

## Current handoff — 26 September 2026

- **Repository:** `/Users/ashleyfernandez/Projects/NuraCodex`, branch `main`.
- **Most recent published checkpoint:** `fd4e038` (`Build Nura offline continuity and verified interaction slices`), pushed to `origin/main` before connectivity loss. Continue from current `main`; preserve any later local work.
- **Build acceptance:** **0/11 accepted user stories, 0/8 passed production gates, 0/19 accepted packages (0%)**. This strict count does not convert partial code into completion.
- **Current slice:** M1 first-profile route gating is tightened; M3 policy findings require evidence-matched categories and exact quotes; M4 activity and concise briefs reflect real events; M5 memory approval awaits durable save and remains retryable. All four are partial story work.
- **Last consolidated verification:** repository tests **220/220**, latest-slice tests **53/53**, TypeScript typecheck passed, lint passed with **0 errors and one existing warning at `app/index.tsx:402`**, and `git diff --check` passed. These checks correspond to the pushed `fd4e038` checkpoint.
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

- **Repository:** `/Users/ashleyfernandez/Projects/NuraCodex`, branch `main`; verified implementation checkpoint `fd4e038` is committed and pushed. The worktree was clean at checkpoint. Never reset or discard later work.
- **Checkpoint:** commit `fd4e038` is available on `origin/main`. If connectivity drops, continue locally and commit the next coherent verified slice on the same branch; push it when the connection returns.
- **Latest verification:** repo tests **220/220 passed**, latest slices **53/53 passed**, typecheck passed, lint passed with zero errors and one pre-existing warning at `app/index.tsx:402`, and diff check passed. The full suite needed permission for its synthetic loopback-only integration servers; it made no provider calls.
- **Current acceptance status:** **0/11 user stories, 0/8 production gates, 0/19 overall**. M1/M3/M4/M5 have partial verified work only. No complete in-app user-test milestone is ready.
- **Next local slice:** create a clean synthetic test session in a separate browser storage context without clearing the user workspace. A 127.0.0.1 probe restored `Jordan Sample` / `Malaysia` and was not a clean first run; no fields were changed and the tab was closed. After isolation, internally verify M1: sign-in → required profile setup → multi-file and self-report intake → consent → review/adjust/reject/resolve → save → linked year/month history and re-entry. Continue other offline-safe work if isolation cannot be established. Do not ask the user to diagnose unfinished screens.
- **Deferred only for connectivity:** remote push/fetch, external provider tests, public-source checks, cloud/deployment and hosted security checks. Mark them blocked/not run until online; never count an attempt as a pass. Use no real health/profile/policy information and never expose `.env` values.
- **Resume message:** “Internet is back. Resume Nura from `docs/NURA_PAUSE_RESUME.md`; continue the build and report the exact accepted package counts.” Continue in this same task and report the local commit/push result honestly.


## Connectivity restored — resume checkpoint — 26 September 2026, 13:26 +08

- **Continue in:** `/Users/ashleyfernandez/Projects/NuraCodex`, branch `main`, based on `5c3e6ae`; this run has in-progress local changes and no checkpoint commit yet. Do not discard them. The configured remote is the user-provided NuraCodex GitHub repository; inspect remote status before pushing.
- **Live preview:** isolated Nura tab 6 is `http://localhost:8095/health` with the synthetic Riley Sample timeline; tab 8 is a fresh frontend storage origin at `http://127.0.0.1:8095/sign-in`. The original preview at 8094 was not cleared or changed. The second backend uses temporary synthetic storage at `/tmp/nura-m1-first-run-20260926`; keep the two local sessions separate. Verify the agent service on port 4176 before depending on it.
- **Verified progress:** one fictional lipid PDF plus a user-authored note passed the browser review/save journey; eight source-matched values are grouped under the report's event date and the note remains a distinct dated timeline item. Browser refresh retained the synthetic history. A map label that conflated topic choices with saved information was corrected and confirmed in-app. Ask long-answer disclosure and insurance conditional-exclusion slices were also resumed.
- **Latest checks:** repo **227/227**, latest slices **59/59**, TypeScript typecheck passed, lint **0 errors / 1 existing warning at `app/index.tsx:402`**, `git diff --check` passed. Full repo tests required loopback permission for synthetic local integration servers; no external provider request was part of this resumed verification.
- **Acceptance remains:** **0/11 stories, 0/8 production gates, 0/19 packages (0%)**. A single-file-plus-note browser journey is evidence of progress, not full M1. Still required: multi-file UI batch, all review decisions and retry, source/date/duplicate/conflict review, cold re-entry without reprocessing, native/reduced-motion/device checks, provider-backed identity and owner isolation, and all remaining story/gate acceptance.
- **Next:** continue the M1 multi-file UI journey in a clean synthetic context while preserving tabs 6 and 8. A user-test milestone is not ready. Keep using synthetic profile, health and policy records only; never expose `.env` values or send real personal health information to a provider.


## Latest continuation — 26 September 2026

- Resumed from the existing local changes on `main`; no work was reset or discarded. The isolated browser origin on port 8095 still contains only synthetic Riley Sample data. The original 8094 preview was not changed.
- Recovered web motion after Metro showed the native-animation-module warning: the web app now selects the JavaScript Animated driver, with iOS/Android retaining native animation. The restarted 8095 preview successfully rendered `/health` and navigated to `/care`. Its rebuilt logs had no missing `RCTAnimation` warning. Android LayoutAnimation is enabled at the app root.
- `http://127.0.0.1:4176/healthz` returned `ok: true` for the local synthetic-only agent service. No provider request was made.
- Latest checks: repository tests **230/230**, latest slices **62/62**, typecheck passed, lint **0 errors / one existing warning at `app/index.tsx:403`**, and `git diff --check` passed.
- Acceptance remains **0/11 stories, 0/8 production gates, 0/19 overall**. No full user-test milestone is ready. Exact native-device/reduced-motion review, M1 multi-file decisions/retry/re-entry, verified production identity and owner isolation, and the remaining story and gate acceptance are still open.
- Next implementation slice: internally verify M1's multi-file review path in the isolated synthetic session; keep the 8094 user preview untouched. Commit and push this coherent verified checkpoint now that internet is available; record its resulting SHA after it is published.

## Reconnect resumed — 26 September 2026, 15:50 +08

- Remote connectivity is back. git fetch origin completed; local main and origin/main were both at 0154877 before this run. The worktree contains the current Ask fact selector, intake accessibility labels, self-report parsing fix/tests, and progress evidence. Do not reset these changes.
- The previous 0154877 checkpoint was pushed successfully. The verified code checkpoint fa36a6b (Add precise Ask consent and safe note parsing) is now pushed to origin/main. A small documentation-only follow-up records this SHA; no code remains unpushed.
- Local preview: synthetic profile only at http://127.0.0.1:8095; the original preview on port 8094 was not changed. The local agent health route returned ok: true. No provider request was made by the health check. Only fictional profile and health details were entered.
- Live evidence: new Ask per-fact control visibly changed consent from 9/9 to 8/9 and was canceled before sending. The first-run rehearsal selected five health areas and one nested detail, opened an already-saved sample PDF without reprocessing, organized one fictional note locally after per-note confirmation, rejected an unsupported date-derived glucose candidate, explicitly saved the note, then verified its separate timeline event and persistence after page reload.
- Regression found/fixed: local text rules treated 15 January 2025 as a glucose measurement and split decimal 6.3. Date masking and decimal-safe sentence boundaries are in server/agent/localSelfReport.mjs; focused tests pass. The old candidate in the synthetic preview was marked dismissed before the fixed code landed; it never entered active health facts.
- Test evidence: repository tests 236/236; latest slices 66/66; typecheck passed; lint 0 errors / one pre-existing warning at app/index.tsx:403; diff check passed.
- Still open: native multiple-file picker could not be surfaced from this locked desktop IAB session. The multi-file server integration test passed, but M1’s in-app batch, all claim decisions, device/reduced-motion matrix, cold restart and verified account/person isolation are still not accepted. All other story and P1–P8 checks remain open.
- Acceptance: 0/11 stories, 0/8 production gates, 0/19 packages (0%). No user-test handoff is ready.
- Next local slice: complete an actual multi-file app batch through one consent, per-file activity, source matching, edit/reject/unclear decisions, one save, and history re-entry. Continue independent story/gate slices if native picker access remains blocked.
