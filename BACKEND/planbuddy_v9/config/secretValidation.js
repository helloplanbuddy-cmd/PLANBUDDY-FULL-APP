'use strict';

/**
 * config/secretValidation.js — Production Secret Validation Layer
 *
 * FAILS FAST if critical secrets are missing or insecure.
 * Called at application bootstrap BEFORE any request is served.
 *
 * In production, the application MUST NOT start with:
 *   - Missing JWT_SECRET
 *   - Missing DATABASE_URL
 *   - Missing RAZORPAY_KEY_SECRET
 *   - Missing RAZORPAY_WEBHOOK_SECRET
 *   - Missing REDIS_URL
 *   - JWT_SECRET shorter than 64 characters
 *   - JWT_SECRET equal to common test/dev defaults
 */

const env = require('./env');

const INSECURE_SECRETS = [
  'dev-secret',
  'test',
  'secret',
  'password',
  'changeme',
  'default',
  'test_secret_test_secret_test_secret_test_secret',
  'test_ci_jwt_secret_that_is_long_enough_for_hs256',
];

const MIN_JWT_SECRET_LENGTH = 64;

/**
 * Validates all production secrets. Throws on failure.
 * @param {object} options - { strict: boolean }
 */
function validateSecrets(options = {}) {
  const { strict = env.IS_PROD } = options;
  const errors = [];
  const warnings = [];

  // --- JWT_SECRET ---
  if (!env.JWT_SECRET) {
    errors.push('JWT_SECRET is not configured');
  } else {
    if (INSECURE_SECRETS.includes(env.JWT_SECRET)) {
      errors.push(`JWT_SECRET is set to an insecure default value: "${env.JWT_SECRET.substring(0, 20)}..."`);
    }
    if (strict && env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
      errors.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production (got ${env.JWT_SECRET.length})`);
    }
  }

  // --- DATABASE_URL ---
  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is not configured');
  } else if (env.DATABASE_URL.includes('localhost') && strict) {
    warnings.push('DATABASE_URL points to localhost in production');
  }

  // --- RAZORPAY secrets ---
  if (strict) {
    if (!env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID === 'test') {
      errors.push('RAZORPAY_KEY_ID is not configured or set to test value');
    }
    if (!env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET === 'test') {
      errors.push('RAZORPAY_KEY_SECRET is not configured or set to test value');
    }
    if (!env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET === 'test') {
      errors.push('RAZORPAY_WEBHOOK_SECRET is not configured or set to test value');
    }
    if (!env.REFRESH_TOKEN_SECRET || env.REFRESH_TOKEN_SECRET === 'test') {
      errors.push('REFRESH_TOKEN_SECRET is not configured or set to test value');
    }
    if (strict && env.REFRESH_TOKEN_SECRET && env.REFRESH_TOKEN_SECRET.length < MIN_JWT_SECRET_LENGTH) {
      errors.push(`REFRESH_TOKEN_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production (got ${env.REFRESH_TOKEN_SECRET.length})`);
    }
  }

  // --- REDIS_URL ---
  if (strict && !env.REDIS_URL) {
    errors.push('REDIS_URL is not configured');
  }

  // --- JWT_AUDIENCE (P1-FIX-001) ---
  // In production, audience and issuer MUST be explicitly set to prevent cross-tenant token reuse
  if (strict) {
    if (!env.JWT_AUDIENCE || env.JWT_AUDIENCE === 'planbuddy-api') {
      errors.push('JWT_AUDIENCE must be explicitly set in production (not using default "planbuddy-api")');
    }
    if (!env.JWT_ISSUER || env.JWT_ISSUER === 'planbuddy-auth') {
      errors.push('JWT_ISSUER must be explicitly set in production (not using default "planbuddy-auth")');
    }
  }

  // --- CORS_ORIGINS ---
  if (strict && env.CORS_ORIGINS) {
    const origins = Array.isArray(env.CORS_ORIGINS) ? env.CORS_ORIGINS : [env.CORS_ORIGINS];
    if (origins.includes('*')) {
      errors.push('CORS_ORIGINS must not allow all origins (*) in production');
    }
  }

  // --- Report ---
  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(`[secretValidation] WARNING: ${w}`));
  }

  if (errors.length > 0) {
    if (strict) {
      console.error('\n[secretValidation] FATAL: Production secret validation failed:');
      errors.forEach(e => console.error(`  ✗ ${e}`));
      console.error('\nFix your .env file. Application cannot start.\n');
      process.exit(1);
    } else {
      errors.forEach(e => console.warn(`[secretValidation] WARNING: ${e}`));
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Quick health-check: are secrets present and non-default?
 * Returns a safe boolean (never exposes secret values).
 */
function secretsAreHealthy() {
  const { valid } = validateSecrets({ strict: false });
  return valid;
}

module.exports = { validateSecrets, secretsAreHealthy, INSECURE_SECRETS, MIN_JWT_SECRET_LENGTH };