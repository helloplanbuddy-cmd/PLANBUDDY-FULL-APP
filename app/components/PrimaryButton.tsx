'use client';

// ============================================================
// PrimaryButton — v3: added 'outline' variant + size prop
// ============================================================

import { ButtonHTMLAttributes, ReactNode } from 'react';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
}

export default function PrimaryButton({
  children,
  variant = 'primary',
  size = 'lg',
  fullWidth = true,
  loading = false,
  className = '',
  disabled,
  ...rest
}: PrimaryButtonProps) {
  return (
    <>
      <button
        className={`pb-btn pb-btn-${variant} pb-btn-${size} ${fullWidth ? 'pb-btn-full' : ''} ${className}`}
        disabled={disabled || loading}
        aria-busy={loading}
        {...rest}
      >
        {loading ? (
          <span className="pb-spinner" aria-hidden="true" />
        ) : null}
        {children}
      </button>

      <style jsx>{`
        .pb-btn {
          border: none;
          border-radius: 10px;
          font-weight: 700;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.12s ease, transform 0.1s ease, opacity 0.15s ease, border-color 0.12s ease;
          outline: none;
          position: relative;
          letter-spacing: -0.1px;
          white-space: nowrap;
          min-height: 44px;
        }
        .pb-btn:focus-visible {
          box-shadow: 0 0 0 3px rgba(56, 124, 246, 0.45);
        }
        .pb-btn:active:not(:disabled) {
          transform: scale(0.985);
        }
        .pb-btn:disabled {
          opacity: 0.32;
          pointer-events: none;
        }
        .pb-btn-full { width: 100%; }

        /* Sizes */
        .pb-btn-lg { height: 52px; font-size: 15.5px; padding: 0 20px; }
        .pb-btn-md { height: 44px; font-size: 14px; padding: 0 16px; }
        .pb-btn-sm { height: 36px; font-size: 13px; padding: 0 12px; border-radius: 8px; }

        /* Primary */
        .pb-btn-primary {
          background: #387cf6;
          color: #fff;
          box-shadow: 0 4px 20px rgba(56, 124, 246, 0.28);
        }
        .pb-btn-primary:hover:not(:disabled) { background: #2d6ee0; }
        .pb-btn-primary:active:not(:disabled) { background: #2060d8; }

        /* Ghost */
        .pb-btn-ghost {
          background: transparent;
          color: #93b0d0;
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow: none;
        }
        .pb-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.04); }
        .pb-btn-ghost:active:not(:disabled) { background: rgba(255,255,255,0.07); }

        /* Outline */
        .pb-btn-outline {
          background: transparent;
          color: #387cf6;
          border: 1.5px solid #387cf6;
          box-shadow: none;
        }
        .pb-btn-outline:hover:not(:disabled) { background: rgba(56,124,246,0.06); }
        .pb-btn-outline:active:not(:disabled) { background: rgba(56,124,246,0.12); }

        /* Danger */
        .pb-btn-danger {
          background: #e53e3e;
          color: #fff;
          box-shadow: 0 4px 16px rgba(229,62,62,0.25);
        }
        .pb-btn-danger:hover:not(:disabled) { background: #c53030; }
        .pb-btn-danger:active:not(:disabled) { background: #9b2c2c; }

        /* Spinner */
        .pb-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: pb-spin 0.7s linear infinite;
        }
        @keyframes pb-spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
