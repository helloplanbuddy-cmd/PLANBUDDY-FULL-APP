'use client';
// ============================================================
// hooks/useAsyncState.ts — Generic async state manager
// Phase 5+6: Every async operation gets loading/error/success/empty states.
// Use this hook in any component that fetches data.
//
// Usage:
//   const { data, status, error, execute } = useAsyncState(fetchTrips);
//   // status: 'idle' | 'loading' | 'success' | 'error' | 'empty'
// ============================================================

import { useState, useCallback, useRef } from 'react';
import { ApiError } from '@/lib/apiClient';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error' | 'empty';

export interface AsyncState<T> {
  data:    T | null;
  status:  AsyncStatus;
  error:   string | null;
  /** Execute the async operation */
  execute: (...args: unknown[]) => Promise<T | null>;
  /** Reset to idle */
  reset:   () => void;
}

export function useAsyncState<T>(
  fn: (...args: unknown[]) => Promise<T>,
  options: {
    /** Custom function to determine if result is "empty" */
    isEmpty?: (data: T) => boolean;
  } = {},
): AsyncState<T> {
  const [data,   setData]   = useState<T | null>(null);
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [error,  setError]  = useState<string | null>(null);

  // Track if the component is still mounted
  const isMounted = useRef(true);
  // Cancel previous calls if called again before completion
  const abortRef  = useRef<AbortController | null>(null);

  const execute = useCallback(async (...args: unknown[]): Promise<T | null> => {
    // Abort previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setStatus('loading');
    setError(null);

    try {
      const result = await fn(...args);

      if (!isMounted.current) return null;

      const empty = options.isEmpty
        ? options.isEmpty(result)
        : Array.isArray(result)
          ? (result as unknown[]).length === 0
          : result == null;

      setData(result);
      setStatus(empty ? 'empty' : 'success');
      return result;
    } catch (err) {
      if (!isMounted.current) return null;

      // Ignore aborted requests
      if (err instanceof Error && err.name === 'AbortError') return null;

      const message = err instanceof ApiError
        ? err.userMessage
        : err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';

      setError(message);
      setStatus('error');
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setData(null);
    setStatus('idle');
    setError(null);
  }, []);

  return { data, status, error, execute, reset };
}
