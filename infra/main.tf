data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name_prefix = "${var.project}-${var.environment}"

  tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Application = "micro-library-asset-checkout"
    },
    var.tags,
  )

  account_id = data.aws_caller_identity.current.account_id
  app_url    = "https://${aws_cloudfront_distribution.frontend.domain_name}"

  backend_artifacts = "${path.module}/../backend/artifacts"

  desk_pin = var.desk_pin != "" ? var.desk_pin : random_password.desk_pin[0].result
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "random_password" "session_secret" {
  length  = 48
  special = false
}

resource "random_password" "desk_pin" {
  count   = var.desk_pin == "" ? 1 : 0
  length  = 6
  special = false
  upper   = false
  lower   = false
  numeric = true
}
