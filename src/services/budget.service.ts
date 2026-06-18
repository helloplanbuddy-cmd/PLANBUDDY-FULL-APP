// ============================================================
// src/services/budget.service.ts — Budget/Expense API service
// ============================================================

import { apiFetch } from '@/lib/apiClient';
import type { BudgetResponse } from '@/src/types/api';

export const BudgetService = {
  /** Get all expenses for a trip */
  listExpenses: (tripId: string): Promise<BudgetResponse[]> =>
    apiFetch<BudgetResponse[]>(`/api/trips/${tripId}/expenses`),

  /** Add an expense */
  addExpense: (tripId: string, payload: Omit<BudgetResponse, 'id' | 'tripId' | 'createdAt'>): Promise<BudgetResponse> =>
    apiFetch<BudgetResponse>(`/api/trips/${tripId}/expenses`, {
      method: 'POST',
      body:   JSON.stringify(payload),
    }),

  /** Delete an expense */
  deleteExpense: (tripId: string, expenseId: string): Promise<{ success: boolean }> =>
    apiFetch<{ success: boolean }>(`/api/trips/${tripId}/expenses/${expenseId}`, {
      method: 'DELETE',
    }),
};
