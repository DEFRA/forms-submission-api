# Authentication

This document describes the authentication mechanisms implemented in the Forms Submission API.

## Overview

The API supports two authentication strategies:

1. **Azure OIDC Token** (`azure-oidc-token`) - For internal users accessing the API through the web interface
2. **Cognito Access Token** (`cognito-access-token`) - For external services accessing the API programmatically

## Azure OIDC Token

Used by the Forms Designer and Forms Manager applications for user authentication.

### Configuration

Configure via environment variables:

- `OIDC_JWKS_URI` - The URI that defines the OIDC JSON Web Key Set
- `OIDC_VERIFY_AUD` - The audience used for verifying the OIDC JWT
- `OIDC_VERIFY_ISS` - The issuer used for verifying the OIDC JWT

### Validation

The strategy validates:

- JWT signature via JWKS
- Audience (`aud`) matches configured value
- Issuer (`iss`) matches configured value
- Token expiry and not-before times
- Presence of `oid` (Object ID) in the token payload

## Cognito Access Token

Used by external services for programmatic API access.

> **Security Notice:** Routes using Cognito authentication that accept a `retrievalKey` in the request payload **MUST** call the `validateRetrievalKey` function to ensure proper authorization. The authentication strategy alone only validates the JWT token; the validation function ensures that the client is authorized to use the provided `retrievalKey`.

### Configuration

Configure via environment variables:

- `COGNITO_JWKS_URI` - The URI that defines the Cognito JSON Web Key Set (format: `https://cognito-idp.<Region>.amazonaws.com/<userPoolId>/.well-known/jwks.json`)
- `COGNITO_VERIFY_ISS` - The issuer used for verifying the Cognito JWT (format: `https://cognito-idp.<Region>.amazonaws.com/<userPoolId>`)
- `COGNITO_CLIENT_IDS` - JSON object mapping client IDs to their permitted retrievalKeys

### COGNITO_CLIENT_IDS Format

The `COGNITO_CLIENT_IDS` environment variable must be a JSON string in the following format:

```json
{
  "client-id-1": ["retrievalKey1", "retrievalKey2"],
  "client-id-2": ["retrievalKey3", "retrievalKey4"],
  "client-id-3": ["retrievalKey5"]
}
```

**Example:**

```bash
export COGNITO_CLIENT_IDS='{"abc123xyz": ["form-a", "form-b"], "def456uvw": ["form-c"]}'
```

This configuration means:

- Client ID `abc123xyz` can access files with retrievalKeys `form-a` or `form-b`
- Client ID `def456uvw` can access files with retrievalKey `form-c`

### Validation

The Cognito authentication strategy validates:

1. **JWT Signature** - Verified via JWKS from Cognito
2. **Issuer** - Must match `COGNITO_VERIFY_ISS`
3. **Token Type** - `token_use` must be `access`
4. **Client ID** - Must exist in `COGNITO_CLIENT_IDS` configuration

### Retrieval Key Authorization

Routes that accept a `retrievalKey` in the payload **MUST** call `validateRetrievalKey()` with the client ID and retrievalKey. Authentication alone only validates the JWT; this function validates the client's authorization to use the specific `retrievalKey`.

**Implementation:**

```javascript
import { validateRetrievalKey } from '~/src/plugins/auth/index.js'

{
  method: 'POST',
  path: '/file/link',
  async handler(request) {
    const { auth, payload } = request
    const { fileId, retrievalKey } = payload

    // Validate retrievalKey authorization for Cognito clients
    if (auth.credentials.app?.client_id) {
      validateRetrievalKey(auth.credentials.app.client_id, retrievalKey)
    }

    // Client is authenticated and authorized
  },
  options: {
    auth: {
      strategies: ['azure-oidc-token', 'cognito-access-token']
    },
    validate: {
      payload: yourPayloadSchema
    }
  }
}
```

**Request Flow:**

1. JWT validated → client authenticated
2. Payload validated via schema
3. Handler validates `retrievalKey` is permitted for client (Cognito only) → authorized
4. Route handler continues execution

## Protected Endpoints

### Endpoints Using Azure OIDC

Most form submission and management endpoints use Azure OIDC authentication for internal users.

### Endpoints Using Cognito Access Token

The following endpoints use Cognito authentication with the `validateRetrievalKey` function for external service access:

- `POST /file/link` - Requires valid client ID and retrievalKey in payload

Both strategies are registered, and routes can specify which strategy (or strategies) they accept via the `auth.strategies` configuration. Routes that require retrievalKey authorization must call `validateRetrievalKey()` in their handlers.

## Adding a New Client

To add a new external service client:

1. Create a new app client in AWS Cognito (via #cdp-support)
2. Record the client ID and client secret
3. Update the `COGNITO_CLIENT_IDS` environment variable to include the new client ID with its permitted retrievalKeys
4. Provide the client ID and secret to the external service
5. Redeploy the application to apply the configuration change

## Revoking Access

To revoke access for a client:

1. Remove the client ID from the `COGNITO_CLIENT_IDS` configuration
2. Redeploy the application
3. Disable or delete the app client in AWS Cognito

To revoke access to specific retrievalKeys while keeping the client active:

1. Update the array of permitted retrievalKeys for that client ID in `COGNITO_CLIENT_IDS`
2. Redeploy the application
