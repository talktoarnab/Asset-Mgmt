# ShelfKit — Micro-Library & Asset Checkout

Lending desk for community libraries, coaching-centre resource rooms, co-working tool libraries,
and small office asset rooms. Staff sign in with a PIN, scan a printed **unit label** with a
handheld scanner (or type the serial), pick a borrower, and the loan is logged against that
specific copy — the same way a store or warehouse tracks stock.

Each catalogue item is a SKU. Each physical copy under it gets its own ID (`SKU-001`, `SKU-002`,
…). Camera scanning is not wired up yet. The desk field is a keyboard wedge, which is what USB
and Bluetooth scanners already do.

## Architecture

```
Browser  ── CloudFront
              ├── S3            HTML, CSS, JS
              └── API Gateway   /v1/*
                    └── Lambda
                          └── DynamoDB
```

CloudFront serves the desk over HTTPS from a private S3 bucket and proxies `/v1` to API Gateway
so the browser stays same-origin. Set `enable_cloudfront = false` only if you need the S3 website
fallback.

| Layer | Service | Notes |
| --- | --- | --- |
| App | CloudFront → S3 | Static HTML, CSS, JS. No build step |
| API | CloudFront `/v1` → API Gateway HTTP API → Lambda | Python 3.13, arm64. Desk PIN in `Authorization: Bearer` |
| Data | DynamoDB | On-demand, PITR, one table per environment |
| Auth | Desk PIN per branch | HMAC session token carries `orgId`. No Cognito |

## Repository layout

```
backend/     Lambda API (Python)
frontend/    Static HTML, CSS, JS for S3
infra/       Terraform (CloudFront, S3, API Gateway, Lambda, DynamoDB)
  bootstrap/ Terraform state bucket + GitHub OIDC deploy role
```

## Running it locally

You need Python 3.13+, Node (for the local static server), Docker (for DynamoDB Local), and
Terraform 1.10+ if you want to validate infra.

```bash
docker compose up -d          # DynamoDB Local on :8000
make install
make seed                     # demo catalogue, members, and loans
make dev                      # API :4000, app :5173
```

Local auth is open (`AUTH_MODE=dev`). Any PIN on the sign-in screen works. Seed creates two
desks: `dev-branch` (Kanchan Community Library) and `makerspace` (Workshop tool room). The
static server proxies `/v1` to the local API, same as CloudFront does in AWS.

## Deploying to AWS

Region default is `eu-north-1`. You need the AWS CLI v2, Terraform 1.10+, Python 3.13+, and IAM
permission to create CloudFront, Lambda, API Gateway, DynamoDB, S3, and IAM roles.

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

### 3. Build the Lambda and apply

```bash
bash backend/scripts/build.sh

cd infra
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

No npm install or bundler. Sync the static files as they are.

```bash
cd infra
terraform output -raw frontend_config > ../frontend/config.json

BUCKET=$(terraform output -raw frontend_bucket)
DIST=$(terraform output -raw cloudfront_distribution_id)

aws s3 sync ../frontend "s3://$BUCKET" --delete \
  --exclude serve.mjs --exclude index.html --exclude config.json --exclude .DS_Store \
  --cache-control 'no-cache, must-revalidate'
aws s3 cp ../frontend/index.html "s3://$BUCKET/index.html" --cache-control 'no-cache'
aws s3 cp ../frontend/config.json "s3://$BUCKET/config.json" --cache-control 'no-cache'
if [ -n "$DIST" ]; then
  aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*'
fi

terraform output -raw app_url
```

Open that URL and sign in with the desk PIN.

## Many desks, one deploy

One ShelfKit stack can host any number of libraries or tool rooms. Each desk has its own
branch ID (`kanchan`, `makerspace`, …), staff PIN, catalogue, members and loans. Data is
partitioned by `ORG#{branchId}` in DynamoDB, so one tenant cannot see another.

1. On the sign-in screen, choose **Open a desk**, pick a name, a short branch ID, and a PIN.
2. Staff later unlock with that **branch ID + PIN**.
3. Settings can rotate the PIN for that desk only.

The Terraform `org_id` / `desk_pin` values still bootstrap the first branch on an empty table
(default `main`). After that, new desks are created from the app — you do not need another
Lambda or CloudFront distribution.

## Handheld scanning

1. Print labels from **Catalogue → Labels**. Each QR encodes that copy’s unit serial (`SKU-001`).
2. Plug in a USB or Bluetooth scanner. It behaves like a keyboard.
3. Open **Desk**, leave the code field focused, scan. Enter submits and looks that unit up.
4. Check that copy out to a member, or check it in if it is already on loan. Scanning the SKU
   (without a unit suffix) lists the copies on the shelf so you can pick one.

## CI/CD

Two workflows in `.github/workflows/`. They authenticate to AWS with GitHub OIDC — no access keys.

| Workflow | When | What it does |
| --- | --- | --- |
| **CI** | Pull requests and feature branches | Test, `terraform validate`, then `terraform plan` |
| **Deploy** | Push to `main`, or **Actions → Deploy → Run workflow** | Apply, sync static files to S3, invalidate CloudFront |

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
| `ENABLE_CLOUDFRONT` (variable) | `true` |

`AWS_ROLE_ARN` must be the **`shelfkit-github-actions`** role from this account, not a Lambda execution role. If assume-role still fails, the workflow now prints the token `sub` — for repos created after 15 Jul 2026 it looks like `repo:talktoarnab@OWNER_ID/Asset-Mgmt@REPO_ID:environment:dev`.

Or with the GitHub CLI: `./configure-github.sh dev`

## Tear down (dev only)

```bash
cd infra && terraform destroy
# then, only if you also want to drop remote state:
cd bootstrap && terraform destroy
```
