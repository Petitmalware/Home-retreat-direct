#!/usr/bin/env bash
set +x
set -euo pipefail
if [ "$#" -ne 0 ]; then
  printf '%s\n' 'Usage: sudo bash deploy/complete-store-opening.sh' >&2
  exit 2
fi
deployment_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
deployment_environment_file=/opt/home-retreat-direct/private/server.env
export HRD_ENV_FILE="$deployment_environment_file"
if [ ! -f "$deployment_environment_file" ] || [ ! -r "$deployment_environment_file" ]; then
  printf '%s\n' 'The private production environment is missing or unreadable.' >&2
  exit 1
fi
# Restore only missing public storage settings removed during earlier env edits.
# No existing credentials or explicitly supplied values are changed or printed.
if ! grep -q '^LOCAL_MEDIA_ENABLED=' "$deployment_environment_file"; then
  printf '\nLOCAL_MEDIA_ENABLED=true\n' >> "$deployment_environment_file"
fi
if ! grep -q '^LOCAL_MEDIA_DIRECTORY=' "$deployment_environment_file"; then
  printf '\nLOCAL_MEDIA_DIRECTORY=/app/.local/media\n' >> "$deployment_environment_file"
fi
chmod 600 "$deployment_environment_file"
hrd() {
  docker compose --env-file "$deployment_environment_file" -f "$deployment_directory/compose.yml" -p hrd "$@"
}
# Resume preserves this store's products, customers, owner and existing orders.
bash "$deployment_directory/start-production.sh" --resume
printf '%s\n' 'Publishing store policies and enabling reviewed order submissions...'
hrd run --rm -T --no-deps --pull never tools node node_modules/tsx/dist/cli.mjs \
  deploy/complete-store-opening.ts --confirm-domain homeretreatdirect.com
hrd up -d email-worker
curl --fail --silent --show-error --max-time 20 https://homeretreatdirect.com/api/health
printf '\n%s\n' 'Store policies are published and order submission is enabled. Review an order in the studio before requesting payment.'
