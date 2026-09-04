output "app_url" {
  description = "Where staff open the app."
  value       = local.app_url
}

output "frontend_bucket" {
  description = "S3 bucket the built frontend is synced into."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "Distribution to invalidate after a deploy. Empty while CloudFront is held."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.frontend[0].id : ""
}

output "cloudfront_domain_name" {
  description = "CloudFront domain. Empty while CloudFront is held."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.frontend[0].domain_name : ""
}

output "api_url" {
  description = "Lambda function URL. The browser uses this directly until CloudFront is on."
  value       = trimsuffix(aws_lambda_function_url.api.function_url, "/")
}

output "dynamodb_table_name" {
  description = "Single table holding the branch's data."
  value       = aws_dynamodb_table.main.name
}

output "desk_pin" {
  description = "PIN used at the sign-in screen. Store this somewhere staff can see it."
  value       = local.desk_pin
  sensitive   = true
}

output "frontend_config" {
  description = "Runtime configuration document for the SPA."
  value = jsonencode({
    appName    = "ShelfKit"
    apiBaseUrl = local.api_base_url
  })
}
