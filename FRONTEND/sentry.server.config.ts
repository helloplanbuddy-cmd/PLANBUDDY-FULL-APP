// sentry.server.config.ts — Sentry Node.js server initialization
// This file is loaded automatically by @sentry/nextjs

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  environment: process.env.NODE_ENV,

  enabled: process.env.NODE_ENV === 'production' || !!process.env.SENTRY_DSN,

  beforeSend(event) {
    // Strip phone numbers from breadcrumbs
    if (event.breadcrumbs && event.breadcrumbs.length > 0) {
      event.breadcrumbs = event.breadcrumbs.map((b) => ({
        ...b,
        message: b.message?.replace(/\d{10}/g, '[PHONE]'),
      }));
    }
    return event;
  },
});
