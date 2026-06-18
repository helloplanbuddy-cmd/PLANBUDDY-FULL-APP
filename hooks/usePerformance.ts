// ============================================================
// hooks/usePerformance.ts — Render optimization utilities
// PHASE 1: Centralizes memoization + request deduplication
// ============================================================

'use client';

import { useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import type { Trip, Expense } from '@/store/appStore';

// ─── Stable selectors (prevent Zustand re-subscribe churn) ─

export function useActiveTrip(): Trip | undefined {
  return useAppStore(
    useCallback(
      (s) => s.trips.find((t) => t.id === s.activeTripId)
        ?? s.trips.find((t) => t.status === 'active')
        ?? s.trips[0],
      []
    )
  );
}

export function useTripExpenses(tripId: string | undefined): Expense[] {
  return useAppStore(
    useCallback(
      (s) => tripId ? s.expenses.filter((e) => e.tripId === tripId) : [],
      [tripId]
    )
  );
}

export function useTripBudgetSummary(tripId: string | undefined) {
  const trip    = useAppStore((s) => s.trips.find((t) => t.id === tripId));
  const expenses = useTripExpenses(tripId);

  return useMemo(() => {
    const budget    = trip?.budget ?? 0;
    const spent     = expenses.reduce((s, e) => s + e.amount, 0);
    const remaining = budget - spent;
    const pct       = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
    return { budget, spent, remaining, pct };
  }, [trip, expenses]);
}

// ─── Request deduplication ─────────────────────────────────
// Prevents duplicate in-flight API calls (e.g. fast taps on Generate)

type AsyncFn<T> = (...args: unknown[]) => Promise<T>;

export function useDeduplicatedRequest<T>(fn: AsyncFn<T>): AsyncFn<T> {
  const inFlight = useRef<Promise<T> | null>(null);

  return useCallback(
    async (...args: unknown[]) => {
      if (inFlight.current) return inFlight.current;
      inFlight.current = fn(...args).finally(() => {
        inFlight.current = null;
      });
      return inFlight.current;
    },
    [fn]
  ) as AsyncFn<T>;
}

// ─── Stable currency formatter ────────────────────────────

const INR_FORMAT = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function fmtINR(amount: number): string {
  return INR_FORMAT.format(amount);
}

export function fmtINRShort(amount: number): string {
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000)   return `₹${Math.round(amount / 1_000)}K`;
  return `₹${amount}`;
}
