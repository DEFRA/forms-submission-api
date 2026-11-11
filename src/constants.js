export const MONGO_DUPLICATE_KEY_ERROR = 11000
export const AZURE_OIDC_TOKEN_STRATEGY = 'azure-oidc-token'
export const COGNITO_ACCESS_TOKEN = 'cognito-access-token'
export const CITIZEN_ACCESS_TOKEN_STRATEGY = 'citizen-access-token'

export const EN_GB = 'en-GB'
export const CY = 'cy'

// An address on this domain has no mailbox. Test accounts, such as the
// smoke test account, use it.
export const TEST_EMAIL_DOMAIN = 'example.forms.defra.gov.uk'

export const FormRowStatus = {
  InProgress: 'inProgress',
  Submitted: 'submitted',
  Expired: 'expired',
  Deleted: 'deleted'
}
