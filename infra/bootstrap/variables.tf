variable "project" {
  description = "Short name used to prefix the state bucket and lock table."
  type        = string
  default     = "shelfkit"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project))
    error_message = "project must be lowercase letters, digits and dashes (3-21 characters)."
  }
}

variable "aws_region" {
  description = "Region for the state bucket and lock table. Use the same region as the application."
  type        = string
  default     = "eu-north-1"
}

# ------------------------------------------------------------------ github --

variable "github_org" {
  description = "GitHub user or organisation that owns the repository. Empty disables the GitHub Actions role."
  type        = string
  default     = "talktoarnab"
}

variable "github_repo" {
  description = "Repository name (without the org prefix)."
  type        = string
  default     = "Asset-Mgmt"
}

variable "github_environments" {
  description = "GitHub Environments whose jobs may assume the deploy role. Must match the environment: key in the workflows."
  type        = list(string)
  default     = ["dev", "staging", "prod"]
}

variable "create_github_oidc_provider" {
  description = "Set false if this account already has the GitHub OIDC identity provider (there can be only one)."
  type        = bool
  default     = true
}
