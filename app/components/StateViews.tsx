'use client';
// ============================================================
// app/components/StateViews.tsx — Reusable state UI components
// Phase 10: Empty, Error, Loading, Offline states for any screen.
// Single import for all non-content UI states.
// ============================================================

import type { CSSProperties } from 'react';

// ── Shared styles ────────────────────────────────────────

const base: CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  padding:        '48px 24px',
  textAlign:      'center',
  color:          '#f1f5f9',
  fontFamily:     'system-ui, sans-serif',
  gap:            '12px',
};

const titleStyle: CSSProperties = {
  fontSize:   '17px',
  fontWeight: 600,
  color:      '#e2e8f0',
  margin:     0,
};

const subtitleStyle: CSSProperties = {
  fontSize:   '13px',
  color:      '#64748b',
  margin:     0,
  lineHeight: 1.5,
  maxWidth:   '260px',
};

const btnStyle: CSSProperties = {
  background:   '#6366f1',
  color:        '#fff',
  border:       'none',
  borderRadius: '12px',
  padding:      '10px 22px',
  fontSize:     '14px',
  fontWeight:   600,
  cursor:       'pointer',
  marginTop:    '4px',
};

// ── Empty State ───────────────────────────────────────────

interface EmptyStateProps {
  emoji:    string;
  title:    string;
  subtitle?: string;
  action?:  { label: string; onClick: () => void };
  style?:   CSSProperties;
}

export function EmptyState({ emoji, title, subtitle, action, style }: EmptyStateProps) {
  return (
    <div style={{ ...base, ...style }}>
      <div style={{ fontSize: '44px' }}>{emoji}</div>
      <p style={titleStyle}>{title}</p>
      {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
      {action && (
        <button style={btnStyle} onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  );
}

// ── API Failure UI ────────────────────────────────────────

interface ApiFailureProps {
  error:    string;
  onRetry?: () => void;
  style?:   CSSProperties;
}

export function ApiFailureUI({ error, onRetry, style }: ApiFailureProps) {
  return (
    <div style={{ ...base, ...style }}>
      <div style={{ fontSize: '40px' }}>⚠️</div>
      <p style={titleStyle}>Something went wrong</p>
      <p style={subtitleStyle}>{error}</p>
      {onRetry && (
        <button style={btnStyle} onClick={onRetry}>Try Again</button>
      )}
    </div>
  );
}

// ── Offline UI ────────────────────────────────────────────

interface OfflineProps {
  onRetry?: () => void;
  style?:   CSSProperties;
}

export function OfflineUI({ onRetry, style }: OfflineProps) {
  return (
    <div style={{ ...base, ...style }}>
      <div style={{ fontSize: '40px' }}>📡</div>
      <p style={titleStyle}>You&apos;re offline</p>
      <p style={subtitleStyle}>Check your internet connection. Saved data is still available.</p>
      {onRetry && (
        <button style={btnStyle} onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────

interface LoadingSkeletonProps {
  lines?: number;
  style?: CSSProperties;
}

export function LoadingSkeleton({ lines = 3, style }: LoadingSkeletonProps) {
  return (
    <div style={{ padding: '24px', ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height:       '14px',
            background:   'rgba(255,255,255,0.06)',
            borderRadius: '6px',
            marginBottom: '12px',
            width:        i % 3 === 2 ? '60%' : '100%',
            animation:    'shimmer 1.5s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

// ── Inline Retry Banner ───────────────────────────────────

interface RetryBannerProps {
  message: string;
  onRetry: () => void;
}

export function RetryBanner({ message, onRetry }: RetryBannerProps) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            '12px',
      background:     'rgba(239,68,68,0.1)',
      border:         '1px solid rgba(239,68,68,0.2)',
      borderRadius:   '12px',
      padding:        '12px 16px',
      margin:         '8px 16px',
    }}>
      <p style={{ margin: 0, fontSize: '13px', color: '#fca5a5' }}>{message}</p>
      <button
        onClick={onRetry}
        style={{
          background:   'rgba(239,68,68,0.2)',
          color:        '#fca5a5',
          border:       'none',
          borderRadius: '8px',
          padding:      '6px 12px',
          fontSize:     '12px',
          fontWeight:   600,
          cursor:       'pointer',
          flexShrink:   0,
        }}
      >
        Retry
      </button>
    </div>
  );
}
