# Built by `npm --prefix backend run build` before terraform runs; the CI
# workflow does this in every job so plan and apply see identical hashes.
data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${local.backend_artifacts}/api"
  output_path = "${path.module}/.build/api.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# The API role can read and write records but cannot delete the table, change
# its schema, or read any other table in the account.
data "aws_iam_policy_document" "api_permissions" {
  statement {
    sid = "TableAccess"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:TransactGetItems",
      "dynamodb:TransactWriteItems",
    ]

    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*",
    ]
  }
}

resource "aws_iam_role" "api" {
  name               = "${local.name_prefix}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "api" {
  name   = "${local.name_prefix}-api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_permissions.json
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name_prefix}-api"
  description      = "HTTP API for members, catalogue, checkouts and reporting"
  role             = aws_iam_role.api.arn
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  memory_size      = var.lambda_memory_mb
  timeout          = var.lambda_timeout_seconds

  environment {
    variables = {
      TABLE_NAME     = aws_dynamodb_table.main.name
      ORG_ID         = var.org_id
      ORG_NAME       = var.org_name
      DESK_PIN       = local.desk_pin
      SESSION_SECRET = random_password.session_secret.result
      STAGE          = var.environment
    }
  }

  depends_on = [aws_iam_role_policy_attachment.api_logs]
}

# Without CloudFront the browser calls this URL directly (PIN auth still applies).
# With CloudFront, AWS_IAM + OAC keeps the raw URL unusable.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = var.enable_cloudfront ? "AWS_IAM" : "NONE"

  dynamic "cors" {
    for_each = var.enable_cloudfront ? [] : [1]
    content {
      allow_origins = ["*"]
      allow_methods = ["*"]
      allow_headers = ["authorization", "content-type"]
      max_age       = 86400
    }
  }
}

resource "aws_lambda_permission" "cloudfront" {
  count                  = var.enable_cloudfront ? 1 : 0
  statement_id           = "AllowCloudFrontInvokeUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.frontend[0].arn
  function_url_auth_type = "AWS_IAM"
}
