// ============================================================
// lib/schemas.ts — Zod validation schemas for all API routes
// Every API endpoint validates input before processing.
// ============================================================

import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────

export const SendOTPSchema = z.object({
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number (starts 6–9)'),
});

export const VerifyOTPSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/),
  otp:   z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const RefreshSessionSchema = z.object({
  refreshToken: z.string().min(10),
});

// ── Chat ──────────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  role:    z.enum(['user', 'assistant']),
  content: z
    .string()
    .min(1)
    .max(2000, 'Message too long')
    // Prompt injection sanitization
    .refine(
      (s) => !/(ignore previous|disregard instructions|system:|<\/?system>|assistant:)/i.test(s),
      { message: 'Message contains disallowed content' }
    ),
});

export const ChatContextSchema = z.object({
  city:               z.string().max(100).optional(),
  tripSummary:        z.string().max(500).optional(),
  stage:              z.enum(['pre', 'during', 'post']).optional(),
  daysInfo:           z.string().max(100).optional(),
  spent:              z.number().min(0).optional(),
  total:              z.number().min(0).optional(),
  remaining:          z.number().optional(),
  budgetHealth:       z.string().max(50).optional(),
  budgetPct:          z.string().max(20).optional(),
  topSpendCategories: z.string().max(200).optional(),
  weather:            z.string().max(100).optional(),
  dayPlan:            z.string().max(1000).optional(),
  itinerary:          z.string().max(2000).optional(),
  profile:            z.string().max(500).optional(),
  tripMemories:       z.string().max(1000).optional(),
  interests:          z.string().max(200).optional(),
}).optional();

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(40),
  context:  ChatContextSchema,
});

// ── Plan ──────────────────────────────────────────────────

export const PlanRequestSchema = z.object({
  from:       z.string().min(2).max(100),
  to:         z.string().min(2).max(100),
  days:       z.number().int().min(1).max(30),
  budget:     z.number().int().min(500).max(10_000_000),
  interests:  z.array(z.string().max(50)).min(1).max(10),
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── Memories ──────────────────────────────────────────────

export const MemoriesRequestSchema = z.object({
  notes: z.string().max(5000),
});

// ── AI Output Validation (plan response) ──────────────────

const ActivitySchema = z.object({
  id:          z.string(),
  time:        z.string(),
  title:       z.string().max(200),
  description: z.string().max(500),
  cost:        z.number().min(0),
  category:    z.enum(['food', 'travel', 'activity', 'stay', 'shopping', 'misc']),
  isCompleted: z.boolean().default(false),
});

const DaySchema = z.object({
  dayNumber:   z.number().int().min(1),
  date:        z.string(),
  title:       z.string().max(200),
  activities:  z.array(ActivitySchema),
  notes:       z.string().max(500).optional().default(''),
});

export const PlanResponseSchema = z.object({
  title:               z.string().max(200),
  summary:             z.string().max(500),
  totalEstimatedCost:  z.number().min(0),
  days:                z.array(DaySchema).min(1).max(30),
  packingHighlights:   z.array(z.string().max(100)).default([]),
  budgetBreakdown: z.object({
    stay:       z.number().min(0),
    food:       z.number().min(0),
    travel:     z.number().min(0),
    activities: z.number().min(0),
    misc:       z.number().min(0),
  }).optional(),
  bestTimeToVisit: z.string().max(200).optional(),
  weatherNote:     z.string().max(300).optional(),
});

export type PlanResponse = z.infer<typeof PlanResponseSchema>;

/**
 * Validate and parse AI-generated plan JSON.
 * Returns a sanitized PlanResponse or throws with a descriptive error.
 */
export function validatePlanOutput(raw: string): PlanResponse {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON');
  }

  const result = PlanResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI output validation failed: ${result.error.message}`);
  }
  return result.data;
}
