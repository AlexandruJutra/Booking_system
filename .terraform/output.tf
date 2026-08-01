output "s3_dev_bucket_name" {
  description = "The name of the S3 bucket"
  value       = aws_s3_bucket.Dev_bucket.bucket
}

output "api_base_url" {
  description = "Base invoke URL of the HTTP API (append /slots or /bookings)"
  value       = aws_apigatewayv2_stage.API_stage.invoke_url
}

output "cognito_region" {
  description = "AWS region of the Cognito user pool"
  value       = local.region
}

output "cognito_user_pool_id" {
  description = "Cognito user pool ID used by the website"
  value       = aws_cognito_user_pool.booking_pool.id
}

output "cognito_client_id" {
  description = "Cognito app client ID used by the browser"
  value       = aws_cognito_user_pool_client.booking_client.id
}
