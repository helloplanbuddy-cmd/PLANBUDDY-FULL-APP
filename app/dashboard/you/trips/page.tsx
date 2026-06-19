'use client';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import BottomNav from '@/app/components/BottomNav';
import styles from './trips.module.css';

// Fix #3: removed ALL_TRIPS hardcoded demo data — real trips come from store

const FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'planned', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'draft',   label: 'Drafts' },
];

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  planned:   { label: 'Planned',   cls: styles.statusPlanned },
  active:    { label: 'Active',    cls: styles.statusPlanned },
  completed: { label: 'Completed', cls: styles.statusDone    },
  draft:     { label: 'Draft',     cls: styles.statusDraft   },
};

// Deterministic gradient from trip id
const GRADIENTS = [
  'linear-gradient(135deg,#0c4a6e,#0284c7)',
  'linear-gradient(135deg,#2e1065,#4f46e5)',
  'linear-gradient(135deg,#78350f,#d97706)',
  'linear-gradient(135deg,#052e16,#059669)',
  'linear-gradient(135deg,#431407,#ea580c)',
  'linear-gradient(135deg,#083344,#0891b2)',
];
function gradientFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return GRADIENTS[h % GRADIENTS.length];
}

const DEFAULT_SVG = '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>';

export default function TripsPage() {
  // Auth is guarded exclusively by app/dashboard/layout.tsx (single source of truth).
  const router = useRouter();
  const [filter, setFilter] = useState('all');

  // Phase 2E: track trips_viewed + trip_viewed
  useEffect(() => {
    ClientAnalytics.track('trips_viewed');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fix #3: read from store, not hardcoded data
  // Fix #4: only show current user's trips
  const trips      = useAppStore((s) => s.getUserTrips());
  const deleteTrip = useAppStore((s) => s.deleteTrip);

  const filtered = filter === 'all'
    ? trips
    : trips.filter((t) => t.status === filter);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.ibtn} type="button" aria-label="Back" onClick={() => router.push('/dashboard/you')}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <h1 className={styles.topbarTitle}>My Trips</h1>
        <button className={styles.ibtn} type="button" aria-label="New trip" onClick={() => router.push('/dashboard/plus')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </header>
      <div className={styles.pageScroll}>
        <div className={styles.filterRow}>
          {FILTERS.map(f => (
            <button key={f.id} className={`${styles.chip} ${filter === f.id ? styles.chipActive : ''}`} type="button" onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className={styles.tripsList} role="list">
          {filtered.length === 0 && (
            <div className={styles.emptyState} aria-live="polite">
              <p className={styles.emptyTitle}>No trips yet</p>
              <p className={styles.emptyMsg}>Plan your first trip and it will appear here.</p>
            </div>
          )}
          {filtered.map(trip => {
            const s = STATUS_MAP[trip.status] ?? STATUS_MAP.draft;
            const days = trip.days?.length ?? 0;
            const budgetFmt = trip.budget >= 1000
              ? `₹${Math.round(trip.budget / 1000)}K`
              : `₹${trip.budget}`;
            const dateLabel = trip.startDate
              ? new Date(trip.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
              : '—';
            return (
              <article
                key={trip.id}
                className={styles.tripCard}
                role="listitem"
                tabIndex={0}
                onClick={() => ClientAnalytics.track('trip_viewed', { tripId: trip.id, destination: trip.to })}
                onKeyDown={(e) => e.key === 'Enter' && ClientAnalytics.track('trip_viewed', { tripId: trip.id, destination: trip.to })}
              >
                <div className={styles.tripThumb} style={{ background: gradientFor(trip.id) }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" dangerouslySetInnerHTML={{ __html: DEFAULT_SVG }} />
                </div>
                <div className={styles.tripInfo}>
                  <div className={styles.tripHdr}>
                    <p className={styles.tripName}>{trip.title}</p>
                    <span className={`${styles.statusBadge} ${s.cls}`}>{s.label}</span>
                  </div>
                  <p className={styles.tripMeta}>{days} days · {trip.from} · {dateLabel}</p>
                  <p className={styles.tripBudget}>{budgetFmt}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.tripArrow}>
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <button
                  className={styles.tripDeleteBtn}
                  type="button"
                  aria-label={`Delete ${trip.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTrip(trip.id);
                    ClientAnalytics.track('trip_deleted', { tripId: trip.id, destination: trip.to });
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 3.5h10M5.5 3.5V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M6 6v4M8 6v4M3 3.5l.7 7a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </article>
            );
          })}
        </div>
        <div style={{ padding: '0 var(--s16) var(--s16)' }}>
          <button className={styles.btnOutlineFull} type="button" onClick={() => router.push('/dashboard/plus')}>+ Plan a New Trip</button>
        </div>
        <div style={{ height: 'var(--s40)' }} />
      </div>
      <BottomNav active="you" />
    </div>
  );
}
