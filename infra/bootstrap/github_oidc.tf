/**
 * GitHub Actions talks to AWS through OIDC — no long-lived access keys.
 * The workflows already request id-token: write; this role is what they assume.
 *
 * Trust is bound to this repository. Repos created after 15 Jul 2026 mint an
 * immutable `sub` that includes numeric owner/repo IDs
 * (`repo:org@123/repo@456:ref:refs/heads/main`). Matching only
 * `repo:org/repo:*` is why AssumeRoleWithWebIdentity was denied.
 */
locals {
  github_enabled  = var.github_org != "" && var.github_repo != ""
  github_repo_nwo = "${var.github_org}/${var.github_repo}"

  github_oidc_provider_arn = local.github_enabled ? (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  ) : null

  # Service policies covering everything terraform apply and the frontend
  # publish step need. IAM is handled separately and scoped to this project.
  gha_managed_policies = [
    "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
    "arn:aws:iam::aws:policy/AmazonS3FullAccess",
    "arn:aws:iam::aws:policy/CloudFrontFullAccess",
    "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
    "arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator",
  ]
}

resource "aws_iam_openid_connect_provider" "github" {
  count = local.github_enabled && var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

data "aws_iam_openid_connect_provider" "github" {
  count = local.github_enabled && !var.create_github_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_assume" {
  count = local.github_enabled ? 1 : 0

  statement {
    sid     = "GitHubActionsOidc"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Match both the legacy name-only subject and GitHub's immutable
    # owner_id/repo_id form. The job may present :ref:, :environment:, or
    # :pull_request — the trailing * covers all of them.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = distinct(concat(
        [
          "repo:${var.github_org}/${var.github_repo}:*",
          "repo:${var.github_org}@*/${var.github_repo}@*:*",
        ],
        [
          "repo:${lower(var.github_org)}/${var.github_repo}:*",
          "repo:${lower(var.github_org)}@*/${var.github_repo}@*:*",
        ],
        [
          "repo:${var.github_org}/${lower(var.github_repo)}:*",
          "repo:${var.github_org}@*/${lower(var.github_repo)}@*:*",
        ],
        [
          "repo:${lower(var.github_org)}/${lower(var.github_repo)}:*",
          "repo:${lower(var.github_org)}@*/${lower(var.github_repo)}@*:*",
        ],
      ))
    }
  }
}

resource "aws_iam_role" "github_actions" {
  count                = local.github_enabled ? 1 : 0
  name                 = "${var.project}-github-actions"
  description          = "Assumed by GitHub Actions in ${local.github_repo_nwo} to plan, apply and publish"
  assume_role_policy   = data.aws_iam_policy_document.github_assume[0].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "github_actions" {
  for_each = local.github_enabled ? toset(local.gha_managed_policies) : toset([])

  role       = aws_iam_role.github_actions[0].name
  policy_arn = each.value
}

# Terraform creates Lambda roles named ${project}-*. The GitHub
# role may manage those and nothing else — no users, no account password policy.
data "aws_iam_policy_document" "github_iam" {
  statement {
    sid = "ManageProjectRoles"

    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
    ]

    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project}-*"]
  }

  statement {
    sid       = "PassProjectRolesToCompute"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project}-*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  statement {
    sid       = "AttachLambdaBasicExecution"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project}-*"]

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
    }
  }

  statement {
    sid       = "ReadLambdaBasicExecutionPolicy"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion"]
    resources = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
  }

  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole", "iam:GetRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/*"]
  }
}

resource "aws_iam_role_policy" "github_iam" {
  count  = local.github_enabled ? 1 : 0
  name   = "${var.project}-github-actions-iam"
  role   = aws_iam_role.github_actions[0].id
  policy = data.aws_iam_policy_document.github_iam.json
}
