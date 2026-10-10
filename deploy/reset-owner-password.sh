#!/usr/bin/env bash
# Run on the production VPS. Password input stays in memory and container stdin.
set +x
set +a
set -euo pipefail
umask 077

unset owner_email new_password repeated_password
trap 'unset owner_email new_password repeated_password; exec 3>&-' EXIT
trap 'printf "\nPassword reset cancelled.\n" >&2; exit 130' INT
trap 'printf "\nPassword reset cancelled.\n" >&2; exit 143' TERM HUP

if [ "$#" -ne 0 ]; then
  printf '%s\n' 'Usage: sudo bash deploy/reset-owner-password.sh' >&2
  exit 2
fi
if ! { exec 3<>/dev/tty; } 2>/dev/null || [ ! -t 3 ]; then
  printf '%s\n' 'An interactive terminal is required to enter the owner password securely.' >&2
  exit 1
fi

deployment_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
deployment_environment_file=/opt/home-retreat-direct/private/server.env
reset_program="$deployment_directory/reset-owner-password.mjs"
if [ ! -f "$deployment_environment_file" ] || [ ! -r "$deployment_environment_file" ]; then
  printf '%s\n' 'The private production server.env file is missing or unreadable.' >&2
  exit 1
fi
if [ ! -f "$reset_program" ] || [ ! -r "$reset_program" ]; then
  printf '%s\n' 'deploy/reset-owner-password.mjs is missing or unreadable.' >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  printf '%s\n' 'Docker is unavailable. Run this script with sudo after checking the Docker service.' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  printf '%s\n' 'The Docker Compose plugin is required.' >&2
  exit 1
fi

hrd() {
  HRD_ENV_FILE="$deployment_environment_file" docker compose \
    --env-file "$deployment_environment_file" \
    -f "$deployment_directory/compose.yml" -p hrd "$@"
}

if ! hrd config --quiet 2>/dev/null; then
  printf '%s\n' 'The private production Compose configuration is invalid. Check server.env.' >&2
  exit 1
fi
# Retrieve only image names; never render the resolved private configuration.
if ! tools_images=$(hrd config --images tools 2>/dev/null) || [ -z "$tools_images" ]; then
  printf '%s\n' 'The existing maintenance image could not be identified.' >&2
  exit 1
fi
while IFS= read -r tools_image; do
  if ! docker image inspect "$tools_image" >/dev/null 2>&1; then
    printf '%s\n' 'A required maintenance image is missing. This reset will not build or pull images.' >&2
    exit 1
  fi
done <<< "$tools_images"

printf '%s\n' 'Resetting an existing OWNER account on homeretreatdirect.com.' >&3
printf '%s' 'Owner email [info@homeretreatdirect.com]: ' >&3
if ! IFS= read -r -u 3 owner_email; then
  printf '\n%s\n' 'Owner email input ended; no password was changed.' >&2
  exit 1
fi
owner_email=${owner_email:-info@homeretreatdirect.com}
printf '%s\n' 'Use at least 12 characters and no more than 72 UTF-8 bytes.' >&3
printf '%s' 'New owner password: ' >&3
if ! IFS= read -r -s -u 3 new_password; then
  printf '\n%s\n' 'Password input ended; no password was changed.' >&2
  exit 1
fi
printf '\n' >&3
printf '%s' 'Repeat new owner password: ' >&3
if ! IFS= read -r -s -u 3 repeated_password; then
  printf '\n%s\n' 'Password confirmation ended; no password was changed.' >&2
  exit 1
fi
printf '\n' >&3
if [ "$new_password" != "$repeated_password" ]; then
  printf '%s\n' 'Passwords do not match; no password was changed.' >&2
  exit 1
fi
unset repeated_password

# Bash's builtin writes to a pipe, keeping the password out of argv and files.
builtin printf '%s\n%s\n' "$owner_email" "$new_password" | \
  hrd run --rm -T --no-deps --pull never \
    --volume "$reset_program:/app/deploy/reset-owner-password.mjs:ro" \
    tools node deploy/reset-owner-password.mjs --confirm-domain homeretreatdirect.com
unset owner_email new_password
