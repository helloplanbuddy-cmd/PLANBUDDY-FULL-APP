// ============================================================
// /api/chat — Phase 2A
// CHANGES: DB AI usage quota, prompt security firewall,
//          Redis rate limiting, structured logging, OTel,
//          CSRF validation, kill switch
// ============================================================

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getEnv }             from '@/lib/env';
import { requireAuth }        from '@/lib/authMiddleware';
import { ChatRequestSchema }  from '@/lib/schemas';
import { limitChat }          from '@/lib/redisRateLimit';
import { checkAIQuota, recordAIUsage } from '@/lib/aiUsage';
import { checkConversation }  from '@/lib/promptSecurity';
import { apiError, apiRateLimited, safeParseBody, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { Analytics }          from '@/lib/analytics';
import { captureException }   from '@/lib/monitoring';
import { logger, generateRequestId, logApiRequest, logApiResponse } from '@/lib/logger';
import { trace }              from '@/lib/telemetry';
import { validateCSRF }       from '@/lib/csrf';

export const runtime = 'nodejs';

function buildSystemPrompt(context: Record<string, unknown>): string {
  const {
    city = 'India', tripSummary = 'No active trip', stage = 'pre',
    daysInfo = '', spent = 0, total = 0, remaining = 0,
    budgetHealth = 'ON TRACK', budgetPct = '0%',
    topSpendCategories = 'None yet', weather = 'Check locally',
    dayPlan = '', itinerary = '', profile = '',
    tripMemories = '', interests = '',
  } = context;

  return `You are Buddy, an expert AI travel companion for Indian travelers.

## Active Trip Context
- Destination: ${city}
- Trip: ${tripSummary}
- Stage: ${stage}${daysInfo ? ` (${daysInfo})` : ''}
- Interests: ${interests || 'not specified'}

## Budget Status
- Spent: ₹${spent} of ₹${total} total (${budgetPct}) — ${budgetHealth}
- Remaining: ₹${remaining}
- Top categories: ${topSpendCategories}

## Today's Plan
${dayPlan}

## Upcoming Itinerary
${itinerary || 'Not planned yet'}

## Trip Memories So Far
${tripMemories}

## Traveler Profile
${profile}

## Weather
${weather}

## Rules
- Be proactive — surface warnings, timing tips, crowd info
- Use Indian context: ₹ for prices, IRCTC, auto/tempo terms
- Reference the actual itinerary when answering activity questions
- If budget is CRITICAL or OVER, mention it and suggest cost-saving
- Be specific: real prices, timings, distances
- Keep replies under 150 words unless detailed help is requested
- Warm, knowledgeable-friend tone`;
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start     = Date.now();
  logApiRequest(requestId, 'POST', '/api/chat');

  try {
    getEnv();

    const csrfError = validateCSRF(req);
    if (csrfError) return csrfError;

    const { userId, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    // Redis rate limit
    const rl = await limitChat(userId);
    if (!rl.allowed) {
      await Analytics.rateLimitHit(userId, 'chat');
      return apiRateLimited(rl.resetAt);
    }

    // DB quota check
    const quota = await checkAIQuota(userId);
    if (!quota.allowed) {
      await Analytics.quotaExceeded(userId);
      logger.warn({ userId, reason: quota.reason }, 'AI quota exceeded');
      return apiError(quota.reason ?? 'AI quota exceeded', 429);
    }

    const { body, error: parseErr } = await safeParseBody(req, 100_000);
    if (parseErr) return apiError(parseErr, 400);

    const result = ChatRequestSchema.safeParse(body);
    if (!result.success) return apiError(result.error.issues[0].message, 400);

    const { messages, context } = result.data;

    // Prompt security firewall
    const security = checkConversation(messages, userId);
    if (!security.safe) {
      logger.warn({ userId, violations: security.violations }, 'Prompt injection blocked');
      return apiError('Message contains disallowed content', 400);
    }

    const env       = getEnv();
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const system    = buildSystemPrompt(context ?? {});

    const aiStart = Date.now();
    // anthropic.messages.stream() returns a MessageStream (not a Promise),
    // so we call it directly and wrap only in a no-op trace span for observability.
    void trace.api('/api/chat', 'stream', async () => {});
    const stream = anthropic.messages.stream({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system,
        messages:   messages.slice(-20).map(m => ({
          role:    m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

    const encoder     = new TextEncoder();
    let outputTokens  = 0;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              outputTokens += Math.ceil(chunk.delta.text.length / 4);
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`
              ));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          // Record usage in DB — fire and forget
          const msg = await stream.finalMessage().catch(() => null);
          await recordAIUsage({
            userId,
            model:        'claude-haiku-4-5-20251001',
            endpoint:     'chat',
            tokensInput:  msg?.usage?.input_tokens  ?? Math.ceil(system.length / 4),
            tokensOutput: msg?.usage?.output_tokens ?? outputTokens,
            latencyMs:    Date.now() - aiStart,
            success:      true,
          });
          await Analytics.aiChatUsed(userId, outputTokens);
        } catch (err) {
          await captureException(err, { route: '/api/chat', userId });
          controller.error(err);
        }
      },
    });

    logApiResponse(requestId, '/api/chat', 200, Date.now() - start, userId);
    return new Response(readable, {
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (err) {
    await captureException(err, { route: '/api/chat', requestId });
    logger.error({ requestId, err }, 'chat handler error');
    logApiResponse(requestId, '/api/chat', 500, Date.now() - start);
    return apiError('Internal server error', 500);
  }
}
