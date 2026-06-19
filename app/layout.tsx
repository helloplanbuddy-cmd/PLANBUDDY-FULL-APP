// ============================================================
// /app/layout.tsx — Root Layout [Production Hardened]
// CHANGES:
//   - Mount OfflineBanner globally (was never mounted — P1 fix)
//   - Mount SyncStatusBadge inside OfflineBanner (P1 fix)
//   - Added GlobalErrorBoundary wrapper (Phase 10)
//   - posthogKey typed correctly
// ============================================================
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AnalyticsProvider } from './providers/AnalyticsProvider';
import OfflineBanner from './components/OfflineBanner';

export const metadata: Metadata = {
  title: {
    default: 'PlanBuddy — AI Travel Companion for India',
    template: '%s | PlanBuddy',
  },
  description:
    "Plan trips, track budgets, and explore India's top destinations with your AI travel companion.",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PlanBuddy',
  },
  openGraph: {
    type:        'website',
    title:       'PlanBuddy — AI Travel Companion for India',
    description: "Plan trips, track budgets, and explore India's top destinations with your AI companion.",
    images:      ['/og-image.png'],
  },
  other: {
    referrer: 'strict-origin-when-cross-origin',
  },
};

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',
  themeColor:   '#070e1c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  return (
    <html lang="en">
      <head>
        <meta
          httpEquiv="Permissions-Policy"
          content="camera=(), payment=(), usb=(), bluetooth=()"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <ErrorBoundary>
          <AnalyticsProvider posthogKey={posthogKey}>
            {/*
              P1 FIX: OfflineBanner now mounted at root layout level.
              Previously it existed as a component but was never rendered anywhere.
              Position: fixed top bar — non-intrusive, mobile-friendly, no layout shift.
              SyncStatusBadge is mounted inside OfflineBanner (shown when online + pending).
            */}
            <OfflineBanner />
            <div id="app">{children}</div>
          </AnalyticsProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
