// ============================================================
// lib/analytics.ts — PostHog server-side event tracking
// Client-side tracking is in providers/AnalyticsProvider.tsx
// ============================================================

// Server-side analytics helper — fire-and-forget, never throws

const POSTHOG_API = 'https://app.posthog.com/capture';

interface PostHogEvent {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
}

async function track(event: PostHogEvent): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  try {
    await fetch(POSTHOG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: event.event,
        distinct_id: event.distinctId,
        properties: {
          ...event.properties,
          $lib: 'planbuddy-server',
        },
      }),
      signal: AbortSignal.timeout(2000), // 2-second timeout
    });
  } catch {
    // analytics must never break app flow
  }
}

export const Analytics = {
  otpSent:         (phone: string) => track({ event: 'otp_sent', distinctId: phone }),
  otpVerified:     (userId: string) => track({ event: 'otp_verified', distinctId: userId }),
  sessionRefreshed:(userId: string) => track({ event: 'session_refreshed', distinctId: userId }),
  logout:          (userId: string) => track({ event: 'logout', distinctId: userId }),
  aiChatUsed:      (userId: string, tokens: number) =>
    track({ event: 'ai_chat_used', distinctId: userId, properties: { tokens } }),
  aiPlanGenerated: (userId: string, destination: string, days: number) =>
    track({ event: 'ai_plan_generated', distinctId: userId, properties: { destination, days } }),
  aiMemorySummary: (userId: string) =>
    track({ event: 'ai_memory_summary', distinctId: userId }),
  rateLimitHit:    (userId: string, endpoint: string) =>
    track({ event: 'rate_limit_hit', distinctId: userId, properties: { endpoint } }),
  quotaExceeded:   (userId: string) =>
    track({ event: 'quota_exceeded', distinctId: userId }),
};
