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

Used by external services for programmatic API access. This strategy includes retrievalKey-based authorisation.

> **Important:** This authentication strategy is designed for routes that require `retrievalKey` in the request payload. It validates that the `retrievalKey` is permitted for the authenticated client ID. Use with caution on routes that do not include `retrievalKey` in the payload, as authentication will fail without it.

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

The Cognito authentication strategy performs the following validation:

1. **JWT Signature** - Verified via JWKS from Cognito
2. **Issuer** - Must match `COGNITO_VERIFY_ISS`
3. **Token Type** - `token_use` must be `access`
4. **Client ID** - Must exist in the `COGNITO_CLIENT_IDS` configuration
5. **RetrievalKey Authorisation** - The `retrievalKey` in the request payload must be one of the permitted keys for the client ID

### Authorisation Flow

When a request is made to an endpoint using the `cognito-access-token` strategy:

1. The JWT is validated (signature, issuer, token type)
2. The `client_id` from the token is checked against the configured client IDs
3. The request payload is inspected for a `retrievalKey` field
4. The `retrievalKey` is validated against the list of permitted keys for that client ID
5. If the `retrievalKey` is missing or not permitted for the client, authentication fails with a 401 Unauthorised response

## Protected Endpoints

### Endpoints Using Azure OIDC

Most form submission and management endpoints use Azure OIDC authentication for internal users.

### Endpoints Using Cognito Access Token

The following endpoints use Cognito authentication for external service access:

- `POST /file/link` - Requires valid client ID and retrievalKey in payload

Both strategies are registered, and routes can specify which strategy (or strategies) they accept via the `auth.strategies` configuration.

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

## Testing

### Unit Tests

Authentication validation functions are tested in `src/plugins/auth/index.test.js`.

### Integration Tests

The `src/routes/files.test.js` file includes tests for the `/file/link` endpoint with Cognito authentication.

### Test Configuration

In test environments, configure mock credentials in `jest.setup.js`:

```javascript
process.env.COGNITO_CLIENT_IDS = '{"dummy": ["test-key-1", "test-key-2"]}'
```
