#!/usr/bin/env bash
# Run on the VPS only. Secrets remain in the private deployment environment.
set -euo pipefail
umask 077
project=/opt/home-retreat-direct/current
environment=/opt/home-retreat-direct/private/server.env
backup_root=/opt/home-retreat-direct/private/backups
[[ -d "$project/deploy" && -f "$environment" ]] || { echo 'Deployment paths are missing.' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker is unavailable.' >&2; exit 1; }
mkdir -p "$backup_root"
exec 9>"$backup_root/.backup.lock"
flock -n 9 || { echo 'Another backup is running.' >&2; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
directory="$backup_root/$stamp"
mkdir -m 700 "$directory"
compose=(docker compose --env-file "$environment" -f "$project/deploy/compose.yml" -p hrd)
# The database dump runs before the media archive. Uploaded files are retained
# on disk; a later media copy includes files referenced by the database dump.
"${compose[@]}" exec -T db pg_dump -U hrd -d home_retreat_direct --format=custom >"$directory/database.dump"
"${compose[@]}" run --rm --no-deps -T tools tar -czf - -C /app/.local media >"$directory/media.tar.gz"
sha256sum "$directory/database.dump" "$directory/media.tar.gz" >"$directory/SHA256SUMS"
printf '%s\n' 'Keep the matching ENCRYPTION_KEY in a separate encrypted recovery store.' >"$directory/RECOVERY.txt"
echo "Backup complete: $directory"
# Do not auto-delete backups here. Choose retention after checking disk usage
# and confirming an encrypted off-server copy and a successful restore drill.
