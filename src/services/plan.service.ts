// ============================================================
// src/services/plan.service.ts — Plan generation service
// Wraps TripService streaming methods with error handling
// ============================================================

import { TripService } from './trip.service';
import type { PlanRequestPayload } from '@/lib/apiClient';

export const PlanService = {
  /** Generate a trip plan (authenticated) — returns SSE stream */
  generatePlan: (payload: PlanRequestPayload, signal?: AbortSignal): Promise<Response> =>
    TripService.streamPlan(payload, signal),

  /** Generate a demo plan (unauthenticated) — returns SSE stream */
  generateDemoPlan: (payload: PlanRequestPayload, signal?: AbortSignal): Promise<Response> =>
    TripService.streamDemoPlan(payload, signal),
};
