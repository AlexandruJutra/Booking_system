variable "bucket_prefix" {
  description = "Prefix used in all S3 bucket names (kept secret via GitHub Actions secrets)"
  type        = string
}