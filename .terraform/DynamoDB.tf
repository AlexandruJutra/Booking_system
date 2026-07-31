// DynamoDB table for bookings
resource "aws_dynamodb_table" "bookings" {
  name         = "Bookings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "BookingId"

  attribute {
    name = "BookingId"
    type = "S"
  }

  attribute {
    name = "Availability"
    type = "S"
  }

  tags = {
    Name        = "Bookings"
    Environment = "production"
  }
}

// CloudWatch log group for the Lambda function
resource "aws_cloudwatch_log_group" "doctor_appointment" {
  name              = "/aws/lambda/doctor_appointment"
  retention_in_days = 14

  tags = {
    Environment = "production"
    Application = "doctor_appointment"
  }
}