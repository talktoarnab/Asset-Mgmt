variable "project" {
  description = "Short name used to prefix every resource."
  type        = string
  default     = "shelfkit"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project))
    error_message = "project must be lowercase letters, digits and dashes (3-21 characters)."
  }
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "Region for S3, Lambda and DynamoDB. CloudFront is global."
  type        = string
  default     = "eu-north-1"
}

variable "enable_cloudfront" {
  description = "Create the CloudFront distribution. Leave false until AWS has verified the account for CloudFront."
  type        = bool
  default     = false
}

variable "cloudfront_price_class" {
  description = "CloudFront price class. PriceClass_200 covers Asia and Europe without paying for every edge."
  type        = string
  default     = "PriceClass_200"
}

variable "lambda_memory_mb" {
  description = "Memory for the API Lambda. More memory also means proportionally more CPU."
  type        = number
  default     = 512
}

variable "lambda_timeout_seconds" {
  description = "Timeout for the API Lambda."
  type        = number
  default     = 15
}

variable "desk_pin" {
  description = "Staff PIN used to sign in at the desk. Leave empty to generate a 6-digit PIN (see the desk_pin output)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "org_id" {
  description = "Single-branch identifier stored on every DynamoDB item."
  type        = string
  default     = "main"
}

variable "org_name" {
  description = "Display name for the branch, used when the org record is first created."
  type        = string
  default     = "My Library"
}

variable "dynamodb_billing_mode" {
  description = "PAY_PER_REQUEST suits the spiky, low-volume traffic of a branch library."
  type        = string
  default     = "PAY_PER_REQUEST"

  validation {
    condition     = contains(["PAY_PER_REQUEST", "PROVISIONED"], var.dynamodb_billing_mode)
    error_message = "dynamodb_billing_mode must be PAY_PER_REQUEST or PROVISIONED."
  }
}

variable "point_in_time_recovery" {
  description = "Continuous backups for the table."
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Blocks accidental terraform destroy of the table holding every loan record."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Extra tags merged into every resource."
  type        = map(string)
  default     = {}
}
