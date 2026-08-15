# Voice AI — Implementation Plan

Companion to `ARCHITECTURE.md`. This breaks the design into ordered, buildable phases for the next work sessions. Each phase produces something runnable/verifiable before moving to the next — nothing here is written yet, this is the sequence we'll follow.

Estimated total: ~6-7 focused working days, matching the exercise's 7-day window. Phases 1–6 are the required scope; Phase 7 lists stretch items to attempt only if time remains.

---

## Phase 0 — Repository & tooling bootstrap (~0.5 day)

1. Initialize the monorepo: root `package.json` with npm workspaces (`backend`, `frontend`), shared root `.editorconfig`, `.gitignore`, `.nvmrc` (Node 20).
2. Scaffold `backend/` (TypeScript, Serverless Framework v3 `serverless.yml`, `esbuild` bundling, ESLint + Prettier, Jest config).
3. Scaffold `frontend/` (`nuxi init`, TypeScript, `@nuxtjs/tailwindcss`, Pinia, ESLint + Prettier, Jest via `@nuxt/test-utils`, Cypress).
4. Add `docker-compose.yml` with `dynamodb-local` and `localstack` (S3) services.
5. Create AWS dev-stage resources needed before code can run: a Cognito User Pool + App Client (`aws cognito-idp create-user-pool` or a first minimal `serverless.yml` deploy of just the Cognito resource).
6. Create a free Speechmatics account, generate an API key, store it locally in `.env` (git-ignored) and note it for later SSM upload.
7. **Checkpoint:** `npm install` at root succeeds; `docker compose up` starts DynamoDB Local + LocalStack; `serverless offline start` boots with a placeholder health-check route; `npm run dev` in `frontend/` shows the default Nuxt page.

## Phase 1 — Auth (register / login / logout) (~1 day)

1. Backend: finalize Cognito User Pool config in `serverless.yml` (password policy, email verification, public app client) for `dev` stage; deploy it.
2. Frontend: add `amazon-cognito-identity-js` (or Amplify Auth), build `useAuth()` composable wrapping sign-up, confirm-sign-up, sign-in, sign-out, and current-session retrieval.
3. Build the register, login, and (implicit) logout UI screens/components; add a Pinia auth store holding the current user/session state; add a route guard (Nuxt middleware) redirecting unauthenticated users to `/login`.
4. Wire an Axios/`$fetch` client that attaches the Cognito access token as `Authorization: Bearer` on every API call and redirects to login on 401.
5. Jest unit tests: auth composable logic (mocked Cognito SDK), auth store transitions.
6. Cypress E2E: register → verify (using a test email or a mocked verification step) → login → logout happy path.
7. **Checkpoint:** a real user can register, confirm their email, log in, see a protected empty "history" page, and log out.

## Phase 2 — Data layer & core API skeleton (~0.5 day)

1. Define the DynamoDB table in `serverless.yml` per the schema in `ARCHITECTURE.md` §5; deploy to `dev`.
2. Backend `infra/dynamo.ts` adapter (get/put/query helpers, typed via a `Transcription` domain type) and `infra/s3.ts` adapter (presign PUT/POST, presign GET).
3. Add the HTTP API in `serverless.yml` with the Cognito JWT authorizer attached; add a trivial authenticated `GET /me` route as a wiring smoke test.
4. Zod schemas for all request/response shapes in `shared/`.
5. Jest unit tests for the Dynamo/S3 adapters against DynamoDB Local / LocalStack.
6. **Checkpoint:** an authenticated frontend call to `GET /me` round-trips through API Gateway → Cognito authorizer → Lambda → returns the caller's `sub`.

## Phase 3 — File upload transcription (~1.5 days)

1. Lambda `getUploadUrl`: create `transcriptionId`, write `PENDING_UPLOAD` DynamoDB item, return S3 presigned POST (20 MB / `audio/*` constraints).
2. Lambda `processUploadedAudio` (S3 `ObjectCreated` trigger): parse `userId`/`transcriptionId` from the key, submit a Speechmatics batch job with a `notification_config` webhook URL + shared-secret header, move item to `PROCESSING`.
3. Lambda `speechmaticsWebhook`: validate the shared secret, fetch the completed transcript from Speechmatics, store it in the transcripts bucket, update DynamoDB to `COMPLETED`/`FAILED`.
4. EventBridge scheduled Lambda (fallback): every 60s, requeue/re-check any `PROCESSING` item older than N minutes (guards against a missed webhook).
5. Frontend: file upload component (drag-and-drop or file picker, client-side 20 MB check before requesting the presigned URL), calls `getUploadUrl` then `PUT`s directly to S3, shows upload progress and polls transcription status until `COMPLETED`/`FAILED`.
6. Jest unit tests: Lambda handlers with mocked Speechmatics client; S3 event parsing.
7. Cypress E2E: upload a short sample audio file, wait for status to reach `COMPLETED`, see the transcript appear.
8. **Checkpoint:** uploading a real audio file end-to-end produces a stored, readable transcript.

## Phase 4 — Real-time microphone transcription (~1.5 days)

1. Lambda `getRealtimeToken`: call Speechmatics Management API to mint a temporary key, return it + WebSocket URL to the frontend.
2. Frontend: microphone capture via `navigator.mediaDevices.getUserMedia` + `AudioWorklet` (resampled to the PCM format Speechmatics expects), open the WebSocket directly to Speechmatics, stream audio chunks, render `AddPartialTranscript`/`AddTranscript` messages live.
3. On session end, assemble the final transcript client-side and call `POST /transcriptions/realtime`.
4. Lambda `saveRealtimeTranscript`: store the transcript text in S3, write a `COMPLETED` DynamoDB item (`type = REALTIME`).
5. Frontend: "Record" UI (start/stop button, live transcript pane, mic permission handling/error states).
6. Jest unit tests: token-minting Lambda (mocked Speechmatics Management API call); transcript-assembly logic.
7. Cypress E2E: this flow is hard to fully automate (real mic + real WebSocket); cover what's practical (UI states, permission-denied handling) with Cypress and note manual QA for the live audio path itself.
8. **Checkpoint:** speaking into the microphone shows live captions in the browser, and stopping the recording saves it into history.

## Phase 5 — History list & download (~0.5 day)

1. Lambda `listTranscriptions`: cursor-paginated DynamoDB `Query`, 10 items/page, newest first.
2. Lambda `getDownloadUrl`: ownership check + presigned GET.
3. Frontend: history table/list (filename or "Live recording", date, status, type), pagination controls (Next/Previous using the opaque cursor — no numbered pages, since DynamoDB doesn't support offset jumps cheaply), a Download button per completed row.
4. Jest unit tests: pagination cursor encode/decode; ownership-check rejection case.
5. Cypress E2E: seed 12+ transcriptions (via API calls in the test setup), confirm the list shows 10, paginate to see the rest, download one and verify the file downloads.
6. **Checkpoint:** full history browsing and downloading works end to end.

## Phase 6 — CI/CD, static analysis, hardening (~1 day)

1. Write `.github/workflows/ci.yml`: lint → typecheck → unit tests (parallel backend/frontend) → SonarQube Cloud scan (quality gate) → Cypress E2E against an ephemeral `pr-{number}` stage → (on `main`) deploy `dev` → (manual approval) deploy `prod`.
2. Create the SonarQube Cloud project, `sonar-project.properties`, wire coverage report paths from both Jest configs.
3. Add the optional local `sonarqube` Docker service + a `npm run sonar:local` script.
4. Set up GitHub OIDC → AWS IAM role for CI deploys (no long-lived keys in repo secrets).
5. Move the Speechmatics key from local `.env` into SSM Parameter Store for `dev`/`prod`; confirm Lambdas read it correctly.
6. Add CloudWatch alarms (Lambda error rate, DLQ depth) and confirm log retention settings.
7. Security pass: re-check every IAM role is least-privilege, confirm no bucket is public, confirm CORS is scoped to the real frontend origin (not `*`) before the final deploy.
8. Write the root `README.md`: how to run locally, how to deploy, environment variables, architecture doc links.
9. **Checkpoint:** a fresh PR goes through the full pipeline (lint/test/Sonar/E2E) and, once merged, auto-deploys to `dev`; a tagged/approved release reaches `prod`.

## Phase 7 — Stretch items (only if time remains)

- Speaker diarization / language auto-detection surfaced in the UI (Speechmatics supports both).
- Transcript export formats beyond plain text (SRT/VTT for subtitles).
- Dark mode / accessibility pass on the Nuxt UI.
- Terraform module as an alternative to Serverless Framework, to demonstrate both IaC options from the brief.
- Multi-region failover for the API.
- Cost dashboard (CloudWatch + Cost Explorer tags) to track Speechmatics/AWS spend against the free tiers.

---

## Definition of done (matches the exercise's evaluation criteria)

- [ ] All 7 functional use cases work end to end against a deployed AWS `dev` stage.
- [ ] Backend: NodeJS + TypeScript, Serverless Framework, Lambda, DynamoDB, S3, Cognito, Jest — all present and used as designed.
- [ ] Frontend: NuxtJS + TypeScript, Tailwind CSS, Jest, Cypress — all present and used as designed.
- [ ] Code organized in clear modules (`handlers`/`domain`/`infra` on the backend; `pages`/`components`/`composables`/`stores` on the frontend) — no logic dumped directly in Lambda handlers.
- [ ] TypeScript strictly typed (`strict: true`, no `any` without justification).
- [ ] Cognito used securely (no custom password handling, ownership checks on every resource access, least-privilege IAM).
- [ ] Speechmatics integrated correctly for both batch and real-time, API key never exposed to the browser.
- [ ] CI/CD pipeline runs static analysis (SonarQube) and tests with coverage on every change.
- [ ] Project runs fully locally (`docker compose up` + `npm run dev`) and deploys to AWS (`serverless deploy`).
- [ ] README documents setup, local run, and deployment steps.
