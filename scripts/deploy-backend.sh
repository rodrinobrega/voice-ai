#!/usr/bin/env bash
#
# Deploys the backend stack with WEB_ORIGIN pinned to the stage's own CloudFront
# domain.
#
# WEB_ORIGIN feeds API Gateway's CORS `allowedOrigins` and the audio/transcript
# bucket CORS rules (serverless.yml). Its correct value is the stack's `WebUrl`
# output — which only exists once the CloudFront distribution that same stack
# creates has been deployed. Left unset it falls back to `http://localhost:3000`,
# so a stage deployed from CI serves its SPA from CloudFront while the API only
# accepts requests from localhost, and every call from the deployed app is
# blocked by the browser.
#
# Resolving that here rather than in a CI variable keeps it in step with the
# distribution automatically:
#
#   * steady state      — read WebUrl, deploy once with it.
#   * first-ever deploy — no stack (or no distribution) yet, so the first pass
#                         lands on the localhost default; WebUrl then exists, so
#                         we deploy a second time to pick it up.
#
# Usage:  ./scripts/deploy-backend.sh [stage]
#
set -euo pipefail

STAGE="${1:-dev}"
REGION="${AWS_REGION:-eu-west-1}"
STACK="voice-ai-backend-${STAGE}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v aws >/dev/null || { echo "aws CLI not found"; exit 1; }

# Empty when the stack doesn't exist yet, or exists without a WebUrl output
# (`--query` yields the literal string "None" in that case).
web_url() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='WebUrl'].OutputValue | [0]" \
    --output text 2>/dev/null | grep -vx 'None' || true
}

# `useDotenv: true` loads backend/.env via dotenv, which never overwrites an
# already-set variable — so an exported WEB_ORIGIN reliably wins here.
deploy() {
  echo "==> Deploying ${STACK} with WEB_ORIGIN=${WEB_ORIGIN:-<unset, defaults to http://localhost:3000>}"
  (cd "$ROOT" && STAGE="$STAGE" npm run deploy --workspace backend)
}

existing=$(web_url)
[[ -n "$existing" ]] && export WEB_ORIGIN="$existing"
deploy

current=$(web_url)
if [[ -n "$current" && "$current" != "${WEB_ORIGIN:-}" ]]; then
  echo "==> CloudFront origin is new (${current}) — redeploying so CORS allows it"
  export WEB_ORIGIN="$current"
  deploy
fi

echo
echo "Backend deployed. CORS origin: ${WEB_ORIGIN:-http://localhost:3000 (no distribution yet)}"
