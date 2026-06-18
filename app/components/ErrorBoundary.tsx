'use client';
// ============================================================
// app/components/ErrorBoundary.tsx — Global React Error Boundary
// Phase 10 HARDENED:
//   - Sentry reporting (lazy import — never blocks render)
//   - Retry button (remounts subtree)
//   - Full page reload option (nuclear option for truly broken state)
//   - Offline-aware messaging
//   - Error ID for support reference
//   - Graceful degradation: app continues on partial failures
// ============================================================

import React, { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** Custom fallback UI — overrides built-in error screen */
  fallback?: ReactNode;
}

interface State {
  hasError:  boolean;
  errorId:   string | null;
  isOffline: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: null, isOffline: false };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  async componentDidCatch(error: Error, info: ErrorInfo) {
    const errorId = `pb_${Date.now().toString(36)}`;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    this.setState({ errorId, isOffline });

    try {
      const sentry = await import('@sentry/nextjs').catch(() => null);
      if (sentry) {
        sentry.withScope((scope) => {
          scope.setExtras({
            componentStack: info.componentStack,
            errorId,
            isOffline,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          });
          sentry.captureException(error);
        });
      }
    } catch {
      // Monitoring must never block error recovery
    }

    // eslint-disable-next-line no-console
    console.error('[PlanBuddy ErrorBoundary]', { errorId, error, componentStack: info.componentStack });
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorId: null, isOffline: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback)  return this.props.fallback;

    const { isOffline, errorId } = this.state;

    return (
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        minHeight:      '100dvh',
        padding:        '24px',
        textAlign:      'center',
        background:     '#070e1c',
        color:          '#f1f5f9',
        fontFamily:     'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ fontSize: '52px', marginBottom: '20px' }}>
          {isOffline ? '📡' : '🌋'}
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>
          {isOffline ? 'You\'re offline' : 'Something went wrong'}
        </h1>

        <p style={{
          fontSize:     '14px',
          color:        '#94a3b8',
          marginBottom: '8px',
          maxWidth:     '300px',
          lineHeight:   1.5,
        }}>
          {isOffline
            ? 'Check your connection and try again. Your data is safe.'
            : 'PlanBuddy hit an unexpected error. Your trips and data are safe.'}
        </p>

        {errorId && (
          <p style={{ fontSize: '11px', color: '#475569', marginBottom: '24px', fontFamily: 'monospace' }}>
            Ref: {errorId}
          </p>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={this.handleRetry}
            style={{
              background:   '#6366f1',
              color:        '#fff',
              border:       'none',
              borderRadius: '12px',
              padding:      '12px 24px',
              fontSize:     '15px',
              fontWeight:   600,
              cursor:       'pointer',
              minWidth:     '120px',
            }}
          >
            Try Again
          </button>

          <button
            onClick={this.handleReload}
            style={{
              background:   'transparent',
              color:        '#94a3b8',
              border:       '1px solid rgba(148,163,184,0.2)',
              borderRadius: '12px',
              padding:      '12px 24px',
              fontSize:     '15px',
              cursor:       'pointer',
              minWidth:     '120px',
            }}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}
