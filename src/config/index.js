import { cwd } from 'process'

import 'dotenv/config'
import convict from 'convict'

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const DEFAULT_MESSAGE_TIMEOUT = 30

export const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  host: {
    doc: 'The IP address to bind',
    format: String,
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 3002,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'forms-submission-api'
  },
  serviceVersion: {
    doc: 'Api Service Version',
    format: String,
    default: '1.0.0',
    env: 'SERVICE_VERSION'
  },
  root: {
    doc: 'Project root',
    format: String,
    default: cwd()
  },
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: process.env.NODE_ENV === 'production'
  },
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: process.env.NODE_ENV !== 'production'
  },
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: process.env.NODE_ENV === 'test'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  logLevel: {
    doc: 'Logging level (deprecated - use log.level)',
    format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    default: 'info',
    env: 'LOG_LEVEL'
  },
  mongo: {
    uri: {
      doc: 'URI for mongodb',
      format: String,
      default: 'mongodb://127.0.0.1:27017/',
      env: 'MONGO_URI'
    },
    databaseName: {
      doc: 'Database name for mongodb',
      format: String,
      default: 'forms-submission-api',
      env: 'MONGO_DATABASE'
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  httpsProxy: {
    doc: 'HTTPS Proxy',
    format: String,
    default: '',
    env: 'CDP_HTTPS_PROXY'
  },
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  designerUrl: {
    format: String,
    default: null,
    env: 'DESIGNER_URL'
  },
  managerUrl: {
    format: String,
    default: null,
    env: 'MANAGER_URL'
  },
  /**
   * @todo We plan to replace `node-convict` with `joi` and remove all defaults.
   * These OIDC/roles are for the DEV application in the DEFRA tenant.
   */
  oidcJwksUri: {
    doc: 'The URI that defines the OIDC json web key set',
    format: String,
    default:
      'https://login.microsoftonline.com/770a2450-0227-4c62-90c7-4e38537f1102/discovery/v2.0/keys',
    env: 'OIDC_JWKS_URI'
  },
  oidcVerifyAud: {
    doc: 'The audience used for verifying the OIDC JWT',
    format: String,
    default: 'ec32e5c5-75fa-460a-a359-e3e5a4a8f10e',
    env: 'OIDC_VERIFY_AUD'
  },
  oidcVerifyIss: {
    doc: 'The issuer used for verifying the OIDC JWT',
    format: String,
    default:
      'https://login.microsoftonline.com/770a2450-0227-4c62-90c7-4e38537f1102/v2.0',
    env: 'OIDC_VERIFY_ISS'
  },
  s3Bucket: {
    doc: 'S3 bucket name',
    format: String,
    default: '',
    env: 'S3_BUCKET'
  },
  s3Endpoint: {
    doc: 'The S3 HTTP(S) endpoint, if required (e.g. a local development dev service). Activating this will force path style addressing for compatibility with Localstack.',
    format: String,
    default: '',
    env: 'S3_ENDPOINT'
  },
  loadedPrefix: {
    doc: 'Prefix for loaded files in S3',
    format: String,
    default: 'loaded',
    env: 'LOADED_PREFIX'
  },
  awsRegion: {
    doc: 'AWS region',
    format: String,
    default: 'eu-west-2',
    env: 'AWS_REGION'
  },
  sqsEndpoint: {
    doc: 'The SQS endpoint, if required (e.g. a local development dev service)',
    format: String,
    default: '',
    env: 'SQS_ENDPOINT'
  },
  saveAndExitQueueUrl: {
    doc: 'SQS queue URL for save and exit messages',
    format: String,
    default: '',
    env: 'SAVE_AND_EXIT_QUEUE_URL'
  },
  submissionQueueUrl: {
    doc: 'SQS queue URL for submission messages',
    format: String,
    default: '',
    env: 'SUBMISSION_QUEUE_URL'
  },
  receiveMessageTimeout: {
    doc: 'The wait time between each poll in milliseconds',
    format: Number,
    default: DEFAULT_MESSAGE_TIMEOUT * 1000,
    env: 'RECEIVE_MESSAGE_TIMEOUT_MS'
  },
  maxNumberOfMessages: {
    doc: 'The maximum number of messages to be received from queue at a time',
    format: Number,
    default: 10,
    env: 'SQS_MAX_NUMBER_OF_MESSAGES'
  },
  visibilityTimeout: {
    doc: 'The number of seconds that a message is hidden from other consumers after being retrieved from the queue.',
    format: Number,
    default: 30,
    env: 'SQS_VISIBILITY_TIMEOUT'
  },
  saveAndExitExpiryInDays: {
    doc: 'Save-and-exit expiry as number of days',
    format: Number,
    default: 28,
    env: 'SAVE_AND_EXIT_EXPIRY_IN_DAYS'
  },

  /**
   * Send emails
   */
  /** @type {SchemaObj<string>} */
  notifyTemplateId: {
    format: String,
    default: null,
    env: 'NOTIFY_TEMPLATE_ID'
  },
  /** @type {SchemaObj<string>} */
  notifyAPIKey: {
    format: String,
    default: null,
    env: 'NOTIFY_API_KEY'
  },
  /** @type {SchemaObj<string>} */
  notifyReplyToId: {
    format: String,
    default: null,
    env: 'NOTIFY_REPLY_TO_ID'
  }
})

config.validate({ allowed: 'strict' })

/**
 * @import { SchemaObj } from 'convict'
 */
