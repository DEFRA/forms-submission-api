import nock from 'nock'

process.env.NODE_ENV = 'test'
process.env.HOST = '127.0.0.1'
process.env.PORT = '3002'
process.env.SERVICE_VERSION = 'test'
process.env.LOG_ENABLED = 'false'
process.env.LOG_LEVEL = 'debug'
process.env.LOG_FORMAT = 'pino-pretty'
process.env.MONGO_URI =
  'mongodb://localhost:27017/forms-submission-api-test?replicaSet=rs0&directConnection=true'
process.env.MONGO_DATABASE = 'forms-submission-api'
process.env.HTTP_PROXY = ''
process.env.CDP_HTTPS_PROXY = ''
process.env.ENABLE_SECURE_CONTEXT = 'false'
process.env.ENABLE_METRICS = 'false'
process.env.TRACING_HEADER = 'x-cdp-request-id'

process.env.NOTIFY_API_KEY = 'dummy'
process.env.NOTIFY_TEMPLATE_ID = 'dummy'
process.env.NOTIFY_REPLY_TO_ID = 'dummy'
process.env.NOTIFY_EXPIRY_REMINDER_TEMPLATE_ID = 'dummy'
process.env.MANAGER_URL = 'http://localhost:3009'
process.env.DESIGNER_URL = 'http://localhost:3000'
process.env.ENTITLEMENT_URL = 'http://localhost:3004'

process.env.OIDC_JWKS_URI = 'https://oidc.com/.well_known/jwks.json'
process.env.OIDC_VERIFY_AUD = 'dummy'
process.env.OIDC_VERIFY_ISS = 'dummy'
process.env.COGNITO_JWKS_URI = 'https://cognito.com/.well_known/jwks.json'
process.env.COGNITO_CLIENT_IDS =
  '{"dummy": ["test-key-1", "test-key-2"], "6v87ae6bg5tltqsdfe3icgjv": ["test"]}'
process.env.COGNITO_VERIFY_ISS = 'dummy'
process.env.S3_BUCKET = 'test-forms-submission-bucket'
process.env.S3_ENDPOINT = 'http://localhost:4566'
process.env.LOADED_PREFIX = 'loaded'
process.env.AWS_REGION = 'eu-west-2'
process.env.AWS_ACCESS_KEY_ID = 'test'
process.env.AWS_SECRET_ACCESS_KEY = 'test'
process.env.SQS_ENDPOINT = 'http://localhost:4566'
process.env.SAVE_AND_EXIT_QUEUE_URL =
  'http://localhost:4566/000000000000/forms_submission_events'
process.env.SUBMISSION_QUEUE_URL =
  'http://localhost:4566/000000000000/forms_submission'
process.env.FORM_SUBMISSIONS_SQS_DLQ_ARN = ''
process.env.SAVE_AND_EXIT_SQS_DLQ_ARN = ''
process.env.RECEIVE_MESSAGE_TIMEOUT_MS = '30000'
process.env.SQS_MAX_NUMBER_OF_MESSAGES = '10'
process.env.SQS_VISIBILITY_TIMEOUT = '30'
process.env.SAVE_AND_EXIT_EXPIRY_IN_DAYS = '28'
process.env.EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_ENABLED = 'true'
process.env.EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_CRON = '0 9-20 * * *'
process.env.EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_EXPIRY_WINDOW_HOURS =
  '36'
process.env.EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_MINIMUM_HOURS_REMAINING =
  '2'

// Sample JWKS response for @hapi/jwt
const jwks = {
  keys: [
    {
      alg: 'RS256',
      e: 'AQAB',
      kid: '9tuAErwpIu41FajLxmC9+8Y7kMXa0kO3sY=',
      kty: 'RSA',
      n: 'q3DaFfvNA0C8wOaVsx-P68LqF4U5NzQuz9',
      use: 'sig'
    },
    {
      alg: 'RS256',
      e: 'AQAB',
      kid: 'amhKOdpcPs5+U9IPbk+wt4BDZbqAJBcRYLo=',
      kty: 'RSA',
      n: 'rcc6oqD-v3GRyhW7z0qgCoW7FYEtMifFkLwQmtFQRG',
      use: 'sig'
    }
  ]
}

nock('https://oidc.com')
  .persist()
  .get('/.well_known/jwks.json')
  .reply(200, jwks)

nock('https://cognito.com')
  .persist()
  .get('/.well_known/jwks.json')
  .reply(200, jwks)
