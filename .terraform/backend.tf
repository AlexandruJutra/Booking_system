terraform {
  # Configure the backend to use an S3 bucket for storing the Terraform state file
  backend "s3" {
    bucket       = "terraform-tfstate-bucket-md-2026"
    key          = "dev/terraform.tfstate"
    region       = "eu-north-1"
    encrypt      = true
    use_lockfile = true
  }
}
