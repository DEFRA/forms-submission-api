# Forms Submission API

This document describes how external services can authenticate with and call the Forms Submission API using AWS Cognito.

- [Forms Submission API](#forms-submission-api)
  - [Onboarding](#onboarding)
    - [Obtaining Credentials](#obtaining-credentials)
    - [Understanding Retrieval Keys](#understanding-retrieval-keys)
  - [Authentication](#authentication)
  - [Environments](#environments)
    - [API Base URL](#api-base-url)
    - [Cognito Token Endpoint](#cognito-token-endpoint)
  - [Available APIs](#available-apis)
    - [POST /file/link](#post-filelink)
  - [Full Example](#full-example)

## Onboarding

### Obtaining Credentials

To access the API, you will need a **client ID** and **client secret**. These are issued by the Defra Forms team.

To request credentials:

1. Contact the Defra Forms team.
2. Provide details of your service and the intended use case.
3. Specify which **form email addresses** (retrievalKeys) your service will need to access.
4. The team will issue you a client ID and client secret configured with access to those specific email addresses.

These credentials are used to programmatically obtain a short-lived access token from AWS Cognito.

### Understanding Retrieval Keys

Each form in the Forms platform has a **primary output email address** where submitted files are sent. This email address serves as the `retrievalKey` for accessing those files via the API.

Your client ID is configured with access to specific email addresses. When the Defra Forms team issues your credentials, they grant you access to the email addresses you specify.

> **Important:** Email addresses are a property of each form and can be changed by form owners. If a form's email address is updated, you **must** notify the Defra Forms team to update your permissions. **These updates will not happen automatically**. Keep the team informed of any email address changes to maintain access to your required files.

> **Note:** Requests using email addresses (retrievalKeys) not associated with your client ID will be rejected with a 403 Forbidden error.

## Authentication

The API uses the OAuth 2.0 client credentials flow, with AWS Cognito as the authorisation server:

1. Your service sends its client ID and client secret to the [Cognito token endpoint](#cognito-token-endpoint) for your environment.
2. Cognito returns a short-lived access token.
3. Your service sends the access token as a Bearer token in the `Authorization` header of each API request.
4. When the access token expires, your service should request and use a new one by repeating steps 1-3.

For the steps and code examples, see [Authentication](./authentication.md).

## Environments

Each environment has two URLs: the API base URL, where you send API requests, and the Cognito token endpoint, where you get an access token.

### API Base URL

Send API requests to the base URL for your environment. You should use the API Gateway URL in most instances, rather than the CDP internal URL.

| Environment | API Gateway URL                                              | CDP Internal URL                                            |
| ----------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| dev         | `https://forms-submission-api.api.dev.cdp-int.defra.cloud`   | `https://forms-submission-api.dev.cdp-int.defra.cloud`      |
| test        | `https://forms-submission-api.api.test.cdp-int.defra.cloud`  | `https://forms-submission-api.test.cdp-int.defra.cloud`     |
| ext-test    | `https://forms-submission-api.api.ext-test.cdp.defra.gov.uk` | `https://forms-submission-api.ext-test.cdp-int.defra.cloud` |
| prod        | `https://api.forms.defra.gov.uk`                             | `https://forms-submission-api.prod.cdp-int.defra.cloud`     |

### Cognito Token Endpoint

Get an access token from the token endpoint for your environment.

| Environment | Token endpoint                                                                     |
| ----------- | ---------------------------------------------------------------------------------- |
| dev         | `https://forms-submission-api-c63f2.auth.eu-west-2.amazoncognito.com/oauth2/token` |
| test        | `https://forms-submission-api-6bf3a.auth.eu-west-2.amazoncognito.com/oauth2/token` |
| ext-test    | `https://forms-submission-api-8ec5c.auth.eu-west-2.amazoncognito.com/oauth2/token` |
| prod        | `https://forms-submission-api-75ee2.auth.eu-west-2.amazoncognito.com/oauth2/token` |

These endpoints are managed by the CDP platform and are up to date as of 22 October 2026. If this documentation has drifted and they do not work, consult the
[CDP documentation for the latest Cognito endpoints](https://portal.cdp-int.defra.cloud/documentation/how-to/apis.md#what-are-the-login-urls-for-my-api).

The URLs in the CDP documentation start with the placeholder service name `abc-service`. Replace it with `forms-submission-api`, which is the name of this service.

## Available APIs

The following endpoints are available to services using Cognito authentication:

| Method | Path         | Description                                     |
| ------ | ------------ | ----------------------------------------------- |
| POST   | `/file/link` | Retrieve a pre-signed URL for accessing a file. |

For the latest documentation, consult the CDP API documentation for forms-submission-api along with our API's [OpenAPI Spec](https://cdp-api-hub.prod.cdp-int.defra.cloud/hub/internal/forms-submission-api).

### POST /file/link

Retrieves a pre-signed URL for accessing an uploaded file.

**Request Body:**

```json
{
  "fileId": "string",
  "retrievalKey": "string"
}
```

- `fileId`: The unique identifier for the file
- `retrievalKey`: The email address associated with the form. Each form has a primary output email address where files are sent. This email address is used as the key to access those files. Your client ID must be granted access to this specific email address.

**Response:**

```json
{
  "url": "string"
}
```

The returned URL is a time-limited pre-signed URL that allows direct access to the file.

## Full Example

For a complete example that gets an access token, calls the API and downloads a file, see [Full Example](./full-example.md).
