'use strict';

const client = require('prom-client');
const register = new client.Registry();

client.collectDefaultMetrics({ register });

// ─── P0-02 FIX: Custom event-loop lag gauge (P3-07) ───────────────────────
// prom-client's collectDefaultMetrics already exports nodejs_eventloop_lag_seconds.
// We additionally export a planbuddy-specific lag gauge so dashboards can filter
// for our service and we can attach labels (e.g. by service component).
const event_loop_lag_seconds = new client.Gauge({
  name: 'planbuddy_event_loop_lag_seconds',
  help: 'Node.js event loop lag in seconds (rolling measurement)',
  labelNames: ['component'],
});
register.registerMetric(event_loop_lag_seconds);

/**
 * Start a recurring measurement of the event loop lag. Returns a stop() fn.
 * Default interval: 5s. Latency is reported in seconds.
 *
 * @param {string}   component - label value, e.g. 'api', 'workers', 'webhook'
 * @param {number}   intervalMs
 * @returns {{ stop: () => void, getLag: () => number }}
 */
function startEventLoopLagMonitor(component = 'api', intervalMs = 5_000) {
  let lagNs = 0;
  let timer = null;

  function measure() {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const end = process.hrtime.bigint();
      lagNs = Number(end - start);
      const lagSec = lagNs / 1e9;
      event_loop_lag_seconds.set({ component }, lagSec);
    });
  }

  timer = setInterval(measure, intervalMs);
  // Don't keep the event loop alive just for the monitor.
  if (timer && typeof timer.unref === 'function') timer.unref();

  return {
    stop: () => timer && clearInterval(timer),
    getLag: () => lagNs / 1e9,
  };
}

const request_total = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const request_duration_ms = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'path', 'status'],
});

module.exports = {
  register,
  request_total,
  request_duration_ms,
  event_loop_lag_seconds,
  startEventLoopLagMonitor,
};

// Re-export metricsService metrics so middleware/controllers have a single import.
// metricsService.js already registers its metrics on this register instance.
const metricsService = require('../services/metricsService');
Object.assign(module.exports, metricsService);

