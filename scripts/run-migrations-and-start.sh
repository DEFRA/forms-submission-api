#!/bin/sh

# Exit on any error
set -e

echo "Running database migrations..."

# Run migrations with the config file (.cjs extension required for ES module projects)
npx migrate-mongo up -f migrate-mongo-config.cjs

echo "Migrations complete. Starting application..."

# Start the application with the original start command
exec npm start --ignore-scripts
