#!/usr/bin/env bash
# ==============================================================================
# backup-postgres.sh — Automated PostgreSQL Backup for PlanBuddy v9
#
# Usage:
#   ./scripts/backup-postgres.sh
#
# Environment Variables:
#   DATABASE_URL  — PostgreSQL connection string (required)
#   BACKUP_DIR    — Directory to store backups (default: ./backups)
#   RETENTION_DAYS — Days to keep backups (default: 30)
#
# Schedule via cron (daily at 2 AM):
#   0 2 * * * cd /app && ./scripts/backup-postgres.sh >> /var/log/backup.log 2>&1
#
# Restore:
#   ./scripts/restore-postgres.sh <backup_file>
# ==============================================================================

set -euo pipefail

# --- Configuration ---
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="planbuddy_${TIMESTAMP}.sql.gz"

# Parse DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] ERROR: DATABASE_URL not set"
  exit 1
fi

# Extract components from DATABASE_URL
# Format: postgres://user:pass@host:port/dbname
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\2|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')

# --- Setup ---
mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[backup] Database: $DB_NAME on $DB_HOST:$DB_PORT"
echo "[backup] Retention: $RETENTION_DAYS days"

# --- Backup ---
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}"

echo "[backup] Creating backup: $BACKUP_FILE"

PGPASSWORD="${DATABASE_URL#*:}"  # Not ideal but pg_dump needs separate env vars
PGPASSWORD="$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')"

pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --format=custom \
  --compress=9 \
  --verbose \
  --no-owner \
  --no-privileges \
  --file="$BACKUP_FILE" 2>/dev/null

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "[backup] Backup completed: $BACKUP_FILE ($BACKUP_SIZE)"

# --- Integrity Check ---
echo "[backup] Verifying backup integrity..."

# pg_restore --list checks that the archive is readable
if pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
  echo "[backup] ✓ Backup integrity verified"
else
  echo "[backup] ERROR: Backup integrity check failed!"
  exit 1
fi

# --- Create checksum ---
sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
echo "[backup] ✓ SHA256 checksum created"

# --- Write metadata ---
cat > "${BACKUP_FILE}.meta" << EOF
backup_name=$BACKUP_NAME
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
database=$DB_NAME
host=$DB_HOST
size=$BACKUP_SIZE
sha256=$(cat "${BACKUP_FILE}.sha256" | awk '{print $1}')
EOF

echo "[backup] ✓ Metadata written"

# --- Retention cleanup ---
echo "[backup] Cleaning backups older than $RETENTION_DAYS days..."
DELETED_COUNT=0
find "$BACKUP_DIR" -name "planbuddy_*.sql.gz" -mtime +$RETENTION_DAYS -print -delete | while read -r f; do
  echo "[backup]   Deleted: $f"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done
# Also delete orphaned .sha256 and .meta files
find "$BACKUP_DIR" -name "planbuddy_*.sha256" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "planbuddy_*.meta" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

echo "[backup] ✓ Retention cleanup complete"

# --- Summary ---
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "planbuddy_*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

echo "[backup] === SUMMARY ==="
echo "[backup] Backups on disk: $TOTAL_BACKUPS"
echo "[backup] Total size: $TOTAL_SIZE"
echo "[backup] Latest backup: $BACKUP_FILE"
echo "[backup] Completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"