'use client';

// ============================================================
// PaginationDots — Slide indicator dots
// ============================================================

interface PaginationDotsProps {
  total: number;
  current: number;
  className?: string;
}

export default function PaginationDots({
  total,
  current,
  className = '',
}: PaginationDotsProps) {
  return (
    <div
      className={`pagination-dots ${className}`}
      role="tablist"
      aria-label="Slide navigation"
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          role="tab"
          aria-selected={i === current}
          aria-label={`Slide ${i + 1} of ${total}`}
          className={`dot ${i === current ? 'dot-active' : ''}`}
        />
      ))}

      <style jsx>{`
        .pagination-dots {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.18);
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
            background 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .dot-active {
          width: 20px;
          background: #387cf6;
        }
      `}</style>
    </div>
  );
}
