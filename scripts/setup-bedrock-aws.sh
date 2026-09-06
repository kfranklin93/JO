#!/usr/bin/env bash
#
# One-shot AWS-side setup for the Bedrock integration.
#
#   ./scripts/setup-bedrock-aws.sh              # do it
#   ./scripts/setup-bedrock-aws.sh --dry-run    # show what it would do, change nothing
#
# Prerequisite: `aws sts get-caller-identity` must already return an identity
# with permission to manage IAM and Bedrock. Create that credential in the
# console, run `aws configure` yourself, then run this. The secret is never
# passed as an argument and never printed.
#
# What it changes in your AWS account:
#   - grants model access for the Claude model below (accepts the EULA via API)
#   - creates an IAM policy scoped to invoking that one model
#   - creates an IAM user, attaches that policy, and issues one access key
#
# What it changes locally:
#   - rewrites the four AWS_* lines in .env.local (a timestamped backup is kept)
#
# Idempotent: existing policy, user, and model agreement are detected and reused
# rather than duplicated. Safe to re-run.

set -euo pipefail

MODEL_ID="anthropic.claude-haiku-4-5-20251001-v1:0"
IAM_USER="joey-o-bedrock-app"
IAM_POLICY="JoeyOBedrockInvoke"
# Destination regions for the US cross-region inference profile. The policy must
# cover the underlying foundation model in each, not just the profile itself.
CRIS_REGIONS=(us-east-1 us-east-2 us-west-2)

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; DIM=$'\e[2m'; BOLD=$'\e[1m'; OFF=$'\e[0m'
ok()   { printf '%s  ok  %s%s\n'   "$GREEN"  "$OFF" "$1"; }
bad()  { printf '%s fail %s%s\n'   "$RED"    "$OFF" "$1"; }
warn() { printf '%s warn %s%s\n'   "$YELLOW" "$OFF" "$1"; }
info() { printf '%s      %s%s\n'   "$DIM"    "$1"  "$OFF"; }
step() { printf '\n%s%s%s\n'       "$BOLD"   "$1"  "$OFF"; }
run()  { if $DRY_RUN; then info "would run: $*"; else "$@"; fi; }

export AWS_PAGER=""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

$DRY_RUN && warn "Dry run — nothing will be created or modified."

# ─── 1. Preflight ────────────────────────────────────────────────────────────
step "1. Preflight"

command -v aws >/dev/null 2>&1 || { bad "AWS CLI not found on PATH"; exit 1; }
ok "AWS CLI $(aws --version 2>&1 | cut -d' ' -f1 | cut -d/ -f2)"

if ! IDENTITY=$(aws sts get-caller-identity --output json 2>&1); then
  bad "No valid AWS credentials."
  info "Create an access key in the console, then run: aws configure"
  info "Detail: $(printf '%s' "$IDENTITY" | tr -d '\n' | cut -c1-160)"
  exit 1
fi

ACCOUNT_ID=$(printf '%s' "$IDENTITY" | sed -n 's/.*"Account": *"\([0-9]*\)".*/\1/p')
CALLER_ARN=$(printf '%s' "$IDENTITY" | sed -n 's/.*"Arn": *"\([^"]*\)".*/\1/p')
REGION="${AWS_REGION:-$(aws configure get region || echo us-east-1)}"

ok "Account $ACCOUNT_ID"
info "Caller: $CALLER_ARN"
ok "Region $REGION"

if [[ "$CALLER_ARN" == *":root" ]]; then
  warn "You are authenticated as the root user."
  info "This works, but rotate to an IAM user afterwards and delete the root key."
fi

# ─── 2. Model access ─────────────────────────────────────────────────────────
step "2. Model access for $MODEL_ID"

AVAILABILITY=$(aws bedrock get-foundation-model-availability \
  --model-id "$MODEL_ID" --region "$REGION" --output json 2>&1 || true)

if printf '%s' "$AVAILABILITY" | grep -q '"agreementAvailability"'; then
  AGREEMENT_STATUS=$(printf '%s' "$AVAILABILITY" \
    | tr -d ' \n' | sed -n 's/.*"agreementAvailability":{"status":"\([A-Z_]*\)".*/\1/p')
  ENTITLED=$(printf '%s' "$AVAILABILITY" \
    | sed -n 's/.*"entitlementAvailability": *"\([A-Z_]*\)".*/\1/p')
  info "agreement: ${AGREEMENT_STATUS:-unknown}   entitlement: ${ENTITLED:-unknown}"
else
  warn "Could not read availability in $REGION."
  info "$(printf '%s' "$AVAILABILITY" | tr -d '\n' | cut -c1-200)"
  AGREEMENT_STATUS=""
  ENTITLED=""
fi

if [[ "$ENTITLED" == "AVAILABLE" && "$AGREEMENT_STATUS" == "AVAILABLE" ]]; then
  ok "Already entitled — nothing to accept."
else
  info "Requesting access (this accepts the model EULA on your behalf)..."
  OFFERS=$(aws bedrock list-foundation-model-agreement-offers \
    --model-id "$MODEL_ID" --region "$REGION" --output json 2>&1 || true)
  OFFER_TOKEN=$(printf '%s' "$OFFERS" \
    | sed -n 's/.*"offerToken": *"\([^"]*\)".*/\1/p' | head -1)

  if [[ -n "$OFFER_TOKEN" ]]; then
    if run aws bedrock create-foundation-model-agreement \
         --model-id "$MODEL_ID" --offer-token "$OFFER_TOKEN" --region "$REGION" >/dev/null 2>&1; then
      ok "Model agreement created."
    else
      warn "Agreement call did not succeed. It may already exist, or need console approval."
      info "Check: Bedrock console → Model access, in $REGION."
    fi
  else
    warn "No offer token returned."
    info "Enable it manually: Bedrock console → Model access → Manage → Claude 3.5 Sonnet v2."
    info "$(printf '%s' "$OFFERS" | tr -d '\n' | cut -c1-200)"
  fi
fi

# ─── 3. Resolve the id to actually invoke ────────────────────────────────────
step "3. Invocation id"

# Recent Claude models reject bare model ids with "on-demand throughput isn't
# supported" and require a cross-region inference profile instead.
PROFILE_ID="us.$MODEL_ID"
PROFILES=$(aws bedrock list-inference-profiles --region "$REGION" --output json 2>&1 || true)

if printf '%s' "$PROFILES" | grep -q "$PROFILE_ID"; then
  INVOKE_ID="$PROFILE_ID"
  ok "Using inference profile: $INVOKE_ID"
else
  INVOKE_ID="$MODEL_ID"
  warn "Inference profile $PROFILE_ID not listed; falling back to the bare id."
  info "If invocation fails with an on-demand-throughput error, set it to $PROFILE_ID."
fi

# ─── 4. Scoped IAM policy ────────────────────────────────────────────────────
step "4. IAM policy $IAM_POLICY"

RESOURCES="\"arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:inference-profile/${PROFILE_ID}\""
for r in "${CRIS_REGIONS[@]}"; do
  RESOURCES="$RESOURCES,\"arn:aws:bedrock:${r}::foundation-model/${MODEL_ID}\""
done

POLICY_DOC=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeClaudeOnly",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": [$RESOURCES]
    }
  ]
}
JSON
)

POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${IAM_POLICY}"

if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  ok "Policy already exists — reusing it."
  info "Delete and re-run if the model or regions changed."
else
  info "Creating policy scoped to one model (not AmazonBedrockFullAccess)."
  if $DRY_RUN; then
    info "would create policy with document:"
    printf '%s\n' "$POLICY_DOC" | sed 's/^/        /'
  else
    aws iam create-policy \
      --policy-name "$IAM_POLICY" \
      --policy-document "$POLICY_DOC" \
      --description "Invoke only the Claude model used by the Joey O site" >/dev/null
    ok "Policy created: $POLICY_ARN"
  fi
fi

# ─── 5. IAM user ─────────────────────────────────────────────────────────────
step "5. IAM user $IAM_USER"

if aws iam get-user --user-name "$IAM_USER" >/dev/null 2>&1; then
  ok "User already exists."
else
  run aws iam create-user --user-name "$IAM_USER" \
    --tags Key=project,Value=joeyo-real-estate >/dev/null
  ok "User created (no console access)."
fi

run aws iam attach-user-policy --user-name "$IAM_USER" --policy-arn "$POLICY_ARN"
ok "Policy attached."

# ─── 6. Access key ───────────────────────────────────────────────────────────
step "6. Access key"

EXISTING_KEYS=$(aws iam list-access-keys --user-name "$IAM_USER" \
  --query 'length(AccessKeyMetadata)' --output text 2>/dev/null || echo 0)

if [[ "$EXISTING_KEYS" != "0" && "$EXISTING_KEYS" != "None" ]]; then
  warn "$IAM_USER already has $EXISTING_KEYS access key(s)."
  info "AWS allows two. Delete an unused one if you want a fresh pair:"
  info "  aws iam list-access-keys --user-name $IAM_USER"
  info "  aws iam delete-access-key --user-name $IAM_USER --access-key-id <id>"
  info "Skipping key creation so nothing in use is disturbed."
  NEW_KEY_ID=""
  NEW_SECRET=""
elif $DRY_RUN; then
  info "would create an access key and write it into .env.local"
  NEW_KEY_ID=""
  NEW_SECRET=""
else
  KEY_JSON=$(aws iam create-access-key --user-name "$IAM_USER" --output json)
  NEW_KEY_ID=$(printf '%s' "$KEY_JSON" | sed -n 's/.*"AccessKeyId": *"\([^"]*\)".*/\1/p')
  NEW_SECRET=$(printf '%s' "$KEY_JSON" | sed -n 's/.*"SecretAccessKey": *"\([^"]*\)".*/\1/p')
  # Printed masked on purpose: the full secret goes to .env.local and nowhere else.
  ok "Key created: ${NEW_KEY_ID:0:8}… (secret withheld from output)"
fi

# ─── 7. Write .env.local ─────────────────────────────────────────────────────
step "7. Local configuration"

if [[ -z "${NEW_SECRET:-}" ]]; then
  info "No new key to write."
  info "Set AWS_BEDROCK_MODEL_ID=$INVOKE_ID in .env.local manually if it differs."
else
  BACKUP="${ENV_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_FILE" "$BACKUP"
  ok "Backed up .env.local → $(basename "$BACKUP")"

  TMP=$(mktemp)
  # Drop the four managed lines, then append current values. Everything else in
  # the file is preserved byte for byte.
  grep -vE '^(AWS_REGION|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_BEDROCK_MODEL_ID)=' \
    "$ENV_FILE" > "$TMP" || true
  {
    printf '\n# Managed by scripts/setup-bedrock-aws.sh on %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'AWS_REGION=%s\n' "$REGION"
    printf 'AWS_ACCESS_KEY_ID=%s\n' "$NEW_KEY_ID"
    printf 'AWS_SECRET_ACCESS_KEY=%s\n' "$NEW_SECRET"
    printf 'AWS_BEDROCK_MODEL_ID=%s\n' "$INVOKE_ID"
  } >> "$TMP"
  mv "$TMP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Wrote AWS_* values into .env.local (mode 600)"
fi

# ─── 8. Verify ───────────────────────────────────────────────────────────────
step "8. Verification"

if $DRY_RUN; then
  info "would run: npm run check:bedrock"
else
  info "IAM propagation can take a few seconds; retrying if needed."
  for attempt in 1 2 3; do
    if (cd "$REPO_ROOT" && npm run --silent check:bedrock); then
      break
    fi
    if [[ $attempt -lt 3 ]]; then
      warn "Attempt $attempt failed. Waiting 10s for IAM to propagate..."
      sleep 10
    else
      bad "Still failing after 3 attempts. Read the diagnosis above."
    fi
  done
fi

step "Next"
cat <<TEXT
  1. Mirror these into Netlify and redeploy. Kiro can do this part:
       AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BEDROCK_MODEL_ID
  2. If you used a temporary admin key to run this, delete it now — the scoped
     $IAM_USER key is all the app needs:
       aws iam list-access-keys --user-name <your-admin-user>
       aws iam delete-access-key --user-name <your-admin-user> --access-key-id <id>
  3. Set a billing alert. AWS Billing → Budgets → a low monthly threshold.
  4. Never commit .env.local. It is gitignored; keep it that way.
TEXT
