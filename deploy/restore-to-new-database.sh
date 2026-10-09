#!/usr/bin/env bash
# Recovery drill / disaster recovery into a NEW empty, separate Compose project.
# This script never replaces or drops the live store database.
set -euo pipefail
umask 077
[[ $# -eq 3 ]] || { echo 'Usage: restore-to-new-database.sh BACKUP_DIRECTORY ABSOLUTE_ENV_FILE NEW_PROJECT_NAME' >&2; exit 1; }
backup=$(realpath "$1")
environment=$(realpath "$2")
new_project="$3"
project=/opt/home-retreat-direct/current
[[ "$new_project" =~ ^hrd-restore-[a-z0-9-]+$ ]] || { echo 'Use a new project name starting with hrd-restore-; the live hrd project is forbidden.' >&2; exit 1; }
[[ -f "$backup/database.dump" && -f "$backup/media.tar.gz" && -f "$environment" ]] || { echo 'Backup or recovery environment is missing.' >&2; exit 1; }
# Verify checksums stored by backup.sh. Those absolute source paths may change
# after transfer, so compare hashes against filenames rather than old paths.
expected_db=$(awk '/database.dump$/ {print $1}' "$backup/SHA256SUMS")
expected_media=$(awk '/media.tar.gz$/ {print $1}' "$backup/SHA256SUMS")
[[ "$(sha256sum "$backup/database.dump" | cut -d ' ' -f1)" == "$expected_db" && "$(sha256sum "$backup/media.tar.gz" | cut -d ' ' -f1)" == "$expected_media" ]] || { echo 'Backup checksum failed.' >&2; exit 1; }
compose=(docker compose --env-file "$environment" -f "$project/deploy/compose.yml" -p "$new_project")
"${compose[@]}" up -d --wait db
tables=$("${compose[@]}" exec -T db psql -U hrd -d home_retreat_direct -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
[[ "$tables" == 0 ]] || { echo 'Recovery database already contains tables; refusing to modify it.' >&2; exit 1; }
"${compose[@]}" exec -T db pg_restore -U hrd -d home_retreat_direct --exit-on-error --no-owner <"$backup/database.dump"
"${compose[@]}" run --rm --no-deps -T tools tar -xzf - -C /app/.local <"$backup/media.tar.gz"
echo "Restore complete into separate project $new_project. No app or email worker was started."
echo 'Use the original ENCRYPTION_KEY; keep EMAIL_DELIVERY_ENABLED=false during recovery checks.'
