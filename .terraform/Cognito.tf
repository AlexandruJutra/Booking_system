# Cognito User Pool that stores the website's user accounts.
resource "aws_cognito_user_pool" "booking_pool" {
  name = "booking-user-pool"

  # Let users sign in with their email address as the username.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  # Email users a verification code when they sign up.
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Verify your Dr. Miller Family Practice account"
    email_message        = "Your verification code is {####}"
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Environment = "production"
    Application = "doctor_appointment"
  }
}

# Public app client used by the browser (SPA). No client secret because a
# static website cannot keep one confidential.
resource "aws_cognito_user_pool_client" "booking_client" {
  name         = "booking-web-client"
  user_pool_id = aws_cognito_user_pool.booking_pool.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # Return generic errors instead of confirming whether a user exists.
  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

# JWT authorizer that validates Cognito-issued ID tokens on protected routes.
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.rest_http_api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.booking_client.id]
    issuer   = "https://cognito-idp.${local.region}.amazonaws.com/${aws_cognito_user_pool.booking_pool.id}"
  }
}
