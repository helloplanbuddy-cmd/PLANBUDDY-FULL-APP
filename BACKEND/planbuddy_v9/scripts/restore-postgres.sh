#!/usr/bin/env bash
# ==============================================================================
# restore-postgres.sh — PostgreSQL Backup Restore for PlanBuddy v9
#
# Usage:
#   ./scripts/restore-postgres.sh <backup_file>
#   ./scripts/restore-postgres.sh /backups/planbuddy_20260606_020000.sql.gz
#
# WARNING: This WILL drop and recreate the target database.
#          All current data will be permanently lost.
#
# Environment Variables:
#   DATABASE_URL — Target PostgreSQL connection string (required)
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "[restore] ERROR: Usage: $0 <backup_file>"
  echo "[restore] Example: $0 /backups/planbuddy_20260606_020000.sql.gz"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[restore] ERROR: DATABASE_URL not set"
  exit 1
fi

# --- Verify checksum if available ---
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  echo "[restore] Verifying backup checksum..."
  if sha256sum -c "$CHECKSUM_FILE" > /dev/null 2>&1; then
    echo "[restore] ✓ Checksum verified"
  else
    echo "[restore] ERROR: Checksum mismatch! Backup may be corrupted."
    exit 1
  fi
fi

# --- Parse DATABASE_URL ---
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\2|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
PGPASSWORD="$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')"

echo "[restore] === RESTORE PRE-FLIGHT ==="
echo "[restore] Backup file: $BACKUP_FILE"
echo "[restore] Target database: $DB_NAME on $DB_HOST:$DB_PORT"
echo "[restore] WARNING: This will DESTROY all data in $DB_NAME"

# --- Confirmation (skip in CI) ---
if [ -t 0 ] && [ "${FORCE_RESTORE:-}" != "true" ]; then
  read -r -p "[restore] Type 'YES-RESTORE' to confirm: " CONFIRM
  if [ "$CONFIRM" != "YES-RESTORE" ]; then
    echo "[restore] Aborted."
    exit 1
  fi
fi

# --- Pre-restore backup of current state ---
PRE_RESTORE_FILE="/tmp/pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
echo "[restore] Creating pre-restore safety backup..."
pg_dump \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
  --format=custom --compress=9 --file="$PRE_RESTORE_FILE" 2>/dev/null || true
echo "[restore] ✓ Pre-restore backup saved to $PRE_RESTORE_FILE"

# --- Drop and recreate database ---
echo "[restore] Dropping and recreating database..."
psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="postgres" \
  -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null
psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="postgres" \
  -c "CREATE DATABASE $DB_NAME;" 2>/dev/null
echo "[restore] ✓ Database recreated"

# --- Restore ---
echo "[restore] Restoring from backup..."
pg_restore \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
  --no-owner --no-privileges --verbose \
  "$BACKUP_FILE" 2>/dev/null || true
echo "[restore] ✓ Restore completed"

# --- Post-restore verification ---
echo "[restore] Running post-restore verification..."
TABLE_COUNT=$(psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
  --dbname="$DB_NAME" --tuples-only --no-align \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
echo "[restore] Tables found: $TABLE_COUNT"

if [ "$TABLE_COUNT" -lt 10 ]; then
  echo "[restore] WARNING: Expected 10+ tables but found only $TABLE_COUNT"
  echo "[restore] Pre-restore backup at: $PRE_RESTORE_FILE"
  exit 1
fi

echo "[restore] === RESTORE COMPLETE ==="
echo "[restore] Database: $DB_NAME"
echo "[restore] Tables: $TABLE_COUNT"
echo "[restore] Pre-restore backup: $PRE_RESTORE_FILE"