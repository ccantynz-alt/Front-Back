# Week 6 — Voice / Transcription (Whisper-backed Stack)

> **Priority:** P0
> **Target:** Voice + transcription vertical
> **Why this one:** Voice is where Crontech's three-tier compute model (client GPU → edge → cloud) actually pays off. Whisper is already tracked in our Sentinel competitor list. Migrating this vertical proves the AI inference pipeline works at production scale.

## Pre-flight

- [ ] Week 5 (GateTest) complete and stable for ≥72h
- [ ] WebGPU inference path working in apps/web (WebLLM + Transformers.js integration)
- [ ] Modal.com GPU workers provisioned and tested (for heavy Whisper jobs that exceed client capability)
- [ ] Audio storage in R2 with lifecycle rules (hot 30 days, warm 90 days, archive after)
- [ ] PII handling policy documented (voice recordings = biometric data in many jurisdictions)

## Day 1 — Inventory

- [ ] Current transcription pipeline (which Whisper variant? whisper-cpp? faster-whisper? OpenAI API?)
- [ ] Customer count and monthly audio minutes processed
- [ ] Language support (English only, or multi-lingual?)
- [ ] Speaker diarization (who said what)?
- [ ] Real-time vs batch workflows
- [ ] Integration targets (Zoom, Teams, phone systems?)
- [ ] Accuracy SLAs (if any)
- [ ] Retention policies

## Day 2 — Scaffold

- [ ] Branch `migration/week-6-voice`
- [ ] `apps/voice/` workspace
- [ ] R2 bucket for audio files
- [ ] Neon for transcript metadata (searchable, indexable)
- [ ] Qdrant for semantic search over transcripts (a key feature)
- [ ] Worker queue for batch transcription jobs

## Day 3 — Three-tier inference pipeline

The killer feature. Audio gets routed intelligently:

- [ ] **Tier 1 (client):** WebGPU + Transformers.js runs whisper-tiny/base in the browser for short clips (under 30s)
  - Zero cost, sub-10s latency
  - Handles: quick voice memos, interactive dictation
- [ ] **Tier 2 (edge):** Cloudflare Workers AI runs Whisper-small/medium for medium clips (up to 10 min)
  - Fast, cheap, no cold starts
  - Handles: meeting segments, podcast chunks
- [ ] **Tier 3 (cloud):** Modal.com GPU workers run Whisper-large-v3 for long or high-accuracy jobs
  - Full H100 power
  - Handles: full meetings, legal depositions, transcripts that need diarization

The router picks the tier based on:
- Audio duration
- Requested accuracy
- Device capability
- User's plan tier

## Day 4 — Port UI & features

- [ ] Upload interface (drag-drop, recording, URL import)
- [ ] Live transcription view (word-by-word as it comes)
- [ ] Transcript editor (for corrections)
- [ ] Speaker labeling UI
- [ ] Search across all transcripts
- [ ] Export formats (SRT, VTT, plain text, DOCX, PDF)
- [ ] Sharing with expiring links
- [ ] API for programmatic access

## Day 5 — Data migration

- [ ] Bulk-copy audio files from old storage to R2 with integrity verification
- [ ] Migrate transcript metadata to Neon
- [ ] Re-generate embeddings for semantic search on each transcript (feed through current embedding model)
- [ ] Verify: pick 20 random transcripts, confirm audio plays, transcript matches, search finds them

## Day 6 — Cutover

- [ ] Deploy to `voice-new.crontech.nz`
- [ ] Side-by-side accuracy test: process 10 sample clips through old and new, compare WER (Word Error Rate)
- [ ] Must be within 1% of old system's accuracy — NOT worse
- [ ] Load test: 100 concurrent uploads
- [ ] DNS cutover during low-traffic window

## Day 7 — Decommission

- [ ] Old storage bucket archived to cold R2 tier
- [ ] Old hosting cancelled
- [ ] Flip `week-6-voice` in progress.json to completed

## Exit criteria

- [ ] Voice platform serving from Crontech
- [ ] Three-tier inference pipeline operational
- [ ] Client-side WebGPU path tested in production
- [ ] Every historical transcript accessible and searchable
- [ ] Semantic search working (Qdrant queries returning relevant results)
- [ ] Word Error Rate matches or beats old system
- [ ] OTel traces show inference tier routing
- [ ] `/admin/progress` shows week-6 completed

## Rollback plan

Rollback triggers:

- Transcription accuracy drops more than 1% WER
- Any historical transcript becomes inaccessible
- Upload failures above 1%
- Client-side inference crashes in browsers

Rollback procedure:

1. DNS flip to old stack
2. Any in-flight jobs get re-queued on old system
3. Root cause in post-mortem

## Risks unique to voice

- **Biometric data law.** Voice is biometric data in GDPR, BIPA, and several US state laws. Storage location and consent flows matter.
- **Audio file sizes.** Long recordings are multi-GB. R2 uploads need multipart + resume.
- **Real-time latency.** If the stack supports live transcription, end-to-end latency must stay under 500ms for usability.
- **Model accuracy regression.** Any user who notices lower accuracy will complain loudly. Parallel-run comparison is mandatory.
- **WebGPU browser coverage.** Firefox WebGPU support is limited. Fall back to edge inference gracefully.

## What this week proves

By the end of Week 6:

- Crontech's three-tier compute model is running real production traffic
- Client-side AI inference is saving us actual GPU cost dollars
- The router between tiers is making smart decisions
- Whisper-large-v3 on Modal.com is integrated into the pipeline
- Our voice vertical becomes a public proof point for "browser-native AI is real"

Public narrative:

> "Short clips transcribe in your browser for $0. Long clips route to our edge. Deposition-length recordings hit our GPU cluster. You never think about which tier. We do."
