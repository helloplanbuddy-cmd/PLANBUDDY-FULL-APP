'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
// P2 FIX: useAuthGuard removed — layout/dashboard handles auth
import BottomNav from '@/app/components/BottomNav';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import styles from './explore.module.css';

const EXP_CARDS = [
  { dest: 'Goa', sub: 'Beach · Nightlife · 5 days · from ₹18K', gradient: 'linear-gradient(135deg,#0c4a6e,#0284c7)', span2: true, svgW: 32, svgPath: '<path d="M5 24s2.5-5 11-5 11 5 11 5" stroke="white" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="10" r="4" stroke="white" stroke-width="1.8"/><path d="M16 4v2M9 7l1.5 1.5M23 7l-1.5 1.5" stroke="white" stroke-width="1.6" stroke-linecap="round"/>' },
  { dest: 'Manali', sub: 'Mountains · 7 days', gradient: 'linear-gradient(135deg,#1e1b4b,#4338ca)', span2: false, svgW: 24, svgPath: '<path d="M3 20l4-9 3 5 3-10 4 14" stroke="white" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>' },
  { dest: 'Jaipur', sub: 'Heritage · 4 days', gradient: 'linear-gradient(135deg,#500724,#be185d)', span2: false, svgW: 24, svgPath: '<path d="M4 20V9l8-6 8 6v11H4z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/><rect x="9" y="13" width="6" height="7" rx="1" stroke="white" stroke-width="1.5"/>' },
  { dest: 'Kerala', sub: 'Backwaters · 6 days', gradient: 'linear-gradient(135deg,#052e16,#059669)', span2: false, svgW: 24, svgPath: '<path d="M12 4c0 5-6 8-6 8s6-1 6 5c0-6 6-5 6-5s-6-3-6-8z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' },
  { dest: 'Andaman', sub: 'Islands · 7 days', gradient: 'linear-gradient(135deg,#083344,#0891b2)', span2: false, svgW: 24, svgPath: '<circle cx="16" cy="9" r="4" stroke="white" stroke-width="1.6"/><path d="M4 19c3-5 8-6 12-3" stroke="white" stroke-width="1.5" stroke-linecap="round"/>' },
  { dest: 'Ladakh', sub: 'Himalayas · 10 days · from ₹40K', gradient: 'linear-gradient(135deg,#0a0e1a,#1e293b)', span2: true, svgW: 32, svgPath: '<path d="M4 26l5-12 4 6 5-14 5 20" stroke="white" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' },
];

const INSIGHTS = [
  {
    dest: 'Goa',
    sub: 'Best Nov–Mar · 5 days ideal',
    iconBg: 'var(--bdim)',
    iconColor: 'var(--blue)',
    iconPath: '<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M10 7v3l2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    chips: [
      { label: 'Budget range', value: '₹15K–₹35K' },
      { label: 'Crowd level', value: 'High (Nov–Jan)' },
      { label: 'Best for', value: 'Beach, Parties' },
      { label: 'Weather', value: '28–32°C' },
    ],
  },
  {
    dest: 'Manali',
    sub: 'Best May–Jun, Oct · 7 days ideal',
    iconBg: 'rgba(99,102,241,.15)',
    iconColor: '#818cf8',
    iconPath: '<path d="M3 17l3-8 3 4 3-9 3 13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>',
    chips: [
      { label: 'Budget range', value: '₹20K–₹50K' },
      { label: 'Crowd level', value: 'High (Jun–Aug)' },
      { label: 'Best for', value: 'Trek, Snow, Biking' },
      { label: 'Weather', value: '8–22°C' },
    ],
  },
];

export default function ExploreScreen() {
  
  const router = useRouter();

  // Phase 2E: track explore_search on screen view — layout guarantees auth
  useEffect(() => {
    ClientAnalytics.track('explore_search', { context: 'screen_viewed' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.shell}>
      {/* Topbar */}
      <header className={styles.topbar} role="banner">
        <h1 className={styles.topbarTitle}>Explore</h1>
        {/* Fix #8: search disabled until backend search is implemented */}
        <button className={styles.ibtn} aria-label="Search — coming soon" type="button" disabled aria-disabled="true" style={{ opacity: 0.4, cursor: 'default' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      {/* Page scroll */}
      <div className={styles.pageScroll} role="region" aria-label="Explore destinations">

        {/* Weekend Picks Banner */}
        <div className={styles.exploreBanner}>
          <div style={{ flex: 1 }}>
            <p className={styles.bannerEyebrow}>✦ Weekend Picks</p>
            <p className={styles.bannerHeadline}>Short trips<br/>near you</p>
            <p className={styles.bannerSub}>2–3 days · budget-friendly</p>
          </div>
          <div className={styles.exploreBannerIcon} aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M16 8v8l6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M8 16h2M22 16h2M16 8V6M16 26v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        {/* Top Destinations grid */}
        <div className={styles.secHdr}><h2 className={styles.secTitle}>Top Destinations</h2></div>
        <div className={styles.expGrid} role="list">
          {EXP_CARDS.map(card => (
            <article
              key={card.dest}
              className={`${styles.expCard} ${card.span2 ? styles.span2 : ''}`}
              role="listitem"
              tabIndex={0}
              style={{ background: card.gradient }}
              aria-label={card.dest}
              onClick={() => router.push('/dashboard/plus')}
            >
              <div className={`${styles.expCardIcon} ${card.span2 ? styles.expSpan2Icon : ''}`} aria-hidden="true">
                <svg width={card.svgW} height={card.svgW} viewBox={`0 0 ${card.svgW * (card.svgW === 32 ? 1 : 1)} ${card.svgW}`} fill="none"
                  dangerouslySetInnerHTML={{ __html: card.svgPath }}
                />
              </div>
              <div className={styles.expOverlay} aria-hidden="true" />
              <div className={styles.expFooter}>
                <p className={styles.expName}>{card.dest}</p>
                <p className={styles.expSub}>{card.sub}</p>
              </div>
            </article>
          ))}
        </div>

        {/* Destination Insights */}
        <div className={styles.secHdr} style={{ paddingTop: 'var(--s20)' }}>
          <h2 className={styles.secTitle}>Destination Insights</h2>
        </div>
        <div className={styles.insightsList}>
          {INSIGHTS.map(ins => (
            <div key={ins.dest} className={styles.destInfoCard}>
              <div className={styles.insightHdr}>
                <div className={styles.insightIcon} style={{ background: ins.iconBg, color: ins.iconColor }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: ins.iconPath }}
                  />
                </div>
                <div>
                  <p className={styles.insightName}>{ins.dest}</p>
                  <p className={styles.insightSub}>{ins.sub}</p>
                </div>
              </div>
              <div className={styles.destInfoGrid}>
                {ins.chips.map(chip => (
                  <div key={chip.label} className={styles.infoChip}>
                    <p className={styles.infoChipLabel}>{chip.label}</p>
                    <p className={styles.infoChipValue}>{chip.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 'var(--s40)' }} />
      </div>

      <BottomNav active="explore" />
    </div>
  );
}
