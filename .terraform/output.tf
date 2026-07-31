output "s3_dev_bucket_name" {
  description = "The name of the S3 bucket"
  value       = aws_s3_bucket.Dev_bucket.bucket
}

output "api_base_url" {
  description = "Base invoke URL of the HTTP API (append /slots or /bookings)"
  value       = aws_apigatewayv2_stage.API_stage.invoke_url
}
