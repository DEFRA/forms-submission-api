# forms-submission-api

API to track form submissions. Currently tracks file submissions only.

See [docs/](docs/) for documentation.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Local development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
- [API endpoints](#api-endpoints)
- [Docker](#docker)
  - [Development Image](#development-image)
  - [Production Image](#production-image)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install the Node.js version in [.nvmrc](.nvmrc) using [Node Version Manager `nvm`](https://github.com/creationix/nvm) via:

```bash
cd forms-submission-api
nvm use
```

## Local development

### Setup

1. Install Docker

2. Bring up runtime dependencies

```bash
docker compose up
```

3. Create a `.env` file with the following mandatory environment variables populated at root level:

```text
MONGO_URI=""
MONGO_DATABASE=""
OIDC_JWKS_URI=""
OIDC_VERIFY_AUD=""
OIDC_VERIFY_ISS=""
ROLE_EDITOR_GROUP_ID=""
HTTP_PROXY=
HTTPS_PROXY=
NO_PROXY=
```

For proxy options, see https://www.npmjs.com/package/proxy-from-env which is used by https://github.com/TooTallNate/proxy-agents/tree/main/packages/proxy-agent. It's currently supports Hapi Wreck only, e.g. in the JWKS lookup.

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

## Integration Tests

The integration tests use Docker Compose to create a complete testing environment with MongoDB, LocalStack (for S3 emulation), OIDC mock server, and Newman (Postman CLI) for API testing.

### Prerequisites

- Docker and Docker Compose installed
- Node.js (version as specified in `.nvmrc`)

### Running Integration Tests

#### Quick Start

To run the full integration test suite:

```bash
npm run test:integration
```

This command will:

1. Start all required services (MongoDB, OIDC mock, app)
2. Wait for services to be ready
3. Run the Postman collection tests
4. Clean up all services

#### Manual Step-by-Step Execution

For debugging or development purposes, you can run the integration tests step by step:

1. **Start infrastructure services:**

   ```bash
   npm run test:integration:setup
   ```

2. **Start the application:**

   ```bash
   npm run test:integration:start
   ```

3. **Wait for services to be ready:**

   ```bash
   npm run test:integration:wait
   ```

4. **Run the tests:**

   ```bash
   npm run test:integration:run
   ```

5. **Clean up:**
   ```bash
   npm run test:integration:stop
   ```

### What the Integration Tests Cover

The integration tests verify all the key functionality of the forms-submission-api:

1. **Health Check** - Verifies the API is running
2. **File Ingestion** - Tests the CDP callback endpoint (`POST /file`)
3. **File Status Check** - Tests file existence verification (`GET /file/{fileId}`)
4. **Presigned Link Generation** - Tests secure file access (`POST /file/link`)
5. **File Persistence** - Tests moving files from 7-day to 30-day storage (`POST /files/persist`)
6. **Form Submission** - Tests complete form submission flow (`POST /submit`)
7. **Error Handling** - Tests validation failures and invalid requests
8. **Batch Operations** - Tests multiple file handling

### Test Environment Details

The integration test environment includes:

- **MongoDB**: Replica set configuration for transaction support
- **OIDC Mock Server**: Authentication provider for secure endpoints
- **Newman**: Postman CLI for running API test collections

### Test Reports

When running on the main branch, HTML reports are generated:

- Location: `./newman-reports/newman-report.html`
- Includes detailed request/response logs and test results
- Available as CI artifacts in GitHub Actions

### Troubleshooting

#### Common Issues:

1. **Port conflicts**: The tests use ports 3001, 5556, and 27018. Make sure these are available.

2. **Docker resources**: The integration tests require sufficient Docker resources. Increase Docker memory if needed.

3. **Services not ready**: If tests fail due to services not being ready, increase the wait time in the `test:integration:wait` script.

4. **Clean up**: If services are left running, use:
   ```bash
   npm run test:integration:stop
   ```

#### Viewing Logs:

To view service logs:

```bash
docker compose -f docker-compose.integration-test.yml logs [service_name]
```

Available services: `mongo_test`, `oidc`, `app_test`, `newman`

## API endpoints

| Endpoint               | Description                                                                                     |
| :--------------------- | :---------------------------------------------------------------------------------------------- |
| `GET: /health`         | Health                                                                                          |
| `POST: /file`          | Ingests a file with a 7 day expiry. Called by the CDP uploader as a callback (upon file upload) |
| `GET: /file/{fileId}`  | Checks that a file has been ingested.                                                           |
| `POST: /file/link`     | Creates a link to a file which can be accessed by a user. Valid for 60 minutes.                 |
| `POST: /files/persist` | Extends the expiry to 30 days. Called upon form submission.                                     |

## Docker

### Development image

Build:

```bash
docker build --target development --no-cache --tag forms-submission-api:development .
```

Run:

```bash
docker run -e GITHUB_API_TOKEN -p 3008:3008 forms-submission-api:development
```

### Production image

Build:

```bash
docker build --no-cache --tag forms-submission-api .
```

Run:

```bash
docker run -e GITHUB_API_TOKEN -p 3001:3001 forms-submission-api
```

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
