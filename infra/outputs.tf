output "app_url" {
  description = "Where staff open the app."
  value       = local.app_url
}

output "frontend_bucket" {
  description = "S3 bucket the built frontend is synced into."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "Distribution to invalidate after a deploy. Empty if CloudFront is off."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.frontend[0].id : ""
}

output "cloudfront_domain_name" {
  description = "CloudFront domain. Empty if CloudFront is off."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.frontend[0].domain_name : ""
}

output "api_url" {
  description = "API Gateway URL. Unused by the browser when CloudFront is on (same-origin /v1)."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "dynamodb_table_name" {
  description = "Single table holding every desk. Rows are partitioned by ORG#{branchId}."
  value       = aws_dynamodb_table.main.name
}

output "desk_pin" {
  description = "Bootstrap PIN for the default branch (var.org_id) until that desk sets its own PIN in Settings."
  value       = local.desk_pin
  sensitive   = true
}

output "frontend_config" {
  description = "Runtime configuration document for the desk app."
  value = jsonencode({
    appName    = "ShelfKit"
    apiBaseUrl = local.api_base_url
  })
}
