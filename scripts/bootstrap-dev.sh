#!/usr/bin/env bash
#
# Post-deploy bootstrap for the `dev` stage.
#
#   1. Stores the Speechmatics API key + a generated webhook shared secret in
#      SSM Parameter Store (SecureString) — the stack reads these at runtime
#      but deliberately does NOT create them, so secrets never live in IaC.
#   2. Reads the CloudFormation stack outputs and updates frontend/.env so the
#      SPA points at the freshly deployed API + Cognito pool, plus backend/.env
#      so local `serverless offline`/deploys use the right CORS origin.
#
# Only the keys it owns are touched — see `upsert_env`. Both .env files also
# hold hand-maintained local settings (see backend/.env.example), so rewriting
# them wholesale would silently delete a developer's local configuration.
#
# Usage:  SPEECHMATICS_API_KEY=xxxx ./scripts/bootstrap-dev.sh [stage]
#
set -euo pipefail

STAGE="${1:-dev}"
REGION="${AWS_REGION:-eu-west-1}"
STACK="voice-ai-backend-${STAGE}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v aws >/dev/null || { echo "aws CLI not found"; exit 1; }

# Current value of KEY in an env file, empty if the file or key is absent.
read_env() {
  [[ -f "$1" ]] || return 0
  grep -E "^$2=" "$1" | tail -n 1 | cut -d= -f2- || true
}

# Sets KEY=VALUE in an env file, rewriting the key in place if it is already
# there and appending it otherwise. Every other line is preserved verbatim.
# Creates the file with a header when it doesn't exist yet.
upsert_env() {
  local file="$1" key="$2" value="$3" tmp="$1.tmp.$$"
  if [[ ! -f "$file" ]]; then
    printf '# Partly managed by scripts/bootstrap-dev.sh — stage: %s\n' "$STAGE" > "$file"
  fi
  KEY="$key" VALUE="$value" awk '
    BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"]; found = 0 }
    index($0, key "=") == 1 { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

if [[ -z "${SPEECHMATICS_API_KEY:-}" ]]; then
  read -rsp "Speechmatics API key: " SPEECHMATICS_API_KEY; echo
fi
[[ -n "${SPEECHMATICS_API_KEY}" ]] || { echo "No Speechmatics key given"; exit 1; }

KEY_PARAM="/voice-ai/${STAGE}/speechmatics-api-key"
SECRET_PARAM="/voice-ai/${STAGE}/speechmatics-webhook-secret"

echo "==> Writing SSM SecureString parameters (${REGION})"
aws ssm put-parameter --region "$REGION" --name "$KEY_PARAM" \
  --type SecureString --value "$SPEECHMATICS_API_KEY" --overwrite >/dev/null
echo "    $KEY_PARAM"

# Reuse an existing webhook secret if one is already stored, so redeploys don't
# invalidate in-flight Speechmatics jobs; generate one on first run.
if EXISTING=$(aws ssm get-parameter --region "$REGION" --name "$SECRET_PARAM" \
      --with-decryption --query 'Parameter.Value' --output text 2>/dev/null); then
  echo "    $SECRET_PARAM (kept existing)"
else
  EXISTING=$(openssl rand -hex 32)
  aws ssm put-parameter --region "$REGION" --name "$SECRET_PARAM" \
    --type SecureString --value "$EXISTING" >/dev/null
  echo "    $SECRET_PARAM (generated)"
fi

echo "==> Reading stack outputs from ${STACK}"
outputs=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs' --output json)

get() { echo "$outputs" | python3 -c "import json,sys;print(next((o['OutputValue'] for o in json.load(sys.stdin) if o['OutputKey']=='$1'),''))"; }

API_BASE=$(get HttpApiUrl)
POOL_ID=$(get CognitoUserPoolId)
CLIENT_ID=$(get CognitoUserPoolClientId)
WEB_URL=$(get WebUrl)
DIST_ID=$(get WebDistributionId)

[[ -n "$API_BASE" && -n "$POOL_ID" && -n "$CLIENT_ID" ]] || {
  echo "Missing an expected stack output:"; echo "$outputs"; exit 1; }

echo "==> Updating frontend/.env"
FRONTEND_ENV="${ROOT}/frontend/.env"
upsert_env "$FRONTEND_ENV" NUXT_PUBLIC_API_BASE "$API_BASE"
upsert_env "$FRONTEND_ENV" NUXT_PUBLIC_COGNITO_USER_POOL_ID "$POOL_ID"
upsert_env "$FRONTEND_ENV" NUXT_PUBLIC_COGNITO_CLIENT_ID "$CLIENT_ID"
upsert_env "$FRONTEND_ENV" NUXT_PUBLIC_AWS_REGION "$REGION"
echo "    API      ${API_BASE}"
echo "    Pool     ${POOL_ID}"
echo "    Client   ${CLIENT_ID}"

# WEB_ORIGIN drives API Gateway + audio/transcript bucket CORS. It can only be
# the CloudFront domain once the distribution exists, so the very first deploy
# necessarily lands on the localhost default and needs one redeploy afterwards.
BACKEND_ENV="${ROOT}/backend/.env"
if [[ -n "$WEB_URL" ]]; then
  CURRENT=$(read_env "$BACKEND_ENV" WEB_ORIGIN)
  upsert_env "$BACKEND_ENV" WEB_ORIGIN "$WEB_URL"
  echo "==> Updated backend/.env  (WEB_ORIGIN=${WEB_URL})"
  if [[ "$CURRENT" != "$WEB_URL" ]]; then
    echo "    ! CORS origin changed — redeploy the backend before using the hosted app:"
    echo "        npm run deploy:backend"
  fi
fi

echo
echo "Hosted app : ${WEB_URL:-<no CloudFront distribution in this stack yet>}"
[[ -n "$DIST_ID" ]] && echo "Distribution: ${DIST_ID}"
echo "Local dev  : npm run dev --workspace frontend   →   http://localhost:3000"
echo "Publish SPA: ./scripts/deploy-frontend.sh ${STAGE}"
