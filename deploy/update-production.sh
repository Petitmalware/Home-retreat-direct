#!/usr/bin/env bash
set -euo pipefail
deployment_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_directory=$(cd -- "$deployment_directory/.." && pwd)
export HRD_ENV_FILE=${HRD_ENV_FILE:-/opt/home-retreat-direct/private/server.env}
hrd() { docker compose --env-file "$HRD_ENV_FILE" -f "$deployment_directory/compose.yml" -p hrd "$@"; }
cd -- "$project_directory"
worker_was_running=$(hrd ps --status running -q email-worker)
bash "$deployment_directory/start-production.sh" --resume
if [ -n "$worker_was_running" ]; then hrd up -d --wait email-worker; fi
curl --fail --show-error --max-time 20 https://homeretreatdirect.com/api/health
printf '\n'
hrd ps
printf '\n%s\n' 'Update complete. Refresh your browser. Christmas controls: https://homeretreatdirect.com/admin/seasonal'
