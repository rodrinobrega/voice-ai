#!/usr/bin/env bash
#
# Builds the Nuxt SPA against a deployed stage's stack outputs, publishes it to
# that stage's web bucket, and invalidates the CloudFront cache.
#
# Usage:  ./scripts/deploy-frontend.sh [stage]
#
set -euo pipefail

STAGE="${1:-dev}"
REGION="${AWS_REGION:-eu-west-1}"
STACK="voice-ai-backend-${STAGE}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

outputs=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs' --output json)
get() { echo "$outputs" | python3 -c "import json,sys;print(next((o['OutputValue'] for o in json.load(sys.stdin) if o['OutputKey']=='$1'),''))"; }

API_BASE=$(get HttpApiUrl)
POOL_ID=$(get CognitoUserPoolId)
CLIENT_ID=$(get CognitoUserPoolClientId)
BUCKET=$(get WebBucketName)
DIST_ID=$(get WebDistributionId)
WEB_URL=$(get WebUrl)

# Every one of these is required to publish a working SPA, so bail before the
# build rather than after. `get` prints an empty string for an output the stack
# doesn't have, and the build below consumes the first three as assignment
# prefixes to `npm` — bash reports npm's exit status, not the substitution's, so
# an unchecked empty value would build an app with no API base, sync it to S3,
# invalidate CloudFront and still exit 0. The failure would only show up as
# every request from the live app going nowhere.
missing=()
[[ -n "$API_BASE" ]] || missing+=(HttpApiUrl)
[[ -n "$POOL_ID" ]] || missing+=(CognitoUserPoolId)
[[ -n "$CLIENT_ID" ]] || missing+=(CognitoUserPoolClientId)
[[ -n "$BUCKET" ]] || missing+=(WebBucketName)
[[ -n "$DIST_ID" ]] || missing+=(WebDistributionId)
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Stack ${STACK} is missing required output(s): ${missing[*]}" >&2
  echo "Deploy the backend for this stage first:  ./scripts/deploy-backend.sh ${STAGE}" >&2
  exit 1
fi

echo "==> Building SPA for ${STAGE}"
echo "    API ${API_BASE}"
NUXT_PUBLIC_API_BASE="$API_BASE" \
NUXT_PUBLIC_COGNITO_USER_POOL_ID="$POOL_ID" \
NUXT_PUBLIC_COGNITO_CLIENT_ID="$CLIENT_ID" \
NUXT_PUBLIC_AWS_REGION="$REGION" \
  npm run generate --workspace frontend

echo "==> Syncing to s3://${BUCKET}"
# Hashed build assets are immutable; HTML must never be cached at the edge or
# a deploy would keep serving the previous entrypoint.
aws s3 sync "${ROOT}/frontend/.output/public" "s3://${BUCKET}" --delete \
  --exclude '*.html' --cache-control 'public,max-age=31536000,immutable'
aws s3 sync "${ROOT}/frontend/.output/public" "s3://${BUCKET}" --delete \
  --exclude '*' --include '*.html' --cache-control 'no-cache'

echo "==> Invalidating CloudFront ${DIST_ID}"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' \
  --query 'Invalidation.Id' --output text

echo
echo "Live at ${WEB_URL}  (edge propagation takes a minute or two)"
