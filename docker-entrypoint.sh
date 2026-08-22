#!/bin/sh
set -eu

lockfile=/app/package-lock.json
stamp=/app/node_modules/.scripture-package-lock.sha256

# Docker preserves the named node_modules volume across image rebuilds. Keep
# it synchronized with the bind-mounted lockfile before starting the app, but
# avoid reinstalling dependencies when the lockfile has not changed.
if [ -f "$lockfile" ]; then
  expected_hash="$(sha256sum "$lockfile" | awk '{print $1}')"
  installed_hash=""

  if [ -f "$stamp" ]; then
    installed_hash="$(cat "$stamp")"
  fi

  if [ "$expected_hash" != "$installed_hash" ]; then
    echo "package-lock.json changed; synchronizing container dependencies"
    npm ci --no-audit --no-fund
    printf '%s\n' "$expected_hash" > "$stamp"
  fi
fi

exec "$@"
