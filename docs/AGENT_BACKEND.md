# Nura local intelligence demo

This is a local, single-profile demonstration of sourced memory and agent activity. It is not a production health service. It binds to loopback only, refuses `NODE_ENV=production`, has no account authentication or cloud database, and stores metadata and reviewed claims in a private local JSON file. It does not provide production isolation between people.

## Configure and run

1. Copy `.env.example` to `.env`; add the API key to `OPENAI_API_KEY` in the server environment only. Never use an `EXPO_PUBLIC_` variable for it.
2. Run `npm run agent:dev` from the project folder, then start Expo as usual. A physical phone cannot reach a backend bound to `127.0.0.1`; do not expose it to a LAN as a workaround.
3. The fallback model is `gpt-5.6-luna`; `NURA_MODEL` overrides `OPENAI_MODEL`. The model account must have API access to the selected model.

## Working backend paths

- `POST /v1/agent/runs`: per-run consent is required. The orchestration retrieves the selected profile facts, topics and user-authored links, and the accepted claims in the local demo repository. It streams SSE activity and emits only citations actually returned by the evidence tools. The server persists event envelopes without prompts, answers, filenames, health values or tool arguments.
- `POST /v1/intake/extract`: accepts one PDF, JPEG, PNG or WEBP body up to 15 MiB by default. Requires `x-nura-consent-confirmed: true`. It computes SHA-256, detects exact duplicates, calls the configured Responses model, and saves extracted content only as review-required claims with page/quote provenance. Raw file bytes are used in memory for the request and are not persisted. The filename is source metadata, not an activity event.
- `GET /v1/intake/sources/:id/claims`: reads a source and its review candidates.
- `POST /v1/intake/claims/:id/decision`: accepts `{ "decision": "accept" }`, `{ "decision": "edit", "editedValue": { "label": "...", "value": "...", "unit": "...", "effectiveAt": "..." } }`, or `{ "decision": "reject" }`. The Expo review screen calls this endpoint; only it can turn a candidate into a user-confirmed assertion. Ask can retrieve accepted assertions.
- Trusted health web search uses the provider's built-in web-search tool and a fixed domain allowlist. It requires both `NURA_HEALTH_SEARCH_ENABLED=true` and `NURA_ENABLE_DEMO_WEB_SEARCH=true`, plus explicit per-run opt-in. Leave it off for real personal records: external search is not an approved private health-data path. Search is general education only, never evidence about the user.

Exact file hashes and full source/claim content persist under `server/.nura-dev/repository.json` (or `NURA_DEMO_DATA_DIR`) for this local demo; the directory is ignored by Git. Use synthetic documents only. The adapter requests `store: false`, but provider data handling still applies. This is not an encrypted production data store.

## Not implemented in this slice

- No specialist coverage analysis; policy phrases may appear as generic extracted candidates, but there is no policy comparison workflow.
- No specialized insurance-policy agent or coverage comparison; policy terms can appear as extracted candidates only.
- No account identity, profile-level authorization/isolation, family permissions, cloud sync, production retention/deletion controls, or production compliance safeguards.
- No video understanding. The Expo picker can select video, but the analysis flow rejects it. A later slice needs timestamped frame extraction plus audio transcription, preserving frame/timecode provenance through the same review-only claim flow; do not send a video as though it were a supported direct Responses input.
- The current Expo flow handles one selected document per extraction. Batch intake and shared cloud source storage are not implemented.
- No personalized health feed, external video ingestion, or care-team integrations.

Activity milestones report real server actions; they do not expose hidden model reasoning. Errors do not include provider response bodies. Synthetic Ask, PDF extraction, candidate review/acceptance, persisted retrieval and exact-duplicate smoke checks passed on 2026-09-23; no real health data was used. The image extraction path has not yet had its own live-file check.

## Provider references

- [Responses API streaming reference](https://platform.openai.com/docs/api-reference/responses-streaming)
- [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)
- [File inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [Web search tool](https://developers.openai.com/api/docs/guides/tools-web-search)
