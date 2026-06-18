'use client';

// ============================================================
// SplashLoader — Animated progress bar for splash screen
// ============================================================

interface SplashLoaderProps {
  /** Duration in ms for the animation */
  duration?: number;
}

export default function SplashLoader({ duration = 1800 }: SplashLoaderProps) {
  return (
    <>
      <div className="splash-bar" role="progressbar" aria-label="Loading PlanBuddy">
        <div
          className="splash-fill"
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>

      <style jsx>{`
        .splash-bar {
          width: 72px;
          height: 2px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          overflow: hidden;
        }
        .splash-fill {
          height: 100%;
          width: 0;
          background: linear-gradient(90deg, #387cf6, #05ca99);
          border-radius: 999px;
          animation: splashLoad linear forwards;
        }
        @keyframes splashLoad {
          0%   { width: 0; }
          60%  { width: 65%; }
          100% { width: 100%; }
        }
      `}</style>
    </>
  );
}
