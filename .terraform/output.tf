output "s3_dev_bucket_name" {
  description = "The name of the S3 bucket"
  value       = aws_s3_bucket.Dev_bucket.bucket
}
