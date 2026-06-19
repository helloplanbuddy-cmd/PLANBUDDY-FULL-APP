// ============================================================
// /api/plan — Phase 2A
// CHANGES: DB AI quota, prompt security, Redis rate limit,
//          DB usage recording, structured logging, OTel, CSRF
// ============================================================

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getEnv }              from '@/lib/env';
import { requireAuth }         from '@/lib/authMiddleware';
import { PlanRequestSchema, validatePlanOutput } from '@/lib/schemas';
import { limitPlan }           from '@/lib/redisRateLimit';
import { checkAIQuota, recordAIUsage } from '@/lib/aiUsage';
import { checkPrompt }         from '@/lib/promptSecurity';
import { apiError, apiRateLimited, safeParseBody, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { Analytics }           from '@/lib/analytics';
import { captureException }    from '@/lib/monitoring';
import { logger, generateRequestId, logApiRequest, logApiResponse } from '@/lib/logger';
import { trace }               from '@/lib/telemetry';
import { validateCSRF }        from '@/lib/csrf';

export const runtime = 'nodejs';
const MAX_RETRIES = 2;

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

async function generatePlanWithRetry(
  anthropic: Anthropic,
  userPrompt: string
): Promise<{ text: string; inputTokens: number; outputTokens: number; latencyMs: number }> {
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
      const msg = await stream.finalMessage().catch(() => null);
      return {
        text:          fullText,
        inputTokens:   msg?.usage?.input_tokens  ?? Math.ceil(PLAN_SYSTEM.length / 4),
        outputTokens:  msg?.usage?.output_tokens ?? Math.ceil(fullText.length / 4),
        latencyMs:     Date.now() - start,
      };
    } catch (err) {
      lastError = err as Error;
      logger.warn({ attempt: attempt + 1, err: (err as Error).message }, 'Plan validation failed, retrying');
    }
  }
  throw lastError ?? new Error('AI output validation failed after retries');
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start     = Date.now();
  logApiRequest(requestId, 'POST', '/api/plan');

  try {
    getEnv();

    const csrfError = validateCSRF(req);
    if (csrfError) return csrfError;

    const { userId, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const rl = await limitPlan(userId);
    if (!rl.allowed) {
      await Analytics.rateLimitHit(userId, 'plan');
      return apiRateLimited(rl.resetAt);
    }

    const quota = await checkAIQuota(userId);
    if (!quota.allowed) {
      await Analytics.quotaExceeded(userId);
      return apiError(quota.reason ?? 'AI quota exceeded', 429);
    }

    const { body, error: parseErr } = await safeParseBody(req, 10_000);
    if (parseErr) return apiError(parseErr, 400);

    const result = PlanRequestSchema.safeParse(body);
    if (!result.success) return apiError(result.error.issues[0].message, 400);

    const { from, to, days, budget, interests, startDate } = result.data;

    const userPrompt = `Plan a ${days}-day trip from ${from} to ${to}.
Total budget: ₹${budget}
Interests: ${interests.join(', ')}
${startDate ? `Starting: ${startDate}` : ''}

Generate a complete day-by-day itinerary with real places and costs.`;

    // Prompt security check
    const security = checkPrompt(userPrompt, userId, 'plan');
    if (!security.safe) {
      return apiError('Request contains disallowed content', 400);
    }

    const env       = getEnv();
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    let planResult: Awaited<ReturnType<typeof generatePlanWithRetry>>;
    try {
      planResult = await trace.ai('plan', 'claude-haiku-4-5-20251001', () =>
        generatePlanWithRetry(anthropic, userPrompt)
      );
    } catch (err) {
      await captureException(err, { route: '/api/plan', userId });
      return apiError('Failed to generate a valid itinerary. Please try again.', 502);
    }

    await recordAIUsage({
      userId,
      model:        'claude-haiku-4-5-20251001',
      endpoint:     'plan',
      tokensInput:  planResult.inputTokens,
      tokensOutput: planResult.outputTokens,
      latencyMs:    planResult.latencyMs,
      success:      true,
    });
    await Analytics.aiPlanGenerated(userId, to, days);

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
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    logApiResponse(requestId, '/api/plan', 200, Date.now() - start, userId);
    return new Response(readable, {
      headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });

  } catch (err) {
    await captureException(err, { route: '/api/plan', requestId });
    logger.error({ requestId, err }, 'plan handler error');
    return apiError('Planning failed', 500);
  }
}
