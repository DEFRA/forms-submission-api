import { cwd } from 'node:process'

import 'dotenv/config'
import convict from 'convict'

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const POSITIVE_NUMBER_VALIDATOR = 'positive-number'

convict.addFormat({
  name: POSITIVE_NUMBER_VALIDATOR,
  validate(value) {
    if (typeof value !== 'number' || value <= 0) {
      throw new TypeError('must be a positive number')
    }
  },
  coerce: (value) => {
    const coercedValue = Number(value)
    return coercedValue
  }
})

export const config = convict({
  /** @type {SchemaObj<'production' | 'development' | 'test'>} */
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: null,
    env: 'NODE_ENV'
  },
  /** @type {SchemaObj<string>} */
  host: {
    doc: 'The IP address to bind',
    format: String,
    default: null,
    env: 'HOST'
  },
  /** @type {SchemaObj<number>} */
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: null,
    env: 'PORT'
  },
  /** @type {SchemaObj<string>} */
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'forms-submission-api'
  },
  /** @type {SchemaObj<string>} */
  serviceVersion: {
    doc: 'Api Service Version',
    format: String,
    default: null,
    env: 'SERVICE_VERSION'
  },
  /** @type {SchemaObj<string>} */
  root: {
    doc: 'Project root',
    format: String,
    default: cwd()
  },
  /** @type {SchemaObj<boolean>} */
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  /** @type {SchemaObj<boolean>} */
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: !isProduction && !isTest
  },
  /** @type {SchemaObj<boolean>} */
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  log: {
    /** @type {SchemaObj<boolean>} */
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: null,
      env: 'LOG_ENABLED'
    },
    /** @type {SchemaObj<'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'>} */
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: null,
      env: 'LOG_LEVEL'
    },
    /** @type {SchemaObj<'ecs' | 'pino-pretty'>} */
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: null,
      env: 'LOG_FORMAT'
    },
    /** @type {SchemaObj<string[]>} */
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  /** @type {SchemaObj<'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'>} */
  logLevel: {
    doc: 'Logging level (deprecated - use log.level)',
    format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    default: null,
    env: 'LOG_LEVEL'
  },
  mongo: {
    /** @type {SchemaObj<string>} */
    uri: {
      doc: 'URI for mongodb',
      format: String,
      default: null,
      env: 'MONGO_URI'
    },
    /** @type {SchemaObj<string>} */
    databaseName: {
      doc: 'Database name for mongodb',
      format: String,
      default: null,
      env: 'MONGO_DATABASE'
    }
  },
  /** @type {SchemaObj<string | null>} */
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  /** @type {SchemaObj<string>} */
  httpsProxy: {
    doc: 'HTTPS Proxy',
    format: String,
    default: null,
    env: 'CDP_HTTPS_PROXY'
  },
  /** @type {SchemaObj<boolean>} */
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: null,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  /** @type {SchemaObj<boolean>} */
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: null,
    env: 'ENABLE_METRICS'
  },
  tracing: {
    /** @type {SchemaObj<string>} */
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: null,
      env: 'TRACING_HEADER'
    }
  },
  /** @type {SchemaObj<string | null>} */
  designerUrl: {
    format: String,
    default: null,
    env: 'DESIGNER_URL'
  },
  /** @type {SchemaObj<string | null>} */
  managerUrl: {
    format: String,
    default: null,
    env: 'MANAGER_URL'
  },
  /** @type {SchemaObj<string>} */
  entitlementUrl: {
    doc: 'Forms entitlements API URL',
    format: String,
    default: null,
    env: 'ENTITLEMENT_URL'
  },
  /**
   * These OIDC/roles are for the DEV application in the DEFRA tenant.
   */
  /** @type {SchemaObj<string>} */
  oidcJwksUri: {
    doc: 'The URI that defines the OIDC json web key set',
    format: String,
    default: null,
    nullable: false,
    env: 'OIDC_JWKS_URI'
  },
  /** @type {SchemaObj<string>} */
  oidcVerifyAud: {
    doc: 'The audience used for verifying the OIDC JWT',
    format: String,
    default: null,
    nullable: false,
    env: 'OIDC_VERIFY_AUD'
  },
  /** @type {SchemaObj<string>} */
  oidcVerifyIss: {
    doc: 'The issuer used for verifying the OIDC JWT',
    format: String,
    default: null,
    nullable: false,
    env: 'OIDC_VERIFY_ISS'
  },
  /** @type {SchemaObj<string>} */
  cognitoJwksUri: {
    doc: 'The URI that defines the cognito json web key set. This is a URL formatted as https://cognito-idp.<Region>.amazonaws.com/<userPoolId>/.well-known/jwks.json',
    format: String,
    default: null,
    nullable: false,
    env: 'COGNITO_JWKS_URI'
  },
  /**
   * JSON representation of cognito client ids with permitted retrievalKeys.
   * Should be in the following valid JSON format as a single string:
   * '{"client-id-1": ["retrievalKey1", "retrievalKey2"], "client-id-2": ["retrievalKey3"]}'
   * @type {SchemaObj<string>}
   */
  cognitoClientIds: {
    doc: 'The app client ids with their permitted retrievalKeys, used for verifying the cognito JWT.',
    format: String,
    default: null,
    nullable: false,
    env: 'COGNITO_CLIENT_IDS'
  },
  /** @type {SchemaObj<string>} */
  cognitoVerifyIss: {
    doc: 'The issuer used for verifying the cognito JWT. This is a URL formatted as https://cognito-idp.<Region>.amazonaws.com/<userpoolID>',
    format: String,
    default: null,
    nullable: false,
    env: 'COGNITO_VERIFY_ISS'
  },
  /** @type {SchemaObj<string>} */
  s3Bucket: {
    doc: 'S3 bucket name',
    format: String,
    default: null,
    env: 'S3_BUCKET'
  },
  /** @type {SchemaObj<string>} */
  s3Endpoint: {
    doc: 'The S3 HTTP(S) endpoint, if required (e.g. a local development dev service). Activating this will force path style addressing for compatibility with Localstack.',
    format: String,
    default: null,
    env: 'S3_ENDPOINT'
  },
  /** @type {SchemaObj<string>} */
  loadedPrefix: {
    doc: 'Prefix for loaded files in S3',
    format: String,
    default: null,
    env: 'LOADED_PREFIX'
  },
  /** @type {SchemaObj<string>} */
  awsRegion: {
    doc: 'AWS region',
    format: String,
    default: null,
    env: 'AWS_REGION'
  },
  /** @type {SchemaObj<string>} */
  sqsEndpoint: {
    doc: 'The SQS endpoint, if required (e.g. a local development dev service)',
    format: String,
    default: null,
    env: 'SQS_ENDPOINT'
  },
  /** @type {SchemaObj<string>} */
  saveAndExitQueueUrl: {
    doc: 'SQS queue URL for save and exit messages',
    format: String,
    default: null,
    env: 'SAVE_AND_EXIT_QUEUE_URL'
  },
  /** @type {SchemaObj<string>} */
  submissionQueueUrl: {
    doc: 'SQS queue URL for submission messages',
    format: String,
    default: null,
    env: 'SUBMISSION_QUEUE_URL'
  },
  /** @type {SchemaObj<string>} */
  sqsFormSubmissionsDlqArn: {
    doc: 'SQS deadletter queue ARN for form submission events',
    format: String,
    default: null,
    env: 'FORM_SUBMISSIONS_SQS_DLQ_ARN'
  },
  /** @type {SchemaObj<string>} */
  sqsSaveAndExitDlqArn: {
    doc: 'SQS deadletter queue ARN for save-and-exit events',
    format: String,
    default: null,
    env: 'SAVE_AND_EXIT_SQS_DLQ_ARN'
  },
  /** @type {SchemaObj<number>} */
  receiveMessageTimeout: {
    doc: 'The wait time between each poll in milliseconds',
    format: Number,
    default: null,
    env: 'RECEIVE_MESSAGE_TIMEOUT_MS'
  },
  /** @type {SchemaObj<number>} */
  maxNumberOfMessages: {
    doc: 'The maximum number of messages to be received from queue at a time',
    format: Number,
    default: null,
    env: 'SQS_MAX_NUMBER_OF_MESSAGES'
  },
  /** @type {SchemaObj<number>} */
  visibilityTimeout: {
    doc: 'The number of seconds that a message is hidden from other consumers after being retrieved from the queue.',
    format: Number,
    default: null,
    env: 'SQS_VISIBILITY_TIMEOUT'
  },
  /** @type {SchemaObj<number>} */
  saveAndExitExpiryInDays: {
    doc: 'Save-and-exit expiry as number of days',
    format: Number,
    default: null,
    env: 'SAVE_AND_EXIT_EXPIRY_IN_DAYS'
  },

  /**
   * Send emails
   */
  /** @type {SchemaObj<string | null>} */
  notifyTemplateId: {
    format: String,
    default: null,
    env: 'NOTIFY_TEMPLATE_ID'
  },
  /** @type {SchemaObj<string | null>} */
  notifyAPIKey: {
    format: String,
    default: null,
    env: 'NOTIFY_API_KEY'
  },
  /** @type {SchemaObj<string | null>} */
  notifyReplyToId: {
    format: String,
    default: null,
    env: 'NOTIFY_REPLY_TO_ID'
  },
  /**
   * Scheduler
   */
  emailUsersExpiringSoonSavedForLaterLink: {
    /** @type {SchemaObj<boolean>} */
    enabled: {
      doc: 'Enable periodic emailing of users with expiring saved for later links',
      format: Boolean,
      default: null,
      env: 'EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_ENABLED'
    },
    /** @type {SchemaObj<string>} */
    cronSchedule: {
      doc: 'Cron schedule for emailing users with expiring saved for later links (default: every hour from 9am to 8pm UTC)',
      format: String,
      default: null,
      env: 'EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_CRON'
    },
    /** @type {SchemaObj<number>} */
    expiryWindowInHours: {
      doc: 'Number of hours before expiry to send reminder email',
      format: POSITIVE_NUMBER_VALIDATOR,
      default: null,
      env: 'EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_EXPIRY_WINDOW_HOURS'
    },
    /** @type {SchemaObj<number>} */
    minimumHoursRemaining: {
      doc: 'Minimum hours that must remain before expiry to send reminder email',
      format: POSITIVE_NUMBER_VALIDATOR,
      default: null,
      env: 'EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_MINIMUM_HOURS_REMAINING'
    }
  }
})

config.validate({ allowed: 'strict' })

const expiryWindow = config.get(
  'emailUsersExpiringSoonSavedForLaterLink.expiryWindowInHours'
)
const minimumHours = config.get(
  'emailUsersExpiringSoonSavedForLaterLink.minimumHoursRemaining'
)
if (expiryWindow <= minimumHours) {
  throw new Error(
    `expiryWindowInHours (${expiryWindow}) must be greater than minimumHoursRemaining (${minimumHours})`
  )
}

/**
 * @import { SchemaObj } from 'convict'
 */
