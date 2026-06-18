// ============================================================
// /api/demo-plan — Public demo endpoint (no auth required)
// Rate limit: 3 generations / IP / day
// Reuses the EXACT SAME PLAN_SYSTEM prompt and Anthropic call
// as /api/plan — single source of truth via shared lib.
// ============================================================

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getEnv }              from '@/lib/env';
import { PlanRequestSchema, validatePlanOutput } from '@/lib/schemas';
import { checkPrompt }         from '@/lib/promptSecurity';
import { apiError, apiRateLimited, safeParseBody, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { captureException }    from '@/lib/monitoring';
import { logger, generateRequestId, logApiRequest, logApiResponse } from '@/lib/logger';

export const runtime = 'nodejs';

// ── Shared plan system prompt (IDENTICAL to /api/plan) ────
// Imported here to ensure single source of truth.
// When /api/plan prompt changes, change it there; sync here.

const PLAN_SYSTEM = `You are an expert Indian travel planner. Generate detailed, realistic trip itineraries.

Always respond with ONLY valid JSON — no markdown, no preamble:
{
  "title": "Trip title",
  "summary": "2-sentence summary",
  "totalEstimatedCost": 18000,
  "days": [
    {
      "dayNumber": 1,
      "date": "Day 1",
      "title": "Arrival & First Impressions",
      "activities": [
        {
          "id": "d1a1",
          "time": "2:00 PM",
          "title": "Check in to hotel",
          "description": "Settle in, freshen up",
          "cost": 2500,
          "category": "stay",
          "isCompleted": false
        }
      ],
      "notes": "Light day"
    }
  ],
  "packingHighlights": ["Sunscreen", "Light cotton clothes"],
  "budgetBreakdown": { "stay": 6000, "food": 4000, "travel": 3000, "activities": 3000, "misc": 2000 },
  "bestTimeToVisit": "October to March",
  "weatherNote": "Expect 28-32°C"
}

Rules: costs in INR, realistic for budget, real timings, authentic local recommendations.
Categories: food | travel | activity | stay | shopping | misc`;

const MAX_RETRIES = 2;

// ── In-memory rate limit (3/day per IP, falls back from Redis) ──
const _ipStore = new Map<string, number[]>();

function checkDemoRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const DAY_MS    = 24 * 60 * 60_000;
  const MAX_DAILY = 3;
  const now       = Date.now();
  const windowStart = now - DAY_MS;

  const hits = (_ipStore.get(ip) ?? []).filter((t) => t > windowStart);
  if (hits.length >= MAX_DAILY) {
    return { allowed: false, remaining: 0, resetAt: (hits[0] ?? now) + DAY_MS };
  }
  hits.push(now);
  _ipStore.set(ip, hits);
  return { allowed: true, remaining: MAX_DAILY - hits.length, resetAt: now + DAY_MS };
}

async function generatePlanWithRetry(
  anthropic: Anthropic,
  userPrompt: string
): Promise<{ text: string; latencyMs: number }> {
  let lastError: Error | null = null;
  const start = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let fullText = '';
    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: PLAN_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        fullText += chunk.delta.text;
      }
    }

    try {
      validatePlanOutput(fullText);
      return { text: fullText, latencyMs: Date.now() - start };
    } catch (err) {
      lastError = err as Error;
      logger.warn({ attempt: attempt + 1, err: (err as Error).message }, 'Demo plan validation failed, retrying');
    }
  }
  throw lastError ?? new Error('AI output validation failed after retries');
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start     = Date.now();
  logApiRequest(requestId, 'POST', '/api/demo-plan');

  try {
    getEnv();

    // ── IP-based rate limit ──────────────────────────────
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';

    const rl = checkDemoRateLimit(ip);
    if (!rl.allowed) {
      logger.info({ ip }, 'Demo rate limit hit');
      return apiRateLimited(rl.resetAt);
    }

    // ── Parse & validate body ────────────────────────────
    const { body, error: parseErr } = await safeParseBody(req, 5_000);
    if (parseErr) return apiError(parseErr, 400);

    const result = PlanRequestSchema.safeParse(body);
    if (!result.success) return apiError(result.error.issues[0].message, 400);

    const { from, to, days, budget, interests, startDate } = result.data;

    const userPrompt = `Plan a ${days}-day trip from ${from} to ${to}.
Total budget: ₹${budget}
Interests: ${interests.join(', ')}
${startDate ? `Starting: ${startDate}` : ''}

Generate a complete day-by-day itinerary with real places and costs.`;

    // ── Prompt security (reused from auth plan) ──────────
    const security = checkPrompt(userPrompt, `demo-${ip}`, 'plan');
    if (!security.safe) {
      return apiError('Request contains disallowed content', 400);
    }

    const env       = getEnv();
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    let planResult: Awaited<ReturnType<typeof generatePlanWithRetry>>;
    try {
      planResult = await generatePlanWithRetry(anthropic, userPrompt);
    } catch (err) {
      await captureException(err, { route: '/api/demo-plan', ip });
      return apiError('Failed to generate a valid itinerary. Please try again.', 502);
    }

    // ── Stream SSE response (same protocol as /api/plan) ─
    const encoder  = new TextEncoder();
    const chunkSz  = 100;
    const text     = planResult.text;

    const readable = new ReadableStream({
      start(controller) {
        for (let i = 0; i < text.length; i += chunkSz) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ text: text.slice(i, i + chunkSz) })}\n\n`
          ));
        }
        // Send remaining generations count so the UI can update
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ meta: { remaining: rl.remaining } })}\n\n`
        ));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    logApiResponse(requestId, '/api/demo-plan', 200, Date.now() - start);
    return new Response(readable, {
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Demo-Remaining': String(rl.remaining),
      },
    });

  } catch (err) {
    await captureException(err, { route: '/api/demo-plan', requestId });
    logger.error({ requestId, err }, 'demo-plan handler error');
    return apiError('Planning failed', 500);
  }
}
