// lambda function

# IAM role for Lambda execution
data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "lambda_execution" {
  name               = "lambda_execution_role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

# Permissions policy — SEPARATE resource, attached to the role
resource "aws_iam_role_policy" "lambda_permissions" {
  name = "lambda_permissions"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Statement1"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.doctor_appointment.arn}:*"
      },
      {
        Sid    = "Statement2"
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem"
        ]
        Resource = "${aws_dynamodb_table.bookings.arn}:*"
      }
    ]
  })
}

# Package the Lambda function code
data "archive_file" "doctor_appointment" {
  type        = "zip"
  source_file = "${path.module}/lambda/index.js"
  output_path = "${path.module}/lambda/function.zip"
}

# Lambda function
resource "aws_lambda_function" "lambda_function_resource" {
  filename      = data.archive_file.doctor_appointment.output_path
  function_name = "doctor_appointment"
  role          = aws_iam_role.lambda_execution.arn
  handler       = "index.handler"
  code_sha256   = data.archive_file.doctor_appointment.output_base64sha256

  runtime = "nodejs24.x"

  environment {
    variables = {
      ENVIRONMENT = "production"
      LOG_LEVEL   = "info"
    }
  }

  tags = {
    Environment = "production"
    Application = "doctor_appointment"
  }
}