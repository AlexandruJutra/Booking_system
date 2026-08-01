resource "aws_apigatewayv2_api" "rest_http_api" {
  name          = "rest-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
  }
}

resource "aws_apigatewayv2_integration" "rest_http_api" {
  api_id           = aws_apigatewayv2_api.rest_http_api.id
  integration_type = "AWS_PROXY"

  description            = "Lambda function"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.lambda_function_resource.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "Get_route" {
  api_id    = aws_apigatewayv2_api.rest_http_api.id
  route_key = "GET /slots"
  target    = "integrations/${aws_apigatewayv2_integration.rest_http_api.id}"
}

resource "aws_apigatewayv2_route" "Post_route" {
  api_id    = aws_apigatewayv2_api.rest_http_api.id
  route_key = "POST /bookings"
  target    = "integrations/${aws_apigatewayv2_integration.rest_http_api.id}"
}

# Listing existing bookings requires a signed-in (Cognito) user.
resource "aws_apigatewayv2_route" "Get_bookings_route" {
  api_id             = aws_apigatewayv2_api.rest_http_api.id
  route_key          = "GET /bookings"
  target             = "integrations/${aws_apigatewayv2_integration.rest_http_api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_stage" "API_stage" {
  api_id      = aws_apigatewayv2_api.rest_http_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "lambda_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda_function_resource.function_name
  principal     = "apigateway.amazonaws.com"

  # The /*/* part allows invocation from any stage and any route
  # (method + path) within this API Gateway.
  source_arn = "${aws_apigatewayv2_api.rest_http_api.execution_arn}/*/*"
}