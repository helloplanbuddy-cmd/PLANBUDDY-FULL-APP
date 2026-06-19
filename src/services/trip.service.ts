// ============================================================
// src/services/trip.service.ts — Trip API service layer
// ============================================================

import { apiFetch, streamAuthPlan, streamDemoPlan, type PlanRequestPayload } from '@/lib/apiClient';
import type { TripResponse } from '@/src/types/api';

export const TripService = {
  /** List all trips for the authenticated user */
  list: (): Promise<TripResponse[]> =>
    apiFetch<TripResponse[]>('/api/trips'),

  /** Get a single trip by ID */
  get: (id: string): Promise<TripResponse> =>
    apiFetch<TripResponse>(`/api/trips/${id}`),

  /** Create a new trip */
  create: (payload: Partial<TripResponse>): Promise<TripResponse> =>
    apiFetch<TripResponse>('/api/trips', {
      method: 'POST',
      body:   JSON.stringify(payload),
    }),

  /** Update an existing trip */
  update: (id: string, patch: Partial<TripResponse>): Promise<TripResponse> =>
    apiFetch<TripResponse>(`/api/trips/${id}`, {
      method: 'PATCH',
      body:   JSON.stringify(patch),
    }),

  /** Delete a trip */
  delete: (id: string): Promise<{ success: boolean }> =>
    apiFetch<{ success: boolean }>(`/api/trips/${id}`, { method: 'DELETE' }),

  /** Stream an AI-generated plan (returns raw Response for SSE) */
  streamPlan: (payload: PlanRequestPayload, signal?: AbortSignal): Promise<Response> =>
    streamAuthPlan(payload, signal),

  /** Stream a demo plan (public, no auth required) */
  streamDemoPlan: (payload: PlanRequestPayload, signal?: AbortSignal): Promise<Response> =>
    streamDemoPlan(payload, signal),
};
