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
