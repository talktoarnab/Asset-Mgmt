output "app_url" {
  description = "Where staff open the app."
  value       = local.app_url
}

output "frontend_bucket" {
  description = "S3 bucket the built frontend is synced into."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "Distribution to invalidate after a deploy."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain."
  value       = aws_cloudfront_distribution.frontend.domain_name
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

/**
 * Written to the frontend bucket by the deploy job as config.json. The API is
 * same-origin (/v1/…) via CloudFront, so apiBaseUrl is empty.
 */
output "frontend_config" {
  description = "Runtime configuration document for the SPA."
  value = jsonencode({
    appName    = "ShelfKit"
    apiBaseUrl = ""
  })
}
