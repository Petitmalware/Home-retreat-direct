#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  --fresh) startup_mode=fresh ;;
  --resume) startup_mode=resume ;;
  *) printf '%s\n' 'Usage: sudo bash deploy/start-production.sh --fresh|--resume' >&2; exit 2 ;;
esac
if [ "$#" -ne 1 ]; then
  printf '%s\n' 'Supply only --fresh for first initialization or --resume for an initialized store.' >&2
  exit 2
fi

deployment_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_directory=$(cd -- "$deployment_directory/.." && pwd)
deployment_environment_file=${HRD_ENV_FILE:-/opt/home-retreat-direct/private/server.env}
if [ ! -f "$deployment_environment_file" ]; then
  printf '%s\n' 'The private server.env file is missing. Create and complete it before starting.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf '%s\n' 'Docker is unavailable to this account. Run this script with sudo after checking the Docker service.' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  printf '%s\n' 'The Docker Compose plugin is required.' >&2
  exit 1
fi
chmod 600 "$deployment_environment_file"

hrd() {
  docker compose --env-file "$deployment_environment_file" -f "$deployment_directory/compose.yml" -p hrd "$@"
}

printf '%s\n' 'Checking private configuration before building...'
if ! hrd config --quiet 2>/dev/null; then
  printf '%s\n' 'Compose configuration is invalid. Check HRD_ENV_FILE, POSTGRES_PASSWORD, JOB_SECRET and environment-file syntax. Private values are not printed.' >&2
  exit 1
fi
hrd config --format json 2>/dev/null | docker run --rm -i --network none \
  --mount "type=bind,source=$deployment_directory/check-production-config.mjs,target=/hrd-check-production-config.mjs,readonly" \
  node:22-bookworm-slim node /hrd-check-production-config.mjs "$startup_mode"

cd -- "$project_directory"
printf '%s\n' 'Building the app and maintenance tools...'
hrd build app tools
printf '%s\n' 'Starting this store database and applying migrations...'
hrd up -d --wait db
hrd run --rm -T tools node node_modules/prisma/build/index.js migrate deploy
hrd run --rm -T tools node node_modules/tsx/dist/cli.mjs deploy/init-production.ts --check
if [ "$startup_mode" = fresh ]; then
  printf '%s\n' 'Initializing the catalog and owner in the empty store database...'
  hrd run --rm -T tools node node_modules/tsx/dist/cli.mjs deploy/init-production.ts
fi
hrd run --rm -T tools node node_modules/tsx/dist/cli.mjs deploy/init-production.ts --verify-initialized
printf '%s\n' 'Adding the Christmas collection; existing products and display settings are preserved...'
hrd run --rm -T tools node node_modules/tsx/dist/cli.mjs deploy/install-christmas.ts
printf '%s\n' 'Starting the app and checking database connectivity...'
hrd up -d --wait app
app_endpoint=$(hrd port app 3000)
if [[ ! "$app_endpoint" =~ ^127\.0\.0\.1:[0-9]+$ ]]; then
  printf '%s\n' 'The app must publish one loopback port. Check the store Compose configuration.' >&2
  exit 1
fi
curl --fail --silent --show-error --max-time 15 "http://$app_endpoint/api/health"
printf '\n%s\n' 'App startup completed. Continue with the domain, HTTPS and mailbox setup.'
