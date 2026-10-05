# Nura local intelligence demo

Nura’s current server is a loopback-only, single-profile development demo. It refuses `NODE_ENV=production`, uses a synthetic demo identity, and is not a production health service. It does not provide account identity, profile isolation, a cloud database, or production privacy controls.

## Configure and run

1. Copy `.env.example` to `.env` and add `OPENAI_API_KEY` on the server only. Never put provider credentials in an `EXPO_PUBLIC_` variable.
2. Run `npm run web` for the app plus loopback service at `http://localhost:8099`. `npm run web:expo` starts the interface without the service. For a separate mobile development session, run `npm run agent:dev` and start Expo. A phone cannot reach a backend bound to `127.0.0.1`; do not expose this demo to a LAN as a workaround.
3. The default model is `gpt-5.6-luna`; `NURA_MODEL` overrides `OPENAI_MODEL`. The OpenAI project needs access to the selected model.
4. Audio review is available when the OpenAI provider is configured. Set `NURA_ENABLE_AUDIO_INTAKE=false` to disable it. Each recording also requires a separate in-app approval; general file-review consent does not approve audio processing.
5. Public health search remains off unless `NURA_HEALTH_SEARCH_ENABLED=true` and `NURA_ENABLE_DEMO_WEB_SEARCH=true`; Ask still requires explicit opt-in for that run. Explore’s YouTube search uses the separate server-only `NURA_YOUTUBE_DATA_API_KEY` and a trusted-channel list.

## Live provider-backed paths

- `POST /v1/agent/runs` requires per-run consent. Ask can retrieve the selected health records, health areas, links and separately selected care context. It streams activity, uses exact references returned by evidence tools, and keeps model proposals separate from saved facts. Broad health and personal cross-measure questions synthesize supported marker comparisons and same-date BMI context. Personal results still need units suitable for comparison; uncertain units are not classified.
- `POST /v1/intake/extract` accepts configured document, image, audio and video types up to the local 15 MiB request cap. Medical and insurance policy extraction share the source-review flow. Extracted values remain pending suggestions with quotes and source locations until the user approves, edits or rejects them. The loopback repository saves source metadata, hashes, review candidates and decisions; it does not store uploaded file bytes.
- Audio requires both the existing general file approval and the exact versioned audio approval header. The server checks duration locally, sends the recording to OpenAI for timestamped transcription, then sends transcript segments to OpenAI to suggest personal details. Only first-person details with an exact timestamped quote are eligible; third-party or unclear attributions are dropped. Transcript text is not persisted as a source. Suggestions remain pending for user review. The application does not analyze audio extracted from videos.
- Video review samples up to six still frames and sends those frames for visible-text extraction. It preserves the sampled time on each candidate and ignores video audio. Video content is untrusted evidence; appearance, symptoms and advice are not inferred.
- Explore combines trusted health articles with videos from configured, trusted YouTube channels. Video feed items require valid playable YouTube URLs and expose validated YouTube thumbnail URLs. Ask’s optional public-source lane uses a fixed domain allowlist. Neither public search lane is evidence about the user.
- `/healthz` reports non-secret provider availability for Ask, file extraction, trusted search, YouTube and audio transcription.

## Data and safety boundaries

Exact file hashes, source metadata, extracted claims and user decisions persist in the private local demo repository under `server/.nura-dev/repository.json` (or `NURA_DEMO_DATA_DIR`). Provider requests use `store: false` where supported. That setting does not change provider data-handling terms. This repository is not an encrypted production store; use generated synthetic records for live evaluations.

The server persists only safe event envelopes, not prompts, answers, filenames, health values or tool arguments. Provider error bodies are not shown to users. Activity milestones describe actual processing stages and do not claim access to hidden reasoning.

## Live AI quality evaluation

Run `npm run eval:live-ai` after adding server-only provider keys. It calls configured live providers using generated synthetic data only and checks fourteen paths: overall-health Ask synthesis and citations, selected-video explanation and contextual follow-ups, policy-bounded Ask answers, urgent symptom safety, consented Explore personalization, PDF extraction, image extraction, sampled-video extraction, insurance-term extraction, consented audio transcription and suggestions, third-party audio attribution safety, Ask trusted-source search, playable Explore videos and thumbnails, and live YouTube search. It creates synthetic report files and speech in the system temporary directory and removes them afterward. `NURA_LIVE_AI_EVAL_FILTER` can select scenarios for focused debugging.

This is a repeatable integration smoke and answer-quality check, not clinical validation or production acceptance. The live response remains subject to evidence quality, provider variability and clinician review. The media evaluation expects local `ffprobe`, `ffmpeg`, `pdftoppm`, and macOS `say` tools.

## Still open for production

- Production identity, profile-level authorization and owner isolation; the demo session is not a real account boundary.
- Secure cloud storage and sync, account export/deletion, retention controls, provider-aware deletion and durable consent lifecycle.
- Native-device file-picker, audio-approval, keyboard, safe-area, restart and accessibility acceptance.
- Independent clinical, privacy, security, legal and operational review, plus all story and release-gate acceptance.

## Provider references

- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenAI speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI web-search tool](https://developers.openai.com/api/docs/guides/tools-web-search)
