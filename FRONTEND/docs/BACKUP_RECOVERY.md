# PlanBuddy — Backup & Disaster Recovery Plan
**Version:** 5.0.0 | **Last Updated:** 2026-06-10

---

## RPO & RTO Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** (Recovery Point Objective) | **1 hour** | Maximum data loss acceptable |
| **RTO** (Recovery Time Objective) | **2 hours** | Maximum downtime acceptable |

---

## Backup Strategy

### PostgreSQL Database

**Primary: Continuous WAL Archiving**
```bash
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://planbuddy-backups/wal/%f'
```

**Daily Full Backups (cron)**
```bash
# Runs at 02:00 UTC daily
0 2 * * * pg_dump $DATABASE_URL | gzip | \
  aws s3 cp - s3://planbuddy-backups/daily/$(date +%Y-%m-%d).sql.gz

# Retain 30 days of daily backups
aws s3 ls s3://planbuddy-backups/daily/ | \
  awk '{print $4}' | sort | head -n -30 | \
  xargs -I{} aws s3 rm s3://planbuddy-backups/daily/{}
```

**Hourly Incremental Backups**
```bash
# Runs every hour — WAL segments auto-archived
# Point-in-time recovery window: 7 days
```

**Managed DB (Recommended: Neon/Supabase)**
- Neon: Built-in branching + point-in-time recovery (PITR) to 7 days
- Supabase: Daily backups on Pro plan, PITR on Enterprise
- Use `DATABASE_URL` pointing to managed instance

### IndexedDB (Client-Side)

IndexedDB data is client-local and not backed up server-side.
**Mitigation:** Sync engine pushes all data to PostgreSQL when online.
**Risk:** Data created while offline and never synced is not backed up.
**Mitigation:** Sync engine retries failed items up to 4 times with backoff.

---

## Backup Verification

### Weekly Restore Test (automated)
```bash
#!/bin/bash
# scripts/verify-backup.sh
set -e

BACKUP_DATE=$(date -d "yesterday" +%Y-%m-%d)
BACKUP_FILE="s3://planbuddy-backups/daily/${BACKUP_DATE}.sql.gz"
TEST_DB="planbuddy_restore_test_$(date +%s)"

echo "Verifying backup: $BACKUP_FILE"

# Create test DB
createdb $TEST_DB

# Restore
aws s3 cp $BACKUP_FILE - | gunzip | psql $TEST_DB

# Verify row counts
USERS=$(psql $TEST_DB -c "SELECT COUNT(*) FROM users" -t)
echo "Restored users: $USERS"

if [ "$USERS" -eq "0" ]; then
  echo "BACKUP VERIFICATION FAILED: No users found"
  dropdb $TEST_DB
  exit 1
fi

echo "Backup verification PASSED"
dropdb $TEST_DB
```

---

## Recovery Procedures

### Scenario 1: Accidental Data Deletion (single table)

```bash
# Point-in-time recovery to 1 hour before deletion
# Neon: use branching
neon branches create --name recovery-$(date +%s) \
  --parent main \
  --timestamp "$(date -d '1 hour ago' --iso-8601=seconds)"

# Export affected table from recovery branch
pg_dump $RECOVERY_DATABASE_URL -t users > users_recovery.sql

# Import into production (soft-deleted rows only)
psql $DATABASE_URL < users_recovery.sql
```

### Scenario 2: Full Database Corruption

```bash
# 1. Stop application (set DISABLE_AI=true, return 503 from health check)
# 2. Restore from most recent daily backup:

aws s3 cp s3://planbuddy-backups/daily/$(date +%Y-%m-%d).sql.gz backup.sql.gz
gunzip backup.sql.gz

dropdb planbuddy_prod
createdb planbuddy_prod
psql planbuddy_prod < backup.sql

# 3. Apply WAL logs to bring to point-in-time
# (specific to PostgreSQL setup — use pg_restore with recovery.conf)

# 4. Run migrations to ensure schema is current
npx prisma migrate deploy

# 5. Verify with health check
curl https://planbuddy.app/api/health

# 6. Re-enable application
```

### Scenario 3: Complete Infrastructure Failure

```bash
# Estimated RTO: 2 hours

# Step 1 (0-15 min): Provision new database (Neon/Supabase — < 2 min)
# Step 2 (15-30 min): Restore latest backup + WAL replay
# Step 3 (30-45 min): Deploy application to Vercel (auto from main branch)
# Step 4 (45-60 min): Verify health checks pass
# Step 5 (60-90 min): DNS cutover if needed
# Step 6 (90-120 min): Monitor error rates and confirm recovery
```

---

## Monitoring Alerts

Configure these alerts in your observability stack:

| Alert | Condition | Action |
|-------|-----------|--------|
| Backup Failed | S3 upload missing after 02:30 UTC | PagerDuty page |
| DB Size Growth | >20% daily increase | Investigate immediately |
| Replication Lag | WAL lag > 5 minutes | Investigate immediately |
| Health Check | /api/health returns non-200 | Auto-restart + page |
| Error Rate | 5xx rate > 1% for 5 min | Page on-call |

---

## Data Retention Policy

| Data Type | Retention | Deletion Method |
|-----------|-----------|-----------------|
| User accounts | Until deleted by user | Soft delete → hard delete after 90 days |
| Trip data | Until deleted by user | Soft delete → hard delete after 90 days |
| AI usage logs | 90 days | Automated cleanup job |
| Auth/OTP logs | 30 days | Automated cleanup job |
| Sync events | 30 days | Automated cleanup job |
| Daily DB backups | 30 days | S3 lifecycle policy |
| WAL archives | 7 days | S3 lifecycle policy |

---

## Runbook Location

Full runbooks are maintained in `/docs/runbooks/`:
- `DB_RESTORE.md` — Step-by-step database restoration
- `INCIDENT_RESPONSE.md` — Incident classification and response
- `SCALING.md` — Horizontal scaling procedures
- `ROLLBACK.md` — Application rollback procedures
