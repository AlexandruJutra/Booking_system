locals {
  s3_origin_id = "S3-${aws_s3_bucket.Dev_bucket.id}"
  my_domain    = "mydomain.com"
}