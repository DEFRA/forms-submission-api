import { cwd } from 'process'

import 'dotenv/config'
import convict from 'convict'

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

const SENSITIVE_FIELDS = [
  'retrievalKey',
  'persistedRetrievalKey',
  'initiatedRetrievalKey',
  'fieldsToUpdate.retrievalKey'
]

export const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
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
        ? [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers',
            ...SENSITIVE_FIELDS
          ]
        : ['req', 'res', 'responseTime', ...SENSITIVE_FIELDS]
    }
  },
  logLevel: {
    doc: 'Logging level (deprecated - use log.level)',
    format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    default: 'info',
    env: 'LOG_LEVEL'
  },
  mongoUri: {
    doc: 'URI for mongodb',
    format: '*',
    default: 'mongodb://127.0.0.1:27017/',
    env: 'MONGO_URI'
  },
  mongoDatabase: {
    doc: 'database for mongodb',
    format: String,
    default: 'forms-submission-api',
    env: 'MONGO_DATABASE'
  },
  httpProxy: {
    doc: 'HTTP Proxy',
    format: String,
    default: '',
    env: 'CDP_HTTP_PROXY'
  },
  httpsProxy: {
    doc: 'HTTPS Proxy',
    format: String,
    default: '',
    env: 'CDP_HTTPS_PROXY'
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
  s3Region: {
    doc: 'S3 region for the app on CDP',
    format: String,
    default: 'eu-west-2',
    env: 'S3_REGION'
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
  }
})

config.validate({ allowed: 'strict' })
