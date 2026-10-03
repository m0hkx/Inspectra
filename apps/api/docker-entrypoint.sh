#!/bin/sh
# Applies pending migrations, then starts the API.
set -e

./node_modules/.bin/prisma migrate deploy

exec node dist/main.js
