// ============================================================
// /api/memories — Phase 2A
// CHANGES: DB AI quota, Redis rate limit, DB usage recording,
//          prompt security, logging, OTel, CSRF
// ============================================================

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getEnv }              from '@/lib/env';
import { requireAuth }         from '@/lib/authMiddleware';
import { MemoriesRequestSchema } from '@/lib/schemas';
import { limitMemories }       from '@/lib/redisRateLimit';
import { checkAIQuota, recordAIUsage } from '@/lib/aiUsage';
import { checkPrompt }         from '@/lib/promptSecurity';
import { apiOk, apiError, apiRateLimited, safeParseBody } from '@/lib/apiHelpers';
import { Analytics }           from '@/lib/analytics';
import { captureException }    from '@/lib/monitoring';
import { logger, generateRequestId, logApiRequest, logApiResponse } from '@/lib/logger';
import { trace }               from '@/lib/telemetry';
import { validateCSRF }        from '@/lib/csrf';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start     = Date.now();
  logApiRequest(requestId, 'POST', '/api/memories');

  try {
    getEnv();

    const csrfError = validateCSRF(req);
    if (csrfError) return csrfError;

    const { userId, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const rl = await limitMemories(userId);
    if (!rl.allowed) {
      await Analytics.rateLimitHit(userId, 'memories');
      return apiRateLimited(rl.resetAt);
    }

    const quota = await checkAIQuota(userId);
    if (!quota.allowed) {
      return apiError(quota.reason ?? 'AI quota exceeded', 429);
    }

    const { body, error: parseErr } = await safeParseBody(req, 20_000);
    if (parseErr) return apiError(parseErr, 400);

    const result = MemoriesRequestSchema.safeParse(body);
    if (!result.success) return apiError(result.error.issues[0].message, 400);

    const { notes } = result.data;
    if (!notes.trim()) return apiOk({ summary: '' });

    const security = checkPrompt(notes, userId, 'memories');
    if (!security.safe) {
      return apiError('Content contains disallowed material', 400);
    }

    const env       = getEnv();
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const aiStart = Date.now();
    const message = await trace.ai('memories', 'claude-haiku-4-5-20251001', () =>
      anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:     `You are a travel memory summarizer. Given journal entries from an Indian traveler,
write a warm, evocative 2-3 sentence summary of their trip experience.
Write in second person. Keep it under 80 words. No bullet points.`,
        messages: [{
          role:    'user',
          content: `Here are my trip memories:\n- ${security.sanitized}\n\nWrite my trip rewind summary.`,
        }],
      })
    );

    const summary = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    await recordAIUsage({
      userId,
      model:        'claude-haiku-4-5-20251001',
      endpoint:     'memories',
      tokensInput:  message.usage?.input_tokens  ?? 100,
      tokensOutput: message.usage?.output_tokens ?? 200,
      latencyMs:    Date.now() - aiStart,
      success:      true,
    });
    await Analytics.aiMemorySummary(userId);

    logApiResponse(requestId, '/api/memories', 200, Date.now() - start, userId);
    return apiOk({ summary });

  } catch (err) {
    await captureException(err, { route: '/api/memories', requestId });
    logger.error({ requestId, err }, 'memories handler error');
    return apiError('Failed to generate summary', 500);
  }
}
