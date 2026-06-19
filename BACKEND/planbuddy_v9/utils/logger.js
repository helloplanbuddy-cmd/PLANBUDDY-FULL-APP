'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const pino = require('pino');

// Lazy load env to avoid circular dependencies at module load time
let env = null;
function getEnv() {
  if (!env) {
    env = require('../config/env');
  }
  return env;
}

const requestContext = new AsyncLocalStorage();
function getBindings() {
  return requestContext.getStore() || {};
}

/**
 * P1-10 FIX: PII field redaction.
 * We replace the values of common PII fields with the string '[Redacted]'
 * before they are serialised by Pino. This is a defence-in-depth measure that
 * works even if a caller forgets to redact manually.
 *
 * NOTE: Pino's redact paths operate on object keys recursively. We use a
 * custom serializer so we can hash PII deterministically (helpful for
 * debugging without leaking the value).
 */
const PII_PATHS = [
  'email',
  'phone',
  '*.email',
  '*.phone',
  'password',
  '*.password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
  'body.email',
  'body.phone',
  'body.password',
  'body.currentPassword',
  'body.newPassword',
  'body.otp',
];

function piiSerializer(value) {
  if (typeof value === 'string') {
    // Email: keep domain only.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      const [, domain] = value.split('@');
      return `[redacted-email]@${domain}`;
    }
    // Phone: keep last 2 digits only.
    if (/^\+?\d[\d\s-]{6,}\d$/.test(value)) {
      return `[redacted-phone]xx${value.slice(-2)}`;
    }
    return '[Redacted]';
  }
  return '[Redacted]';
}

const baseLogger = pino({
  get level() {
    return getEnv().LOG_LEVEL || 'info';
  },
  transport: getEnv().IS_DEV ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
  redact: {
    paths: PII_PATHS,
    censor: piiSerializer,
    remove: false,
  },
});

// Ensure debug() exists even when pino is configured at higher levels.
// Some tests/consumers expect logger.debug to be a function.
if (typeof baseLogger.debug !== 'function') {
  baseLogger.debug = baseLogger.info.bind(baseLogger);
}

function setBindings(fields) {
  const current = getBindings();
  requestContext.enterWith({ ...current, ...fields });
}

function getLogger() {
  const bindings = getBindings();
  if (Object.keys(bindings).length === 0) {
    return baseLogger;
  }
  return baseLogger.child(bindings);
}

const logger = new Proxy(baseLogger, {
  get(target, prop) {
    if (prop === 'setBindings') return setBindings;
    if (prop === 'getLogger') return getLogger;

    const currentLogger = getLogger();
    const value = currentLogger[prop];
    if (typeof value === 'function') {
      return value.bind(currentLogger);
    }
    return value;
  },
});

module.exports = logger;
