/**
 * Remote state. Left as a partial configuration so the same code serves every
 * environment; CI supplies the bucket, key and region. Locking uses an S3
 * lockfile (Terraform 1.10+), so no DynamoDB lock table is required.
 *
 *   terraform init \
 *     -backend-config="bucket=my-tfstate" \
 *     -backend-config="key=shelfkit/dev/terraform.tfstate" \
 *     -backend-config="region=eu-north-1"
 *
 * For a first local experiment, comment this block out to use local state.
 */
terraform {
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
