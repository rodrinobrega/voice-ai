# Internal build contract (backend ⟷ frontend)

Source of truth for names/shapes while implementing. Mirrors `ARCHITECTURE.md`. Not a deliverable to the user by itself — folded into the code.

## Env vars (backend Lambda)
`AWS_REGION`, `DYNAMODB_TABLE`, `AUDIO_BUCKET`, `TRANSCRIPTS_BUCKET`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `SPEECHMATICS_API_KEY_PARAM` (SSM param name), `SPEECHMATICS_WEBHOOK_SECRET_PARAM` (SSM param name), `SPEECHMATICS_BASE_URL` (default `https://asr.api.speechmatics.com/v2`), `SPEECHMATICS_RT_URL` (default `wss://eu2.rt.speechmatics.com/v2`), `STAGE`.

## Env vars (frontend, `NUXT_PUBLIC_*`)
`NUXT_PUBLIC_API_BASE`, `NUXT_PUBLIC_COGNITO_USER_POOL_ID`, `NUXT_PUBLIC_COGNITO_CLIENT_ID`, `NUXT_PUBLIC_AWS_REGION`.

## DynamoDB — table `voice-ai-transcriptions-{stage}`
- `PK` = `USER#{userId}`
- `SK` = `TRANSCRIPTION#{createdAtISO}#{transcriptionId}`
- Attrs: `transcriptionId, userId, type ('FILE'|'REALTIME'), status ('PENDING_UPLOAD'|'PROCESSING'|'COMPLETED'|'FAILED'), sourceFileName?, audioS3Key?, transcriptS3Key?, language?, durationSeconds?, speechmaticsJobId?, errorMessage?, createdAt, updatedAt`

## S3 key convention
`audio/{userId}/{transcriptionId}/{filename}` in the audio bucket; `{userId}/{transcriptionId}.txt` (+ `.json`) in the transcripts bucket.

## REST API (HTTP API, Cognito JWT authorizer on all but `/transcriptions/webhook`)
- `GET  /me`
- `POST /transcriptions/upload-url`         → body `{ filename, contentType, language? }` → `{ transcriptionId, uploadUrl, fields }`
- `POST /transcriptions/webhook`            → Speechmatics callback (shared-secret header `x-webhook-secret`)
- `POST /transcriptions/realtime-token`     → `{ token, url }`
- `POST /transcriptions/realtime`           → body `{ transcriptText, durationSeconds?, language? }` → creates COMPLETED record
- `GET  /transcriptions?cursor=&limit=10`   → `{ items: Transcription[], nextCursor: string | null }`
- `GET  /transcriptions/{id}/download`      → `{ downloadUrl }`
- `GET  /transcriptions/{id}`               → single item (status polling)

## Transcription language
`language` is a Speechmatics language code from the curated list in `shared/types.ts` (`en`, `es`, `pt`, `fr`, `de`, `it`, `nl`, `ca`, `pl`, `ru`, `ja`, `cmn`), validated as a closed zod enum on both endpoints that accept it.

Uploads additionally accept `auto` (the default), which turns on Speechmatics' Language Identification, scoped to those same codes via `language_identification_config.expected_languages`. It wants ~60s of speech to be reliable. Real-time has no `auto` — the WebSocket API requires a concrete language, so `pages/record.vue` defaults to `en` and the picker is disabled mid-session.

The chosen code is stored on the transcription record at creation time and read back by `processUploadedAudio` when it submits the batch job.

## Backend layout
`backend/src/handlers/*.ts` (thin, one per route above), `backend/src/domain/*.ts` (pure logic: pagination cursor, ownership checks, status transitions), `backend/src/infra/*.ts` (`dynamo.ts`, `s3.ts`, `speechmatics.ts`, `ssm.ts` — AWS SDK v3 adapters), `backend/src/shared/*.ts` (`types.ts`, `schemas.ts` zod, `http.ts` response helpers, `errors.ts`, `logger.ts`).

## Frontend layout
`frontend/pages/{index,login,register,confirm,history,upload,record}.vue`, `frontend/middleware/auth.ts`, `frontend/stores/{auth,transcriptions}.ts` (Pinia), `frontend/composables/{useAuth,useApi,useMicRecorder}.ts`, `frontend/components/{AppHeader,TranscriptionList,TranscriptionRow,Pagination,FileUploader,LiveTranscript}.vue`.

## Code style rules everyone follows (pre-empts common Sonar findings)
- `strict: true` TS, no `any` (use `unknown` + narrowing or precise types).
- No function over ~40 lines / cyclomatic complexity ~10 — extract helpers.
- No duplicated logic across handlers — shared bits go in `domain`/`infra`.
- Every `catch` either handles or rethrows a typed error — never swallow silently.
- No magic numbers/strings inline — named constants.
- No secrets in code — always read from `process.env` / SSM, never hardcode.
- Every exported function has an explicit return type.
