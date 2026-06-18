// ============================================================
// lib/aiUsage.ts — AI cost governance and quota enforcement
// Phase 2A: PostgreSQL-backed, replaces in-memory usageStore Map
//
// Tracks: tokens, cost, latency per user/model/endpoint
// Enforces: hourly, daily, monthly limits + kill switch
// ============================================================

import { db } from './db';
import { logger } from './logger';

// ── Cost model (USD per 1M tokens) ───────────────────────
// Update when Anthropic pricing changes

const COST_PER_1M: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.25,  output: 1.25  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'default':                   { input: 1.00,  output: 5.00  },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_1M[model] ?? COST_PER_1M['default'];
  return (inputTokens / 1_000_000) * rates.input +
         (outputTokens / 1_000_000) * rates.output;
}

// ── Quota config ──────────────────────────────────────────

const QUOTAS = {
  hourlyTokens:   10_000,    // per user per hour
  dailyTokens:    50_000,    // per user per day
  monthlyTokens:  500_000,   // per user per month
  dailyCostUsd:   0.50,      // per user per day in USD
  monthlyCostUsd: 5.00,      // per user per month in USD
};

// Kill switch: set DISABLE_AI=true in env to block all AI calls
export function isAIKillSwitchActive(): boolean {
  return process.env.DISABLE_AI === 'true';
}

// ── Types ─────────────────────────────────────────────────

export interface UsageRecord {
  tokensInput:  number;
  tokensOutput: number;
  totalTokens:  number;
  costUsd:      number;
  requests:     number;
}

export interface QuotaStatus {
  allowed:      boolean;
  reason?:      string;
  hourlyUsed:   number;
  dailyUsed:    number;
  monthlyUsed:  number;
  dailyCost:    number;
}

// ── Check quota before AI call ────────────────────────────

export async function checkAIQuota(userId: string): Promise<QuotaStatus> {
  if (isAIKillSwitchActive()) {
    return {
      allowed: false, reason: 'AI service temporarily disabled',
      hourlyUsed: 0, dailyUsed: 0, monthlyUsed: 0, dailyCost: 0,
    };
  }

  const now      = new Date();
  const hourAgo  = new Date(now.getTime() - 3_600_000);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [hourlyAgg, dailyAgg, monthlyAgg] = await Promise.all([
    db.aiUsage.aggregate({
      where:   { userId, createdAt: { gte: hourAgo } },
      _sum:    { totalTokens: true },
    }),
    db.aiUsage.aggregate({
      where:   { userId, createdAt: { gte: dayStart } },
      _sum:    { totalTokens: true, costUsd: true },
    }),
    db.aiUsage.aggregate({
      where:   { userId, createdAt: { gte: monthStart } },
      _sum:    { totalTokens: true, costUsd: true },
    }),
  ]);

  const hourlyUsed  = hourlyAgg._sum.totalTokens  ?? 0;
  const dailyUsed   = dailyAgg._sum.totalTokens   ?? 0;
  const monthlyUsed = monthlyAgg._sum.totalTokens ?? 0;
  const dailyCost   = dailyAgg._sum.costUsd       ?? 0;
  const monthlyCost = monthlyAgg._sum.costUsd     ?? 0;

  if (hourlyUsed >= QUOTAS.hourlyTokens) {
    return { allowed: false, reason: 'Hourly AI limit reached. Try again in an hour.', hourlyUsed, dailyUsed, monthlyUsed, dailyCost };
  }
  if (dailyUsed >= QUOTAS.dailyTokens) {
    return { allowed: false, reason: 'Daily AI limit reached. Try again tomorrow.', hourlyUsed, dailyUsed, monthlyUsed, dailyCost };
  }
  if (monthlyUsed >= QUOTAS.monthlyTokens) {
    return { allowed: false, reason: 'Monthly AI limit reached.', hourlyUsed, dailyUsed, monthlyUsed, dailyCost };
  }
  if (dailyCost >= QUOTAS.dailyCostUsd) {
    return { allowed: false, reason: 'Daily AI budget reached. Try again tomorrow.', hourlyUsed, dailyUsed, monthlyUsed, dailyCost };
  }
  if (monthlyCost >= QUOTAS.monthlyCostUsd) {
    return { allowed: false, reason: 'Monthly AI budget reached.', hourlyUsed, dailyUsed, monthlyUsed, dailyCost };
  }

  return { allowed: true, hourlyUsed, dailyUsed, monthlyUsed, dailyCost };
}

// ── Record usage after AI call ────────────────────────────

export interface RecordUsageParams {
  userId:       string;
  model:        string;
  endpoint:     string; // chat|plan|memories
  tokensInput:  number;
  tokensOutput: number;
  latencyMs?:   number;
  success:      boolean;
  errorCode?:   string;
}

export async function recordAIUsage(params: RecordUsageParams): Promise<void> {
  const totalTokens = params.tokensInput + params.tokensOutput;
  const costUsd     = estimateCost(params.model, params.tokensInput, params.tokensOutput);

  try {
    await db.aiUsage.create({
      data: {
        userId:       params.userId,
        provider:     'anthropic',
        model:        params.model,
        endpoint:     params.endpoint,
        tokensInput:  params.tokensInput,
        tokensOutput: params.tokensOutput,
        totalTokens,
        costUsd,
        latencyMs:    params.latencyMs,
        success:      params.success,
        errorCode:    params.errorCode,
      },
    });

    logger.info({
      userId:  params.userId,
      model:   params.model,
      endpoint: params.endpoint,
      tokens:  totalTokens,
      costUsd: costUsd.toFixed(6),
    }, 'AI usage recorded');
  } catch (err) {
    // Never let usage recording break the AI response
    logger.error({ err, userId: params.userId }, 'Failed to record AI usage');
  }
}

// ── Get usage summary for a user ─────────────────────────

export async function getUserUsageSummary(userId: string): Promise<UsageRecord> {
  const dayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const agg = await db.aiUsage.aggregate({
    where: { userId, createdAt: { gte: dayStart } },
    _sum:  { tokensInput: true, tokensOutput: true, totalTokens: true, costUsd: true },
    _count: { id: true },
  });
  return {
    tokensInput:  agg._sum.tokensInput  ?? 0,
    tokensOutput: agg._sum.tokensOutput ?? 0,
    totalTokens:  agg._sum.totalTokens  ?? 0,
    costUsd:      agg._sum.costUsd      ?? 0,
    requests:     agg._count.id         ?? 0,
  };
}
