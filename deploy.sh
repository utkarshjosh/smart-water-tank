#!/bin/bash
# Deployment script for the AquaMind system.
# Usage: ./deploy.sh [backend|frontend|all] [--skip-backup]

set -euo pipefail

DEPLOY_TARGET="${1:-all}"
SKIP_BACKUP="${2:-}"

BACKEND_DIR="backend-v2"
BACKUP_DIR="${AQUAMIND_BACKUP_DIR:-$HOME/aquamind-backups}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${YELLOW}$*${NC}"; }
ok()    { echo -e "${GREEN}$*${NC}"; }
fail()  { echo -e "${RED}$*${NC}" >&2; exit 1; }

# Percent-decoding for the user and password in a URL ("p%40ss" -> "p@ss").
# Backslashes are escaped first so printf %b only ever expands the \xHH it
# was given, never a "\n" that happens to be in a password.
url_decode() { local s="${1//\\/\\\\}"; printf '%b' "${s//%/\\x}"; }

echo "🚀 AquaMind Deployment"
echo "======================"

# --- Database backup -------------------------------------------------------
# Runs before migrations, never after. A migration that half-applies is
# recoverable from a dump taken minutes earlier; it is not recoverable from a
# dump that was never taken.
backup_database() {
  if [ "$SKIP_BACKUP" = "--skip-backup" ]; then
    info "⚠️  Skipping database backup (--skip-backup)"
    return 0
  fi

  local env_file="$BACKEND_DIR/.env"
  [ -f "$env_file" ] || fail "❌ No $env_file - cannot read DATABASE_URL to back up."

  # shellcheck disable=SC2016
  local url
  url="$(grep -E '^DATABASE_URL=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
  [ -n "$url" ] || fail "❌ DATABASE_URL not set in $env_file"

  mkdir -p "$BACKUP_DIR"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"

  # The engine is taken from the URL scheme rather than assumed: this repo's
  # schema.prisma says mysql while some older docs said postgresql, so guessing
  # would produce an empty "backup" that looks like it worked.
  case "$url" in
    mysql://*|mariadb://*)
      command -v mysqldump >/dev/null || fail "❌ mysqldump not found"
      local dump="$BACKUP_DIR/aquamind-mysql-$stamp.sql.gz"
      info "💾 Backing up MySQL → $dump"
      # Parse user:pass@host:port/db out of the URL. The host starts after the
      # LAST "@": a password can contain "@" itself (the live one does), and
      # splitting at the first one handed mysqldump a "host" made of the end
      # of the password, so every deploy needed --skip-backup.
      local creds="${url#*://}"; local hostpart="${creds##*@}"; local userpass="${creds%@*}"
      local db="${hostpart##*/}"; db="${db%%\?*}"
      local hostport="${hostpart%%/*}"
      local host="${hostport%%:*}"; local port="${hostport##*:}"
      [ "$port" = "$host" ] && port=3306
      local user pass
      user="$(url_decode "${userpass%%:*}")"; pass="$(url_decode "${userpass#*:}")"
      # The dump runs as the app's own database user, which has no RELOAD,
      # PROCESS or EVENT privilege. MySQL 8's mysqldump issues FLUSH TABLES for
      # GTID consistency (skipped with --set-gtid-purged=OFF, a flag MariaDB's
      # mysqldump doesn't have), reads tablespaces, and --events needs EVENT;
      # the app defines no events, so tables, routines and triggers are all.
      local gtid=()
      mysqldump --help 2>/dev/null | grep -q -- '--set-gtid-purged' && gtid=(--set-gtid-purged=OFF)
      # A failed dump must not leave a small file behind that looks like a backup.
      if ! MYSQL_PWD="$pass" mysqldump \
        --host="$host" --port="$port" --user="$user" \
        --single-transaction --quick --routines --triggers --no-tablespaces ${gtid[@]+"${gtid[@]}"} \
        "$db" | gzip > "$dump"; then
        rm -f "$dump"
        fail "❌ mysqldump failed (host $host, database $db). Nothing was deployed."
      fi
      ;;
    postgres://*|postgresql://*)
      command -v pg_dump >/dev/null || fail "❌ pg_dump not found"
      local dump="$BACKUP_DIR/aquamind-pg-$stamp.dump"
      info "💾 Backing up PostgreSQL → $dump"
      pg_dump --format=custom --no-owner --file="$dump" "$url"
      ;;
    *)
      fail "❌ Unrecognised DATABASE_URL scheme. Back up manually, then re-run with --skip-backup."
      ;;
  esac

  # A dump that exists but is trivially small means the dump failed quietly.
  local size
  size="$(stat -c %s "$BACKUP_DIR"/aquamind-*-"$stamp".* 2>/dev/null | head -1 || echo 0)"
  [ "${size:-0}" -gt 1024 ] || fail "❌ Backup is only ${size} bytes - treating that as a failure."
  ok "✅ Backup complete ($(numfmt --to=iec "$size" 2>/dev/null || echo "$size B"))"
}

# The repo is one npm workspace: the lockfile lives at the root and
# packages/contracts is a dependency of both apps. Installing from the root
# with --workspace pulls in the named apps plus contracts (built by its
# `prepare` script) and skips the mobile toolchain.
#
# Both server apps are always installed together, whatever the target.
# `npm ci` empties every workspace's node_modules before it installs, so
# naming only one app deletes the other's libraries from under it. On
# 2026-09-14 a frontend-only deploy did this to the running API: it carried on
# with the modules already in memory, but every lazily loaded one failed, so
# every JSON POST broke (including Mosquitto's /api/v1/mqtt-auth/user check)
# and the next restart would have taken it down entirely.
install_dependencies() {
  info "📦 Installing dependencies (backend-v2 + frontend)..."
  (cd "$(dirname "$0")" && npm ci --workspace=backend-v2 --workspace=frontend --no-audit --no-fund)
}

deploy_backend() {
  info "📦 Deploying backend API..."
  cd "$BACKEND_DIR"

  echo "  → Building (prisma generate + tsc)..."
  npm run build

  # Migrations run BEFORE the restart. The new code reads columns the old
  # schema does not have - firebaseAuth selects users.archived_at on every
  # authenticated request - so restarting first would 500 every request until
  # the migration landed.
  echo "  → Applying database migrations..."
  npm run prisma:deploy

  echo "  → Restarting PM2 process..."
  pm2 restart aquamind-api || pm2 start ecosystem.config.js --only aquamind-api

  ok "✅ Backend deployed"
  cd ..
}

deploy_frontend() {
  info "📦 Deploying admin panel + app..."
  cd frontend

  echo "  → Building static bundle..."
  npm run build

  echo "  → Syncing to /var/www/aquamind..."
  sudo rsync -a --delete dist/ /var/www/aquamind/

  ok "✅ Frontend deployed"
  cd ..
}

case "$DEPLOY_TARGET" in
  backend)  backup_database; install_dependencies; deploy_backend ;;
  frontend) install_dependencies; deploy_frontend ;;
  all)      backup_database; install_dependencies; deploy_backend; echo ""; deploy_frontend ;;
  *)
    fail "❌ Invalid target: $DEPLOY_TARGET
Usage: ./deploy.sh [backend|frontend|all] [--skip-backup]"
    ;;
esac

echo ""
ok "📊 PM2 status:"
pm2 status || true
echo ""
ok "✅ Deployment complete"
