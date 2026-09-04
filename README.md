# ShelfKit — Micro-Library & Asset Checkout

Lending desk for community libraries, coaching-centre resource rooms, co-working tool libraries,
and small office asset rooms. Staff sign in with a PIN, scan a printed label with a **handheld
scanner** (or type the code), pick a borrower, and the loan is logged.

Camera scanning is not wired up yet. The desk field is a keyboard wedge, which is what USB and
Bluetooth scanners already do. The `/v1/scan` lookup stays so a camera can be plugged in later
without changing checkout.

## Architecture

While AWS Support verifies the account for CloudFront, the desk is served from S3
(HTTP website) and the browser calls the Lambda function URL directly.

```
Browser  ── S3 website   (React desk app, HTTP)
         ── Lambda URL   (API, /v1/*)
                │
                └── DynamoDB
```

Set `enable_cloudfront = true` and re-apply after verification. That puts CloudFront
in front of a private bucket and signs Lambda URL requests (AWS_IAM + OAC).

| Layer | Service | Notes |
| --- | --- | --- |
| App | S3 website (CloudFront held) | SPA. Error document is `index.html` for client routes |
| API | Lambda function URL | Node 22, arm64. Public URL + desk PIN until CloudFront is on |
| Data | DynamoDB | On-demand, PITR, one table per environment |
| Auth | Desk PIN | HMAC session token in `Authorization: Bearer`. No Cognito |

## Repository layout

```
backend/     Lambda API (TypeScript)
frontend/    React + Vite desk app
infra/       Terraform (CloudFront, S3, Lambda, DynamoDB)
  bootstrap/ Terraform state bucket + GitHub OIDC deploy role
```

## Running it locally

You need Node 22+, Docker (for DynamoDB Local), and Terraform 1.10+ if you want to validate infra.

```bash
docker compose up -d          # DynamoDB Local on :8000
make install
make seed                     # demo catalogue, members, and loans
make dev                      # API :4000, app :5173
```

Local auth is open (`AUTH_MODE=dev`). Any PIN on the sign-in screen works. The Vite proxy sends
`/v1` to the local API, same as CloudFront does in AWS.

## Deploying to AWS

Region default is `eu-north-1`. You need the AWS CLI v2, Terraform 1.10+, Node 22+, and IAM
permission to create Lambda, DynamoDB, S3, and IAM roles. CloudFront is optional until AWS
verifies the account.

### 1. Sign in

```bash
aws configure   # region eu-north-1, or export AWS_PROFILE=your-profile
aws sts get-caller-identity
```

### 2. State backend (once per account)

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

Note `state_bucket`. Do not destroy this stack while the app is still deployed.

### 3. Build Lambdas and apply

```bash
cd backend && npm ci && npm run build

cd ../infra
cp terraform.tfvars.example terraform.tfvars   # edit org_name if you like

terraform init \
  -backend-config="bucket=YOUR_STATE_BUCKET" \
  -backend-config="key=shelfkit/dev/terraform.tfstate" \
  -backend-config="region=eu-north-1"

terraform plan
terraform apply
```

Copy the PIN:

```bash
terraform output -raw desk_pin
```

### 4. Publish the frontend

```bash
cd ../frontend && npm ci && npm run build
cd ../infra && terraform output -raw frontend_config > ../frontend/dist/config.json

BUCKET=$(terraform output -raw frontend_bucket)
DIST=$(terraform output -raw cloudfront_distribution_id)

aws s3 sync ../frontend/dist "s3://$BUCKET" --delete \
  --exclude index.html --exclude config.json --exclude '*.map' \
  --cache-control 'public, max-age=31536000, immutable'
aws s3 cp ../frontend/dist/index.html "s3://$BUCKET/index.html" --cache-control 'no-cache'
aws s3 cp ../frontend/dist/config.json "s3://$BUCKET/config.json" --cache-control 'no-cache'
if [ -n "$DIST" ]; then
  aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*'
fi

terraform output -raw app_url
```

Open that URL and sign in with the desk PIN.

## Handheld scanning

1. Print labels from **Catalogue → Labels**. Each QR encodes the item’s short code.
2. Plug in a USB or Bluetooth scanner. It behaves like a keyboard.
3. Open **Desk**, leave the code field focused, scan. Enter submits and looks the item up.
4. Check it out to a member, or check it in if it is already on loan.

## CI/CD

Two workflows in `.github/workflows/`. They authenticate to AWS with GitHub OIDC — no access keys.

| Workflow | When | What it does |
| --- | --- | --- |
| **CI** | Pull requests and feature branches | Lint, test, `terraform validate`, then `terraform plan` |
| **Deploy** | Push to `main`, or **Actions → Deploy → Run workflow** | Apply, build the SPA, sync to S3 (invalidate CloudFront when it is enabled) |

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

Put these on the GitHub repo (**Settings → Secrets and variables → Actions**), and again on the `dev` Environment if you use one:

| Secret / variable | From |
| --- | --- |
| `AWS_ROLE_ARN` (secret) | `terraform output -raw github_actions_role_arn` |
| `TF_STATE_BUCKET` (secret) | `terraform output -raw state_bucket` |
| `AWS_REGION` (variable) | `eu-north-1` |
| `TF_ENVIRONMENT` (variable) | `dev` |
| `TF_STATE_KEY` (variable) | `shelfkit/dev/terraform.tfstate` |
| `ENABLE_CLOUDFRONT` (variable) | `false` until AWS verifies CloudFront |

`AWS_ROLE_ARN` must be the **`shelfkit-github-actions`** role from this account, not a Lambda execution role. If assume-role still fails, the workflow now prints the token `sub` — for repos created after 15 Jul 2026 it looks like `repo:talktoarnab@OWNER_ID/Asset-Mgmt@REPO_ID:environment:dev`.

Or with the GitHub CLI: `./configure-github.sh dev`

## Tear down (dev only)

```bash
cd infra && terraform destroy
# then, only if you also want to drop remote state:
cd bootstrap && terraform destroy
```
