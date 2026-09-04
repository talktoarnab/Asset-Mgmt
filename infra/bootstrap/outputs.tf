output "state_bucket" {
  description = "Pass this as -backend-config=bucket=… when initialising infra/."
  value       = aws_s3_bucket.state.bucket
}

output "region" {
  description = "Region of the state backend."
  value       = var.aws_region
}

output "init_command" {
  description = "Copy-paste to initialise the application stack against this backend."
  value       = <<-EOT
    terraform init \
      -backend-config="bucket=${aws_s3_bucket.state.bucket}" \
      -backend-config="key=${var.project}/dev/terraform.tfstate" \
      -backend-config="region=${var.aws_region}"
  EOT
}

output "github_actions_role_arn" {
  description = "Store this as the GitHub Actions secret AWS_ROLE_ARN."
  value       = local.github_enabled ? aws_iam_role.github_actions[0].arn : null
}

output "github_repository" {
  description = "Repository allowed to assume the deploy role."
  value       = local.github_enabled ? local.github_repo_nwo : null
}

output "github_setup_commands" {
  description = "Creates the GitHub Environment and writes the secrets the workflows expect."
  value = local.github_enabled ? join("\n", [
    "gh secret set AWS_ROLE_ARN --repo ${local.github_repo_nwo} --env dev --body \"${aws_iam_role.github_actions[0].arn}\"",
    "gh secret set TF_STATE_BUCKET --repo ${local.github_repo_nwo} --env dev --body \"${aws_s3_bucket.state.bucket}\"",
    "gh variable set AWS_REGION --repo ${local.github_repo_nwo} --body \"${var.aws_region}\"",
    "gh variable set TF_ENVIRONMENT --repo ${local.github_repo_nwo} --body \"dev\"",
    "gh variable set TF_STATE_KEY --repo ${local.github_repo_nwo} --body \"${var.project}/dev/terraform.tfstate\"",
  ]) : null
}
