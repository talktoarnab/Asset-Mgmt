#!/usr/bin/env bash
# Push Terraform outputs into GitHub Environment secrets and repository variables.
# Requires: gh (authenticated), terraform (applied in this directory).
set -euo pipefail

cd "$(dirname "$0")"

ENV_NAME="${1:-dev}"
REPO="$(terraform output -raw github_repository)"
ROLE="$(terraform output -raw github_actions_role_arn)"
BUCKET="$(terraform output -raw state_bucket)"
REGION="$(terraform output -raw region)"
PROJECT="${TF_PROJECT:-shelfkit}"

if [[ -z "$REPO" || "$REPO" == "null" ]]; then
  echo "github_repository output is empty — set github_org and github_repo, then re-apply." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: brew install gh && gh auth login" >&2
  exit 1
fi

echo "Creating GitHub Environment '$ENV_NAME' on $REPO…"
gh api --method PUT "repos/${REPO}/environments/${ENV_NAME}" --silent

echo "Writing repository secrets…"
gh secret set AWS_ROLE_ARN --repo "$REPO" --body "$ROLE"
gh secret set TF_STATE_BUCKET --repo "$REPO" --body "$BUCKET"

echo "Writing the same values on Environment '$ENV_NAME'…"
gh secret set AWS_ROLE_ARN --repo "$REPO" --env "$ENV_NAME" --body "$ROLE"
gh secret set TF_STATE_BUCKET --repo "$REPO" --env "$ENV_NAME" --body "$BUCKET"

echo "Writing repository variables…"
gh variable set AWS_REGION --repo "$REPO" --body "$REGION"
gh variable set TF_ENVIRONMENT --repo "$REPO" --body "$ENV_NAME"
gh variable set TF_STATE_KEY --repo "$REPO" --body "${PROJECT}/${ENV_NAME}/terraform.tfstate"
gh variable set ENABLE_CLOUDFRONT --repo "$REPO" --body "true"

echo
echo "Done. Open https://github.com/${REPO}/settings/environments"
echo "Then merge to main or run: gh workflow run Deploy --repo $REPO"
