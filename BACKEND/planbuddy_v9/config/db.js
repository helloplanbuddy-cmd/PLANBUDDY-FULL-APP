'use strict';

/**
 * config/db.js — Production-Grade PostgreSQL Pool (v4.1)
 *
 * UPGRADES from v4.0:
 *  9. Structured Pino logger replaces all console.info/error/warn calls.
 *
 * Previous upgrades (v4.0 → v3.0):
 *  8. PM2 cluster-safety guard at startup.
 *  1-7. All config sourced from config/env.js, pool tuning, admin queries,
 *       pool telemetry, structured logger, transaction labels, advisory locks.
 */

const { Pool } = require('pg');
const env      = require('./env');

const MAX_RETRIES = 3;
const BASE_DELAY  = 50; // ms

// ─── PM2 Cluster Pool-Safety Guard ───────────────────────────────────────────

function validateClusterPoolSafety() {
  const poolMax    = env.DB_POOL_MAX;
  const instances  = env.PM2_INSTANCES;
  const pgMax      = env.DB_MAX_CONNECTIONS;

  const total      = poolMax * instances;
  const maxAllowed = Math.floor(pgMax * 0.8);

  // Lazy-load logger to avoid circular dependency at module load time
  const logger = require('../utils/logger');

  logger.info(
    `[db] Pool sizing: DB_POOL_MAX=${poolMax} × PM2_INSTANCES=${instances}` +
    ` = ${total} total connections` +
    ` (PG max_connections=${pgMax}, 80% limit=${maxAllowed})`
  );

  if (total > maxAllowed) {
    logger.fatal(
      `[db] FATAL: DB connection pool configuration is unsafe for PM2 cluster mode. ` +
      `DB_POOL_MAX=${poolMax} × PM2_INSTANCES=${instances} = ${total} total connections. ` +
      `PG max_connections=${pgMax}, 80% limit=${maxAllowed}. ` +
      `HOW TO FIX: A) Lower DB_POOL_MAX to ${Math.floor(maxAllowed / instances)} or less. ` +
      `B) Reduce PM2_INSTANCES. C) Raise max_connections.`
    );
    process.exit(1);
  }

  // Soft warning: total is safe but above 60 % — flag for ops review.
  if (total > pgMax * 0.6) {
    logger.warn(
      `[db] WARNING: ${total} connections is above 60% of PG max (${pgMax}). ` +
      'Consider reducing DB_POOL_MAX or PM2_INSTANCES before adding more workers.'
    );
  }
}

// Run immediately — before the pool is created so we fail before any TCP
// connections are attempted.
validateClusterPoolSafety();

// ─── Database class ───────────────────────────────────────────────────────────

class Database {
  constructor() {
    const wantsSsl = /[?&]sslmode=|[?&]ssl=/.test(env.DATABASE_URL);

    if (env.IS_PROD && !wantsSsl) {
      const logger = require('../utils/logger');
      logger.fatal('[db] FATAL: Production DATABASE_URL must include SSL. Add sslmode=require to DATABASE_URL.');
      process.exit(1);
    }

    // SECURITY FIX: Always validate SSL certificates in production
    const sslConfig = wantsSsl
      ? {
          rejectUnauthorized: env.IS_PROD,
        }
      : false;

    this._pool = new Pool({
      connectionString:        env.DATABASE_URL,
      ssl:                     sslConfig,
      max:                     env.DB_POOL_MAX,
      idleTimeoutMillis:       env.DB_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
      statement_timeout:       env.DB_STATEMENT_TIMEOUT_MS,
      application_name:        'planbuddy-api',
    });

    this._pool.on('error', (err) => {
      const logger = require('../utils/logger');
      logger.error({ err }, '[db] Unexpected error on idle pg client');
    });

    this._pool.on('connect', () => {
      const logger = require('../utils/logger');
      const debugFn = typeof logger.debug === 'function' ? logger.debug.bind(logger) : logger.info.bind(logger);
      debugFn('[db] New client connected to pool');
    });
  }

  // ─── Expose pool for graceful shutdown ──────────────────────────────────────
  get pool() {
    return this._pool;
  }

  // ─── Pool telemetry (for Prometheus gauge) ──────────────────────────────────
  poolStats() {
    return {
      total:   this._pool.totalCount,
      idle:    this._pool.idleCount,
      waiting: this._pool.waitingCount,
    };
  }

  // ─── Simple query (READ COMMITTED, uses pool directly) ──────────────────────
  async query(text, params) {
    let client;

    try {
      client = await this._pool.connect();
      return await client.query(text, params);
    } catch (err) {
      const logger = require('../utils/logger');
      const logPayload = {
        errCode: err.code,
        errMessage: err.message,
        syscall: err.syscall,
        address: err.address,
        port: err.port,
      };

      if (err?.errors) {
        logPayload.innerErrors = err.errors.map(inner => ({
          message: inner.message,
          code: inner.code,
          errno: inner.errno,
          syscall: inner.syscall,
          address: inner.address,
          port: inner.port,
        }));
      }

      logger.error(logPayload, '[db] Connection failure — check DATABASE_URL and network connectivity');

      throw err;
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Admin query — overrides statement_timeout for long-running analytics queries.
   */
  async adminQuery(text, params, timeoutMs = 120_000) {
    const client = await this._pool.connect();
    try {
      await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  // ─── READ COMMITTED transaction ─────────────────────────────────────────────
  async transaction(callback, label = 'tx') {
    return this._runTransaction(callback, 'READ COMMITTED', label);
  }

  // ─── REPEATABLE READ transaction ────────────────────────────────────────────
  async transactionRR(callback, label = 'tx_rr') {
    return this._runTransaction(callback, 'REPEATABLE READ', label);
  }

  // ─── Internal: run callback in a transaction, retry on serialization fail ───
  async _runTransaction(callback, isolationLevel, label) {
    const logger = require('../utils/logger');
    let attempt  = 0;
    const stmtTimeout = env.DB_STATEMENT_TIMEOUT_MS || 5000;

    while (true) {
      attempt++;
      const client = await this._pool.connect();
      try {
        await client.query(`SET LOCAL statement_timeout = ${stmtTimeout}`);
        await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${stmtTimeout * 2}`);
        await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});

        const isRetryable = err.code === '40001' || err.code === '40P01';

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 20;
          logger.warn(
            `[db] ${label}: Transaction conflict (${err.code}), ` +
            `retry ${attempt}/${MAX_RETRIES} in ${Math.round(delay)}ms`
          );
          await new Promise(r => setTimeout(r, delay));
        } else {
          if (isRetryable) {
            logger.error({ err }, `[db] ${label}: Max retries exceeded (${err.code})`);
          }
          throw err;
        }
      } finally {
        client.release();
      }
    }
  }

  // ─── Advisory lock helper ───────────────────────────────────────────────────
  async withAdvisoryLock(client, lockKey, callback) {
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
    return callback(client);
  }

  // ─── Healthcheck: runs SELECT NOW(), returns server time + latency ──────────
  async healthcheck() {
    const start  = Date.now();
    const result = await this.query('SELECT NOW() AS server_time, version() AS pg_version');
    return {
      status:     'ok',
      latencyMs:  Date.now() - start,
      serverTime: result.rows[0].server_time,
      pgVersion:  result.rows[0].pg_version.split(' ').slice(0, 2).join(' '),
    };
  }

  // ─── Graceful pool shutdown ─────────────────────────────────────────────────
  async end() {
    return this._pool.end();
  }
}

module.exports = new Database();