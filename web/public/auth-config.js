// Cognito configuration for the browser.
//
// These values are filled in automatically by the CD workflow from the
// Terraform outputs (cognito_region, cognito_user_pool_id, cognito_client_id).
// The placeholders below let the page load locally before deployment.
window.AUTH_CONFIG = {
  region: "REGION_PLACEHOLDER",
  userPoolId: "USER_POOL_ID_PLACEHOLDER",
  clientId: "CLIENT_ID_PLACEHOLDER",
};
