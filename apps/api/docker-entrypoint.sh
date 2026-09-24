#!/bin/sh
# Applies pending migrations, optionally seeds the demo organizations, then starts the API.
set -e

./node_modules/.bin/prisma migrate deploy

if [ "$SEED_DEMO" = "true" ]; then
  # Idempotent: does nothing when the demo organization already exists.
  node dist/database/seed.main.js
fi

exec node dist/main.js
