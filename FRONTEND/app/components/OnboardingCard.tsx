'use client';
// ============================================================
// OnboardingCard — Feature pill grid visual for onboarding slides
// ============================================================
import type { FeaturePill } from '@/types/index';

interface OnboardingCardProps {
  pills: FeaturePill[];
}

export default function OnboardingCard({ pills }: OnboardingCardProps) {
  const heroPill = pills.find((p) => p.isHero);
  const smallPills = pills.filter((p) => !p.isHero);

  return (
    <>
      <div className="feature-grid" aria-hidden="true">
        {heroPill && (
          <div className="feature-pill pill-hero">
            <div className="fp-icon">{heroPill.icon}</div>
            <div className="fp-content">
              <div className="fp-title">{heroPill.title}</div>
              <div className="fp-sub">{heroPill.sub}</div>
            </div>
            {heroPill.badge && (
              <span className="fp-badge">{heroPill.badge}</span>
            )}
          </div>
        )}

        {smallPills.map((pill) => (
          <div key={pill.title} className="feature-pill pill-small">
            <div className="fp-icon">{pill.icon}</div>
            <div className="fp-title">{pill.title}</div>
            <div className="fp-sub">{pill.sub}</div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .feature-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          width: 100%;
          max-width: 340px;
        }
        .feature-pill {
          background: rgba(17, 30, 53, 1);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pill-hero {
          grid-column: 1 / -1;
          flex-direction: row;
          align-items: center;
          gap: 12px;
          background: rgba(56, 124, 246, 0.08);
          border-color: rgba(56, 124, 246, 0.2);
        }
        .fp-icon { font-size: 18px; flex-shrink: 0; }
        .fp-title { font-size: 12.5px; font-weight: 700; color: #eef4ff; line-height: 1.3; }
        .fp-sub   { font-size: 11px; color: #4e6d8c; line-height: 1.4; }
        .fp-content { flex: 1; }
        .fp-badge {
          font-size: 10px; font-weight: 700; color: #05ca99;
          background: rgba(5, 202, 153, 0.08);
          border: 1px solid rgba(5, 202, 153, 0.18);
          padding: 2px 8px; border-radius: 999px;
          white-space: nowrap; flex-shrink: 0;
        }
      `}</style>
    </>
  );
}
