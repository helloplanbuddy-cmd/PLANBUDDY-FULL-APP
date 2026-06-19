'use client';
// ============================================================
// DashboardScreen — PHASE 2 UPGRADE
// Full navigation to Explore / Buddy / You / Plus tabs
// Auth guard + all existing hooks PRESERVED
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogout } from '@/hooks/useAuthGuard'; // P2 FIX: useAuthGuard removed — layout is single auth guard
import BottomNav from '@/app/components/BottomNav';
import styles from './dashboard.module.css';
import { useAppStore } from '@/store/appStore';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatPhone(phone: string): string {
  if (!phone) return 'Traveler';
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

function fmtBudget(val: number): string {
  if (val >= 100000) return '₹1L';
  if (val >= 1000) return `₹${Math.round(val / 1000)}K`;
  return `₹${val}`;
}

const AI_PICKS = [
  { dest: 'Kerala', sub: 'Backwaters · 6d', price: 'from ₹18K', tag: 'TRENDING', gradient: 'linear-gradient(135deg,#052e16,#059669)', svgPath: '<path d="M14 5c0 5.5-7 10-7 10s7-1 7 5c0-6 7-5 7-5s-7-4.5-7-10z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' },
  { dest: 'Rishikesh', sub: 'Rafting · 4d', price: 'from ₹9K', tag: 'ADVENTURE', gradient: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)', svgPath: '<path d="M4 20c2-6 5-8 10-8s8 2 10 8" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M8 14l-2-6 6 2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { dest: 'Hampi', sub: 'History · 3d', price: 'from ₹12K', tag: 'HERITAGE', gradient: 'linear-gradient(135deg,#431407,#ea580c)', svgPath: '<rect x="4" y="16" width="20" height="6" rx="1" stroke="white" stroke-width="1.5"/><path d="M8 16V9l6-5 6 5v7" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' },
  { dest: 'Andaman', sub: 'Beaches · 7d', price: 'from ₹22K', tag: 'ISLANDS', gradient: 'linear-gradient(135deg,#083344,#0891b2)', svgPath: '<circle cx="18" cy="10" r="4" stroke="white" stroke-width="1.5"/><path d="M5 20c3-5 8-6 13-3" stroke="white" stroke-width="1.5" stroke-linecap="round"/>' },
];

const DEST_CARDS = [
  { name: 'Goa', days: '4–7 days', gradient: 'linear-gradient(135deg,#0c4a6e,#0284c7)', svgPath: '<path d="M3 18s2-4 9-4 9 4 9 4" stroke="white" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="8" r="3" stroke="white" stroke-width="1.6"/>' },
  { name: 'Manali', days: '5–8 days', gradient: 'linear-gradient(135deg,#1a0533,#6d28d9)', svgPath: '<path d="M3 19l4-8 3 5 3-9 4 12" stroke="white" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>' },
  { name: 'Jaipur', days: '3–5 days', gradient: 'linear-gradient(135deg,#5c0a2a,#e11d48)', svgPath: '<path d="M4 20V9l8-6 8 6v11H4z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/>' },
  { name: 'Kerala', days: '6–9 days', gradient: 'linear-gradient(135deg,#052e16,#059669)', svgPath: '<path d="M14 5c0 5.5-7 10-7 10s7-1 7 5c0-6 7-5 7-5s-7-4.5-7-10z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' },
  { name: 'Hampi', days: '2–4 days', gradient: 'linear-gradient(135deg,#431407,#ea580c)', svgPath: '<rect x="4" y="16" width="20" height="6" rx="1" stroke="white" stroke-width="1.5"/><path d="M8 16V9l6-5 6 5v7" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' },
  { name: 'Andaman', days: '5–7 days', gradient: 'linear-gradient(135deg,#083344,#0891b2)', svgPath: '<circle cx="18" cy="10" r="4" stroke="white" stroke-width="1.5"/><path d="M5 20c3-5 8-6 13-3" stroke="white" stroke-width="1.5" stroke-linecap="round"/>' },
];

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'beach', label: 'Beach' },
  { id: 'mountains', label: 'Mountains' },
  { id: 'heritage', label: 'Heritage' },
  { id: 'wildlife', label: 'Wildlife' },
];

const DAY_OPTIONS = [3, 5, 7, 10, 14];

const WELLNESS_NUDGES = [
  'Stay hydrated! It\'s warm in your area. Drink water before your first activity.',
];

export default function DashboardScreen() {
  // P2 FIX: auth guard removed from screen — dashboard/layout.tsx is the single source of truth
  const logout = useLogout();
  const router = useRouter();

  const auth = useAppStore((s) => s.auth);
  const [greeting] = useState(() => getGreeting());
  const [budget, setBudget] = useState(15000);
  const [days, setDays] = useState(3);
  const [fromCity, setFromCity] = useState('Mumbai');
  const [toCity] = useState('Select destination');
  const [activeFilter, setActiveFilter] = useState('all');

  // Fix #7: track screen_viewed — fires once on mount (layout guarantees auth)
  useEffect(() => {
    ClientAnalytics.screenViewed('dashboard');
    ClientAnalytics.track('dashboard_opened');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [wellnessDismissed, setWellnessDismissed] = useState(false);

  // Real trip data from store
  // Fix #4: only show current user's data
  const storeTrips    = useAppStore((s) => s.getUserTrips());
  const storeExpenses = useAppStore((s) => s.getUserExpenses());
  const activeTripId  = useAppStore((s) => s.activeTripId);

  // Budget summary for active trip
  const activeTrip = storeTrips.find((t) => t.id === activeTripId)
    ?? storeTrips.find((t) => t.status === 'active');
  const tripSpent = activeTrip
    ? storeExpenses.filter((e) => e.tripId === activeTrip.id).reduce((s, e) => s + e.amount, 0)
    : 0;
  const budgetPct = activeTrip?.budget ? Math.round((tripSpent / activeTrip.budget) * 100) : 0;


  const sliderPct = ((budget - 5000) / (100000 - 5000)) * 100;
  const displayName = auth?.phone ? formatPhone(auth.phone) : 'Traveler';
  const avatarChar = displayName.charAt(0).toUpperCase();

  // P2 FIX: skeleton guard removed — layout handles auth spinner

  return (
    <div className={styles.shell}>

      {/* ── Topbar ────────────────────────────────────────── */}
      <header className={styles.dashTopbar} role="banner">
        <div className={styles.topbarLeft}>
          <div className={styles.avatar} aria-hidden="true">{avatarChar}</div>
          <div>
            <p className={styles.greetSub}>{greeting}</p>
            <p className={styles.greetName}>{displayName}</p>
          </div>
        </div>
        <div className={styles.topbarRight}>
          <button className={styles.ibtn} aria-label="Search destinations" type="button">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
          <button className={styles.ibtn} aria-label="Notifications" type="button" style={{ position: 'relative' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2a5.5 5.5 0 0 0-5.5 5.5v2.6L3 13v.5h14V13l-1.5-2.9V7.5A5.5 5.5 0 0 0 10 2z" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M8 15.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
            <span className={styles.notifDot} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ── Scrollable content ────────────────────────────── */}
      <div className={styles.pageScroll} role="region" aria-label="Dashboard">

        {/* Wellness nudge */}
        {!wellnessDismissed && (
          <div className={styles.wellnessBar} aria-live="polite" role="status">
            <div className={styles.wellnessIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2v8M6 6l3-4 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M4 14a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p className={styles.wellnessText}>{WELLNESS_NUDGES[0]}</p>
            <button className={styles.wellnessDismiss} aria-label="Dismiss tip" type="button" onClick={() => setWellnessDismissed(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* Weather card */}
        <div className={styles.weatherCard} role="complementary" aria-label="Weather conditions">
          <div className={styles.weatherIcon} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="10" r="5" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M14 3V1M14 19v2M5.5 5.5l-1.5-1.5M22.5 5.5l1.5-1.5M3 11H1M27 11h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M6 20a4 4 0 0 1 8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p className={styles.weatherTemp}>28°C</p>
            <p className={styles.weatherDesc}>Sunny · Mumbai</p>
          </div>
          <div className={styles.weatherRight}>
            <p className={styles.weatherFeelsLbl}>Feels like</p>
            <p className={styles.weatherFeelsVal}>31°C</p>
            <p className={styles.weatherUV}>High UV</p>
          </div>
        </div>

        {/* Hero CTA */}
        <section className={styles.heroCta} aria-label="Plan a new trip">
          <div>
            <p className={styles.heroEyebrow}>✦ AI-powered planning</p>
            <h2 className={styles.heroHeadline}>Where do you<br/>want to go?</h2>
          </div>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" style={{ alignSelf: 'flex-start' }} onClick={() => router.push('/dashboard/plus')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2l1.5 3L13 6l-2.5 2 .5 3.5L8 10l-3 1.5L5.5 8 3 6l3.5-1z" fill="currentColor"/>
            </svg>
            Plan a Trip
          </button>
        </section>

        {/* Quick Plan */}
        <section aria-label="Quick trip planner">
          <div className={styles.secHdr} style={{ paddingTop: 'var(--s20)' }}>
            <h3 className={styles.secTitle}>Quick Plan</h3>
            <span className={styles.badgeTeal}>✦ AI</span>
          </div>
          <div className={`${styles.planForm} ${styles.card2}`}>
            <div className={styles.routeRow}>
              <div className={`${styles.routeField} ${styles.field}`}>
                <label className={styles.fieldLabel} id="fromLabel">From</label>
                <button className={styles.selBtn} type="button" aria-labelledby="fromLabel">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ color: 'var(--t3)', flexShrink: 0 }}>
                    <circle cx="7.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M7.5 13S12 9.5 12 6.5A4.5 4.5 0 0 0 3 6.5C3 9.5 7.5 13 7.5 13z" stroke="currentColor" strokeWidth="1.4"/>
                  </svg>
                  <span className={styles.selText}>{fromCity}</span>
                </button>
              </div>
              <button className={styles.swapBtn} type="button" aria-label="Swap cities" onClick={() => setFromCity(f => f === 'Mumbai' ? 'Delhi' : 'Mumbai')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8h12M10 4l4 4-4 4M6 4L2 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              <div className={`${styles.routeField} ${styles.field}`}>
                <label className={styles.fieldLabel} id="toLabel">To</label>
                <button className={styles.selBtn} type="button" aria-labelledby="toLabel">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ color: 'var(--t3)', flexShrink: 0 }}>
                    <path d="M7.5 1l1.7 4 4.3.6-3 2.8.7 4.1L7.5 10 3 12.5l.7-4.1L.5 5.6l4.3-.6z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  <span className={styles.selText}>{toCity}</span>
                </button>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.field}>
              <div className={styles.budgetHdr}>
                <label className={styles.fieldLabel} id="budgetLabel">Budget</label>
                <span className={styles.budgetVal} aria-live="polite">{fmtBudget(budget)}</span>
              </div>
              <div style={{ position: 'relative', padding: 'var(--s12) 0 var(--s4)' }}>
                <div className={styles.sliderTrack}>
                  <div className={styles.sliderFill} style={{ width: `${sliderPct}%` }} />
                  <input type="range" className={styles.sliderRange} min={5000} max={100000} step={1000} value={budget} aria-labelledby="budgetLabel" onChange={e => setBudget(Number(e.target.value))} />
                </div>
                <div className={styles.sliderHint}><span>₹5K</span><span>₹1L</span></div>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Duration</label>
              <div className={styles.daysRow} role="group" aria-label="Trip duration">
                {DAY_OPTIONS.map(d => (
                  <button key={d} className={`${styles.chip} ${days === d ? styles.chipActive : ''}`} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
                    {d} Days
                  </button>
                ))}
              </div>
            </div>

            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`} type="button" onClick={() => router.push('/dashboard/plus')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2l1.5 3L13 6l-2.5 2 .5 3.5L8 10l-3 1.5L5.5 8 3 6l3.5-1z" fill="currentColor"/>
              </svg>
              Generate with AI ✦
            </button>
          </div>
        </section>

        {/* Recent Trips */}
        <section aria-label="Recent trips">
          <div className={styles.secHdr}>
            <h3 className={styles.secTitle}>Recent Trips</h3>
            <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => router.push('/dashboard/you/trips')}>See all</button>
          </div>
          <div className={styles.hscroll} style={{ paddingLeft: 'var(--s16)' }} role="list">
            {storeTrips.length === 0 ? (
              <div style={{ padding: 'var(--s20)', color: 'var(--fg2)', fontSize: '0.9rem', minWidth: 160 }}>
                No trips yet. Create your first one!
              </div>
            ) : storeTrips.slice(0, 4).map((trip) => {
              const GRADIENTS: Record<string, string> = {
                'active':    'linear-gradient(135deg,#052e16,#059669)',
                'planned':   'linear-gradient(135deg,#0c4a6e,#0284c7)',
                'draft':     'linear-gradient(135deg,#78350f,#d97706)',
                'completed': 'linear-gradient(135deg,#2e1065,#4f46e5)',
              };
              const STATUS_CLS: Record<string, string> = {
                'active':    styles.statusActive,
                'planned':   styles.statusPlanned,
                'draft':     styles.statusDraft,
                'completed': styles.statusDone,
              };
              return (
                <article key={trip.id} className={styles.tripMini} role="listitem" tabIndex={0} aria-label={`${trip.to} trip`} onClick={() => router.push('/dashboard/you/trips')}>
                  <div className={styles.tmThumb} style={{ background: GRADIENTS[trip.status] ?? 'var(--s2)' }}>
                    <div className={styles.tmThumbIcon}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2l2 5 5.5 1-4 3.8.9 5.2L12 15l-4.4 2 .9-5.2L4.5 8 10 7z" stroke="white" strokeWidth="1.6" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <div className={styles.tmInfo}>
                    <p className={styles.tmName}>{trip.to}</p>
                    <p className={styles.tmMeta}>{trip.days.length}d · {trip.from}</p>
                    <span className={`${styles.status} ${STATUS_CLS[trip.status] ?? ''}`}>{trip.status}</span>
                  </div>
                </article>
              );
            })}
            <div className={styles.addTripCard} role="button" tabIndex={0} aria-label="New trip" onClick={() => router.push('/dashboard/plus')}>
              <div className={styles.addTripIcon}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className={styles.addTripLabel}>New trip</p>
            </div>
          </div>
        </section>

        {/* AI Picks */}
        <section aria-label="AI picks">
          <div className={styles.secHdr}>
            <h3 className={styles.secTitle}>AI Picks for You</h3>
            <span className={styles.badgeTeal}>✦ Smart</span>
          </div>
          <div className={styles.picksGrid} role="list">
            {AI_PICKS.map(pick => (
              <article key={pick.dest} className={styles.pickCard} role="listitem" tabIndex={0} aria-label={pick.dest} onClick={() => router.push('/dashboard/explore')}>
                <div className={styles.pickThumb} style={{ background: pick.gradient }}>
                  <div className={styles.pickThumbIcon}>
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: pick.svgPath }} />
                  </div>
                  <span className={styles.pickTag}>{pick.tag}</span>
                </div>
                <div className={styles.pickBody}>
                  <p className={styles.pickName}>{pick.dest}</p>
                  <p className={styles.pickSub}>{pick.sub}</p>
                  <p className={styles.pickPrice}>{pick.price}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Popular Destinations */}
        <section aria-label="Popular destinations">
          <div className={styles.secHdr}>
            <h3 className={styles.secTitle}>Popular Destinations</h3>
            <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => router.push('/dashboard/explore')}>Explore all</button>
          </div>
          <div className={styles.destFilter} role="group" aria-label="Filter by type">
            {FILTER_TABS.map(f => (
              <button key={f.id} className={`${styles.chip} ${activeFilter === f.id ? styles.chipActive : ''}`} type="button" onClick={() => setActiveFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className={styles.destGrid} role="list" aria-label="Destinations" style={{ marginTop: 'var(--s12)' }}>
            {DEST_CARDS.map(dest => (
              <article key={dest.name} className={styles.destCard} role="listitem" tabIndex={0} onClick={() => router.push('/dashboard/explore')}>
                <div className={styles.destThumbWrap} style={{ background: dest.gradient }}>
                  <div className={styles.destThumbIcon}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dest.svgPath }} />
                  </div>
                </div>
                <div className={styles.destInfo}>
                  <p className={styles.destName}>{dest.name}</p>
                  <p className={styles.destDays}>{dest.days}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className={styles.spacerLg} aria-hidden="true" />
      </div>

      {/* ── Bottom Nav ────────────────────────────────────── */}
      <BottomNav active="home" />

      {/* Sign out (hidden accessible) */}
      <div style={{ display: 'none' }}>
        <button onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
