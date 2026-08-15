# Voice AI — Audio Transcription Platform

A serverless AWS platform for registering, authenticating, uploading audio for transcription, transcribing live from the microphone, and browsing/downloading transcription history. Originally scoped as a take-home technical exercise; built out here as a portfolio project.

Full design rationale: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Build sequence this codebase follows: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). Internal naming/contract reference: [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

## Stack

- **Backend**: Node.js 20 + TypeScript, Serverless Framework v3 (Lambda, API Gateway HTTP API, DynamoDB, S3, Cognito, EventBridge), Jest.
- **Frontend**: Nuxt 3 + TypeScript, Tailwind CSS, Pinia, Jest, Cypress.
- **Third-party**: Speechmatics (batch + real-time transcription).
- **Static analysis**: SonarQube Cloud in CI, optional local SonarQube Community Edition.

## Repository layout

```
backend/    Serverless Framework app — Lambda handlers, DynamoDB/S3/Speechmatics adapters
frontend/   Nuxt 3 SPA
docs/       Architecture, implementation plan, internal contracts
docker-compose.yml   Local DynamoDB/S3 emulation + optional local SonarQube
.github/workflows/ci.yml   Lint → test → Sonar → deploy pipeline
```

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- Docker (for local DynamoDB Local / LocalStack S3 emulation)
- An AWS account (only needed to actually deploy or to point local dev at a real dev-stage Cognito User Pool — see `docs/ARCHITECTURE.md` §10 for why Cognito isn't emulated locally)
- A free [Speechmatics](https://www.speechmatics.com/pricing) account and API key

## Setup

```bash
npm install                       # installs both workspaces
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# fill in COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID (create a dev-stage User
# Pool first — see docs/IMPLEMENTATION_PLAN.md Phase 0/1) and your
# Speechmatics API key.
```

## Running locally

```bash
docker compose up -d dynamodb-local localstack
npm run dev     # starts serverless-offline (backend) + Nuxt dev server (frontend), concurrently
```

Frontend: http://localhost:3000 · Backend (serverless-offline): http://localhost:3001

## Tests

```bash
npm test              # Jest unit tests, both workspaces
npm run test:coverage # same, with lcov coverage output (feeds Sonar)
npm run test:e2e      # Cypress E2E (frontend), against a running dev stack
```

## Static analysis (SonarQube)

CI runs this automatically on every push/PR (`.github/workflows/ci.yml`), using SonarQube Cloud. To run the same scan locally:

```bash
docker compose --profile sonar up -d sonarqube
# wait for http://localhost:9000, log in (admin/admin, you'll be asked to
# change it), generate a local analysis token
export SONAR_TOKEN=<your-local-token>
npm run test:coverage
npm run sonar:local
```

See `sonar-project.properties` for project configuration and quality gate expectations.

## Deploying

```bash
npm run deploy:backend            # serverless deploy --stage dev (default)
STAGE=prod npm run deploy:backend # deploy the prod stage
npm run deploy:frontend:dev       # nuxt generate + sync to S3 (dev)
```

In CI, `main` pushes auto-deploy to `dev`; promotion to `prod` requires a manual approval gate (GitHub Environments) — see the `deploy-prod` job in `.github/workflows/ci.yml`. AWS credentials are assumed via GitHub OIDC (`AWS_DEPLOY_ROLE_ARN` secret), not long-lived keys.

## Status

All 7 functional use cases from the brief are implemented: register, authenticate, log out, transcribe an uploaded file (≤20MB), real-time microphone transcription, paginated transcription history (10/page), download a transcription. See `docs/IMPLEMENTATION_PLAN.md`'s "Definition of done" checklist for the full grading-criteria mapping.

Two things are intentionally left for you to wire up before a real deploy, per your instructions to skip secrets/repo setup for this pass: actual AWS/Cognito/Speechmatics credentials (`.env` files, SSM parameters), and the `git init` / GitHub repo + `SONAR_TOKEN` / `AWS_DEPLOY_ROLE_ARN` CI secrets.
