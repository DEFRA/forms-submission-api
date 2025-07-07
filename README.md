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
  - [Database Migrations](#database-migrations)
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

4. **Database setup**: See [Database Migrations](#database-migrations) for information on how database migrations work in this project.

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

### Database Migrations

This project uses [migrate-mongo](https://www.npmjs.com/package/migrate-mongo) to manage database migrations.

#### Production

In production, migrations run automatically when the Docker container starts via the `scripts/run-migrations-and-start.sh` shell script. This script:

1. Runs all pending migrations (`migrate-mongo up`)
2. Starts the application server
3. Logs migration progress to the container output

**No manual intervention is required** - migrations execute automatically on container startup.

#### Local Development

For local development, you have two options:

##### Option 1: Using Docker (Recommended)

Migrations run automatically when using Docker:

```bash
docker compose up --build forms-submission-api
```

This mimics the production environment and runs migrations via the same shell script.

##### Option 2: Manual Migration Commands

To work with migrations manually, you can install migrate-mongo globally:

```bash
npm install -g migrate-mongo
```

Available migration commands:

```bash
# Check migration status
npm run migrate:status

# Run all pending migrations
npm run migrate:up

# Rollback the last migration
npm run migrate:down

# Create a new migration
npx migrate-mongo create <migration-name> -f migrate-mongo-config.cjs
```

**Important**: When running migrations manually, ensure your `.env` file contains the correct `MONGO_URI` and `MONGO_DATABASE` values that match your local MongoDB instance.

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
