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
      # Parse user:pass@host:port/db out of the URL.
      local creds="${url#*://}"; local hostpart="${creds#*@}"; local userpass="${creds%%@*}"
      local db="${hostpart##*/}"; db="${db%%\?*}"
      local hostport="${hostpart%%/*}"
      local host="${hostport%%:*}"; local port="${hostport##*:}"
      [ "$port" = "$host" ] && port=3306
      MYSQL_PWD="${userpass#*:}" mysqldump \
        --host="$host" --port="$port" --user="${userpass%%:*}" \
        --single-transaction --quick --routines --triggers --events \
        "$db" | gzip > "$dump"
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

deploy_backend() {
  info "📦 Deploying backend API..."
  cd "$BACKEND_DIR"

  echo "  → Installing dependencies..."
  npm ci

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

  echo "  → Installing dependencies..."
  npm ci

  echo "  → Building static bundle..."
  npm run build

  echo "  → Syncing to /var/www/aquamind..."
  sudo rsync -a --delete dist/ /var/www/aquamind/

  ok "✅ Frontend deployed"
  cd ..
}

case "$DEPLOY_TARGET" in
  backend)  backup_database; deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      backup_database; deploy_backend; echo ""; deploy_frontend ;;
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
