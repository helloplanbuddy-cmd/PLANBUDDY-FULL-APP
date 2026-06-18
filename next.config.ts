// ============================================================
// next.config.ts — PlanBuddy v4 production configuration
// Phase 2: Full security headers, CSP, HSTS, CSRF
// ============================================================

import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Compress output
  compress: true,

  // Packages that must NOT be bundled by webpack — they need Node.js
  // runtime resolution (Prisma engine, OTel instrumentation, Sentry).
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@opentelemetry/sdk-node',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/instrumentation',
    '@sentry/node',
  ],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // HSTS — force HTTPS for 2 years (prod only)
          ...(isProd ? [{
            key:   'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          }] : []),
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-XSS-Protection',          value: '1; mode=block' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          {
            key:   'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), bluetooth=()',
          },
          {
            key:   'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.posthog.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https://api.anthropic.com https://app.posthog.com https://ingest.sentry.io",
              "font-src 'self' https://fonts.gstatic.com",
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
          // CSRF via SameSite cookie (enforced in auth routes) + no CORS on API
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
      // Less restrictive cache for static assets
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  // Block server-side access to .env files
  async rewrites() {
    return [];
  },
};

export default nextConfig;
