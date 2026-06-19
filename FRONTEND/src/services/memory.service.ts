// ============================================================
// src/services/memory.service.ts — Travel Memory API service
// ============================================================

import { apiFetch } from '@/lib/apiClient';
import type { MemoryResponse } from '@/src/types/api';

export const MemoryService = {
  list: (): Promise<MemoryResponse[]> =>
    apiFetch<MemoryResponse[]>('/api/memories'),

  create: (payload: Omit<MemoryResponse, 'id' | 'createdAt'>): Promise<MemoryResponse> =>
    apiFetch<MemoryResponse>('/api/memories', {
      method: 'POST',
      body:   JSON.stringify(payload),
    }),

  delete: (id: string): Promise<{ success: boolean }> =>
    apiFetch<{ success: boolean }>(`/api/memories/${id}`, { method: 'DELETE' }),

  /** Generate an AI summary from a free-text block of trip notes */
  summarize: (notes: string): Promise<{ summary: string }> =>
    apiFetch<{ summary: string }>('/api/memories', {
      method: 'POST',
      body:   JSON.stringify({ notes }),
    }),
};
