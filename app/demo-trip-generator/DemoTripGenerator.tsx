'use client';
// ============================================================
// DemoTripGenerator — /demo-trip-generator
// Phase 2G: Full redesign — premium hero, animated generation,
// rich result cards, strong login conversion.
// Public landing page: real AI plan, no auth, 3/day IP limit.
// Uses /api/demo-plan (same engine as /api/plan).
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { STORAGE_KEYS } from '@/types/index';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import { PlanService } from '@/src/services/plan.service';
import styles from './demo.module.css';

// ── Types ───────────────────────────────────────────────────

interface Activity {
  id: string;
  time: string;
  title: string;
  description?: string;
  cost: number;
  category: string;
}

interface Day {
  dayNumber: number;
  title: string;
  activities: Activity[];
  notes?: string;
}

interface PlanData {
  title?: string;
  summary?: string;
  totalEstimatedCost?: number;
  days?: Day[];
  packingHighlights?: string[];
  budgetBreakdown?: Record<string, number>;
  bestTimeToVisit?: string;
  weatherNote?: string;
  highlights?: string[];
  foodRecommendations?: string[];
  safetyTips?: string[];
}

// ── Constants ───────────────────────────────────────────────

const CITIES = ['Hyderabad', 'Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Kochi', 'Lucknow', 'Indore'];
const DESTINATIONS = ['Goa', 'Manali', 'Kerala', 'Jaipur', 'Rishikesh', 'Andaman', 'Ladakh', 'Hampi', 'Ooty', 'Coorg', 'Varanasi', 'Darjeeling', 'Munnar', 'Udaipur', 'Spiti Valley'];
const DAY_OPTIONS = [3, 5, 7, 10, 14];
const INTERESTS = ['🏖 Beach', '🏔 Mountains', '🏛 Heritage', '🌿 Nature', '🎭 Culture', '🍽 Food', '🧘 Wellness', '🤿 Adventure', '🦁 Wildlife', '🛍 Shopping'];

const POPULAR = [
  { from: 'Hyderabad', to: 'Goa', days: 5, budget: 30000, interests: ['🏖 Beach', '🍽 Food'] },
  { from: 'Delhi', to: 'Manali', days: 7, budget: 25000, interests: ['🏔 Mountains', '🤿 Adventure'] },
  { from: 'Mumbai', to: 'Kerala', days: 6, budget: 35000, interests: ['🌿 Nature', '🧘 Wellness'] },
  { from: 'Bengaluru', to: 'Hampi', days: 3, budget: 12000, interests: ['🏛 Heritage', '🎭 Culture'] },
];

const GEN_STAGES = [
  { label: 'Understanding your travel style', icon: '🧠', detail: 'Analyzing destination preferences…' },
  { label: 'Researching attractions & hotels', icon: '🗺', detail: 'Scanning 200+ India destinations…' },
  { label: 'Building your day-by-day plan', icon: '📅', detail: 'Sequencing activities by time & location…' },
  { label: 'Calculating budget breakdown', icon: '💰', detail: 'Estimating costs for accommodation, food & travel…' },
  { label: 'Adding local recommendations', icon: '🍽', detail: 'Curating hidden gems & must-visits…' },
  { label: 'Finalising your itinerary', icon: '✨', detail: 'Adding safety tips & packing list…' },
];

const REVIEWS = [
  { name: 'Priya M.', city: 'Bangalore', text: 'Planned my Rajasthan trip in 2 minutes. The budget breakdown was spot-on.', avatar: 'PM', rating: 5 },
  { name: 'Arjun S.', city: 'Hyderabad', text: 'Used it for a solo Spiti Valley trip. Every activity recommendation was accurate.', avatar: 'AS', rating: 5 },
  { name: 'Neha K.', city: 'Mumbai', text: 'Goa family trip planned with budget, hotels, even packing list. Saved hours.', avatar: 'NK', rating: 5 },
];

const FAQ = [
  { q: 'How does AI trip planning work?', a: 'Describe your trip preferences, destination, and budget. Our AI generates a complete itinerary — day-by-day activities, hotel recommendations, transport suggestions, and a budget breakdown — in seconds.' },
  { q: 'Can I edit the generated itinerary?', a: 'Yes. Save the trip to your account and edit any day, swap activities, adjust budgets, or regenerate specific sections.' },
  { q: 'Can I book hotels and flights?', a: 'Booked trips surface hotel and flight recommendations. Account users can click through to partner booking sites with pre-filled details.' },
  { q: 'How many free plans can I generate?', a: 'You can generate 3 trips per day on the demo. Create a free account for unlimited trips, saving, and editing.' },
];

const FEATURE_PILLS = [
  { icon: '📅', label: 'Smart itineraries' },
  { icon: '💰', label: 'Budget planning' },
  { icon: '📍', label: 'Local recommendations' },
  { icon: '🎒', label: 'Packing suggestions' },
  { icon: '🛡', label: 'Safety insights' },
];

// ── Helpers ─────────────────────────────────────────────────

function fmtBudget(val: number): string {
  if (val >= 100000) return '₹1L';
  if (val >= 1000) return `₹${Math.round(val / 1000)}K`;
  return `₹${val}`;
}

const CAT_COLORS: Record<string, string> = {
  stay: '#4b8ef1', food: '#0dcfaa', travel: '#f5a623',
  activity: '#a78bfa', shopping: '#f05252', misc: '#8ab4d4',
};

const CAT_ICONS: Record<string, string> = {
  stay: '🏨', food: '🍽', travel: '🚗', activity: '🎯', shopping: '🛍', misc: '📌',
};

// ── Main component ───────────────────────────────────────────

type Step = 'landing' | 'generating' | 'result' | 'limit' | 'signup';

export default function DemoTripGenerator() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('landing');

  // ── All state declarations first (hooks must precede effects) ──
  const [fromCity, setFromCity]       = useState('Hyderabad');
  const [toCity, setToCity]           = useState('Goa');
  const [days, setDays]               = useState(5);
  const [budget, setBudget]           = useState(30000);
  const [interests, setInterests]     = useState<string[]>(['🏖 Beach', '🍽 Food']);
  const [genStageIdx, setGenStageIdx] = useState(0);
  const [genPct, setGenPct]           = useState(0);
  const [planData, setPlanData]       = useState<PlanData | null>(null);
  const [remaining, setRemaining]     = useState<number | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [errorType, setErrorType]     = useState<'network' | 'timeout' | 'ratelimit' | 'partial' | 'server' | null>(null);
  const [isOffline, setIsOffline]     = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openFaq, setOpenFaq]         = useState<number | null>(null);
  const [activeDay, setActiveDay]     = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const formRef  = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DEMO_SEEN, 'true');
    } catch { /* ignore */ }
    ClientAnalytics.track('demo_viewed');
    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sliderPct = ((budget - 5000) / (100000 - 5000)) * 100;

  const toggleInterest = (i: string) =>
    setInterests((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);

  const applyPreset = (p: typeof POPULAR[0]) => {
    setFromCity(p.from); setToCity(p.to); setDays(p.days);
    setBudget(p.budget); setInterests(p.interests);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleGenerate = useCallback(async () => {
    if (interests.length === 0) return;

    // Offline guard
    if (!navigator.onLine) {
      setError('You appear to be offline. Please check your connection and try again.');
      setErrorType('network');
      return;
    }

    setStep('generating');
    setGenStageIdx(0);
    setGenPct(0);
    setError(null);
    setErrorType(null);
    setPlanData(null);
    setActiveDay(0);

    const stageInterval = setInterval(() => {
      setGenStageIdx((i) => Math.min(i + 1, GEN_STAGES.length - 1));
      setGenPct((p) => Math.min(p + 15, 88));
    }, 1400);

    abortRef.current = new AbortController();

    // 60-second fetch timeout
    timeoutRef.current = setTimeout(() => {
      abortRef.current?.abort();
      clearInterval(stageInterval);
      setError('Trip generation took too long. Please try again.');
      setErrorType('timeout');
      setStep('landing');
    }, 60_000);

    try {
      const res = await PlanService.generateDemoPlan(
        { from: fromCity, to: toCity, days, budget, interests },
        abortRef.current.signal,
      );

      if (res.status === 429) {
        clearInterval(stageInterval);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setRemaining(0);
        setStep('limit');
        return;
      }

      if (res.status === 503 || res.status === 502) {
        throw Object.assign(new Error('Backend unavailable'), { kind: 'server' });
      }

      if (!res.ok || !res.body) throw Object.assign(new Error('Generation failed'), { kind: 'server' });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) accumulated += parsed.text;
            if (parsed.meta?.remaining !== undefined) setRemaining(parsed.meta.remaining);
          } catch { /* partial SSE chunk — safe to skip */ }
        }
      }

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (!accumulated.trim()) {
        throw Object.assign(new Error('Empty response'), { kind: 'partial' });
      }

      let parsed: PlanData;
      try {
        const clean = accumulated.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch {
        throw Object.assign(new Error('Partial response received'), { kind: 'partial' });
      }

      clearInterval(stageInterval);
      setGenPct(100);
      setPlanData(parsed);
      setTimeout(() => setStep('result'), 400);

    } catch (err) {
      clearInterval(stageInterval);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if ((err as Error).name === 'AbortError') {
        // Timeout already set error, or user navigated away — noop
        return;
      }
      const kind = (err as { kind?: string }).kind;
      console.error('[DemoGen]', err);
      if (!navigator.onLine) {
        setError('You went offline during generation. Reconnect and try again.');
        setErrorType('network');
      } else if (kind === 'partial') {
        setError('We received an incomplete plan. Please try again.');
        setErrorType('partial');
      } else if (kind === 'server') {
        setError('Our servers are temporarily unavailable. Please try again in a moment.');
        setErrorType('server');
      } else {
        setError('Could not generate your plan. Please try again.');
        setErrorType('server');
      }
      setStep('landing');
    }
  }, [fromCity, toCity, days, budget, interests]);

  useEffect(() => {
    if (step === 'result') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // ── Rate limit wall ─────────────────────────────────────
  if (step === 'limit') {
    return (
      <div className={styles.page}>
        <Nav onSignup={() => router.push('/auth/phone')} />
        <div className={styles.limitWall}>
          <div className={styles.limitOrb}>🗓</div>
          <h2 className={styles.limitTitle}>3 free plans used today</h2>
          <p className={styles.limitSub}>Create a free account for unlimited trip generation, saving, and editing.</p>
          <button className={styles.btnPrimary} onClick={() => router.push('/auth/phone')}>
            Create free account →
          </button>
          <button className={styles.btnGhost} onClick={() => setStep('landing')}>
            Back to demo
          </button>
        </div>
      </div>
    );
  }

  // ── Generating screen ────────────────────────────────────
  if (step === 'generating') {
    return (
      <div className={styles.page}>
        <Nav onSignup={() => router.push('/auth/phone')} />
        <div className={styles.genShell} aria-live="polite" aria-label="Generating your trip plan">
          {/* Animated orb */}
          <div className={styles.genOrbWrap} aria-hidden="true">
            <div className={styles.genOrbRing1} />
            <div className={styles.genOrbRing2} />
            <div className={styles.genOrbCore}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L20 12H28L22 18L24 26L16 21L8 26L10 18L4 12H12L16 4Z"
                  stroke="#387cf6" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(56,124,246,0.12)" />
              </svg>
            </div>
          </div>

          <div className={styles.genMeta}>
            <span className={styles.genRoute}>{fromCity} → {toCity}</span>
            <span className={styles.genDot} aria-hidden="true">·</span>
            <span className={styles.genTrip}>{days} days · {fmtBudget(budget)}</span>
          </div>

          <h2 className={styles.genTitle}>Building your trip plan</h2>
          <p className={styles.genSubtitle}>{GEN_STAGES[genStageIdx]?.detail}</p>

          {/* Progress bar */}
          <div className={styles.genProgressWrap} role="progressbar" aria-valuenow={genPct} aria-valuemin={0} aria-valuemax={100}>
            <div className={styles.genProgressTrack}>
              <div className={styles.genProgressFill} style={{ width: `${genPct}%` }} />
            </div>
            <span className={styles.genProgressPct}>{genPct}%</span>
          </div>

          {/* Stage list */}
          <div className={styles.genStageList}>
            {GEN_STAGES.map((s, i) => {
              const done   = i < genStageIdx;
              const active = i === genStageIdx;
              return (
                <div key={s.label}
                  className={`${styles.genStageItem} ${done ? styles.genStageDone : ''} ${active ? styles.genStageActive : ''}`}>
                  <div className={styles.genStageCheck}>
                    {done
                      ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : active
                        ? <div className={styles.genStagePulse} aria-hidden="true" />
                        : <div className={styles.genStageEmpty} aria-hidden="true" />
                    }
                  </div>
                  <span className={styles.genStageLabel}>{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* Cancel generation */}
          <button className={styles.genCancelBtn}
            onClick={() => {
              abortRef.current?.abort();
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setStep('landing');
            }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Result screen ────────────────────────────────────────
  if (step === 'result' && planData) {
    const currentDayData = planData.days?.[activeDay];

    return (
      <div className={styles.page}>
        <Nav onSignup={() => setStep('signup')} />

        {isOffline && (
          <div className={styles.offlineBanner} role="status" aria-live="polite">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M10.7 4.3A6.5 6.5 0 0 1 13 7M1 7a6.5 6.5 0 0 1 2.3-2.7M4.5 9.5A3.5 3.5 0 0 1 7 8.5c.9 0 1.7.3 2.3.8M7 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            You&apos;re offline — some features unavailable
          </div>
        )}

        {/* Result hero */}
        <div className={styles.resultHero}>
          <div className={styles.resultHeroInner}>
            <div className={styles.resultBreadcrumb}>
              <span>{fromCity}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{toCity}</span>
            </div>

            <h1 className={styles.resultTitle}>{planData.title ?? `${toCity} Trip`}</h1>
            {planData.summary && <p className={styles.resultSummary}>{planData.summary}</p>}

            <div className={styles.resultStatRow}>
              <div className={styles.resultStat}>
                <span className={styles.resultStatValue}>{fmtBudget(planData.totalEstimatedCost ?? budget)}</span>
                <span className={styles.resultStatLabel}>Total budget</span>
              </div>
              <div className={styles.resultStatDiv} />
              <div className={styles.resultStat}>
                <span className={styles.resultStatValue}>{days}</span>
                <span className={styles.resultStatLabel}>Days</span>
              </div>
              {planData.days && (
                <>
                  <div className={styles.resultStatDiv} />
                  <div className={styles.resultStat}>
                    <span className={styles.resultStatValue}>{planData.days.reduce((acc, d) => acc + d.activities.length, 0)}</span>
                    <span className={styles.resultStatLabel}>Activities</span>
                  </div>
                </>
              )}
              {planData.bestTimeToVisit && (
                <>
                  <div className={styles.resultStatDiv} />
                  <div className={styles.resultStat}>
                    <span className={styles.resultStatValue}>{planData.bestTimeToVisit}</span>
                    <span className={styles.resultStatLabel}>Best time</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className={styles.resultBody}>

          {/* Quick save CTA — sticky nudge at top */}
          <div className={styles.saveCtaBanner}>
            <span className={styles.saveBannerText}>✦ Your trip is ready — save it before it disappears</span>
            <button className={styles.saveBannerBtn} onClick={() => router.push('/auth/phone')}>
              Save trip
            </button>
          </div>

          {/* Budget breakdown */}
          {planData.budgetBreakdown && (
            <section className={styles.resultSection}>
              <h2 className={styles.resultSectionTitle}>
                <span className={styles.sectionIcon}>💰</span>
                Budget breakdown
              </h2>
              <div className={styles.budgetCards}>
                {Object.entries(planData.budgetBreakdown).map(([cat, amt]) => {
                  const pct = Math.min(100, Math.round((amt / (planData.totalEstimatedCost ?? budget)) * 100));
                  return (
                    <div key={cat} className={styles.budgetCard}>
                      <div className={styles.budgetCardIcon}>{CAT_ICONS[cat] ?? '💼'}</div>
                      <div className={styles.budgetCardBody}>
                        <div className={styles.budgetCardHeader}>
                          <span className={styles.budgetCardCat}>{cat}</span>
                          <span className={styles.budgetCardPct}>{pct}%</span>
                        </div>
                        <div className={styles.budgetCardBar}>
                          <div className={styles.budgetCardBarFill}
                            style={{ width: `${pct}%`, background: CAT_COLORS[cat] ?? '#4b8ef1' }} />
                        </div>
                        <span className={styles.budgetCardAmt}>{fmtBudget(amt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Highlights */}
          {planData.highlights && planData.highlights.length > 0 && (
            <section className={styles.resultSection}>
              <h2 className={styles.resultSectionTitle}>
                <span className={styles.sectionIcon}>⭐</span>
                Trip highlights
              </h2>
              <div className={styles.highlightsList}>
                {planData.highlights.map((h, i) => (
                  <div key={i} className={styles.highlightItem}>
                    <span className={styles.highlightNum}>{i + 1}</span>
                    <span className={styles.highlightText}>{h}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Day-by-day itinerary with tab navigation */}
          {planData.days && planData.days.length > 0 && (
            <section className={styles.resultSection}>
              <h2 className={styles.resultSectionTitle}>
                <span className={styles.sectionIcon}>📅</span>
                Day-by-day itinerary
              </h2>

              {/* Day tabs */}
              <div className={styles.dayTabs} role="tablist" aria-label="Trip days">
                {planData.days.map((day, i) => (
                  <button key={day.dayNumber}
                    id={`day-tab-${i}`}
                    role="tab"
                    aria-selected={activeDay === i}
                    aria-controls={`day-panel-${i}`}
                    className={`${styles.dayTab} ${activeDay === i ? styles.dayTabActive : ''}`}
                    onClick={() => setActiveDay(i)}>
                    Day {day.dayNumber}
                  </button>
                ))}
              </div>

              {/* Active day panel */}
              {currentDayData && (
                <div className={styles.dayPanel}
                  id={`day-panel-${activeDay}`}
                  role="tabpanel"
                  aria-labelledby={`day-tab-${activeDay}`}>
                  <div className={styles.dayPanelHeader}>
                    <h3 className={styles.dayPanelTitle}>{currentDayData.title}</h3>
                    {currentDayData.notes && (
                      <p className={styles.dayPanelNotes}>{currentDayData.notes}</p>
                    )}
                  </div>

                  <div className={styles.timeline}>
                    {currentDayData.activities.map((act, i) => (
                      <div key={act.id ?? i} className={styles.timelineRow}>
                        <div className={styles.timelineSide}>
                          <span className={styles.timelineTime}>{act.time}</span>
                          <div className={styles.timelineDot}
                            style={{ background: CAT_COLORS[act.category] ?? '#4b8ef1' }} />
                          {i < currentDayData.activities.length - 1 && (
                            <div className={styles.timelineLine} />
                          )}
                        </div>
                        <div className={styles.timelineCard}>
                          <div className={styles.timelineCardTop}>
                            <div className={styles.timelineCardLeft}>
                              <span className={styles.actCatIcon}>
                                {CAT_ICONS[act.category] ?? '📌'}
                              </span>
                              <span className={styles.actTitle}>{act.title}</span>
                            </div>
                            {act.cost > 0 && (
                              <span className={styles.actCost}>{fmtBudget(act.cost)}</span>
                            )}
                          </div>
                          {act.description && (
                            <p className={styles.actDesc}>{act.description}</p>
                          )}
                          <span className={styles.actCatChip}
                            style={{
                              background: (CAT_COLORS[act.category] ?? '#4b8ef1') + '1a',
                              color: CAT_COLORS[act.category] ?? '#4b8ef1',
                            }}>
                            {act.category}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Day nav arrows */}
                  <div className={styles.dayNav}>
                    <button className={styles.dayNavBtn}
                      disabled={activeDay === 0}
                      onClick={() => setActiveDay(d => d - 1)}
                      aria-label="Previous day">
                      ← Prev day
                    </button>
                    <span className={styles.dayNavLabel}>
                      {activeDay + 1} / {planData.days.length}
                    </span>
                    <button className={styles.dayNavBtn}
                      disabled={activeDay === planData.days.length - 1}
                      onClick={() => setActiveDay(d => d + 1)}
                      aria-label="Next day">
                      Next day →
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Food Recommendations */}
          {planData.foodRecommendations && planData.foodRecommendations.length > 0 && (
            <section className={styles.resultSection}>
              <h2 className={styles.resultSectionTitle}>
                <span className={styles.sectionIcon}>🍽</span>
                Food recommendations
              </h2>
              <div className={styles.foodGrid}>
                {planData.foodRecommendations.map((item, i) => (
                  <div key={i} className={styles.foodChip}>
                    <span className={styles.foodChipDot} aria-hidden="true">●</span>
                    {item}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Packing highlights */}
          {planData.packingHighlights && planData.packingHighlights.length > 0 && (
            <section className={styles.resultSection}>
              <h2 className={styles.resultSectionTitle}>
                <span className={styles.sectionIcon}>🎒</span>
                Packing essentials
              </h2>
              <div className={styles.packingGrid}>
                {planData.packingHighlights.map((item) => (
                  <div key={item} className={styles.packingChip}>{item}</div>
                ))}
              </div>
            </section>
          )}

          {/* Safety tips */}
          {planData.safetyTips && planData.safetyTips.length > 0 && (
            <section className={styles.resultSection}>
              <h2 className={styles.resultSectionTitle}>
                <span className={styles.sectionIcon}>🛡</span>
                Safety tips
              </h2>
              <div className={styles.safetyList}>
                {planData.safetyTips.map((tip, i) => (
                  <div key={i} className={styles.safetyItem}>
                    <span className={styles.safetyCheck} aria-hidden="true">✓</span>
                    <span className={styles.safetyText}>{tip}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Map preview placeholder */}
          <section className={styles.resultSection}>
            <h2 className={styles.resultSectionTitle}>
              <span className={styles.sectionIcon}>🗺</span>
              Map preview
            </h2>
            <div className={styles.mapPlaceholder}>
              <div className={styles.mapBlur} aria-hidden="true">
                <svg width="100%" height="100%" viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="400" height="200" fill="url(#mapGrad)"/>
                  <defs>
                    <linearGradient id="mapGrad" x1="0" y1="0" x2="400" y2="200" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#111e35"/>
                      <stop offset="1" stopColor="#0c1528"/>
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  {[40,80,120,160].map(y => <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>)}
                  {[50,100,150,200,250,300,350].map(x => <line key={x} x1={x} y1="0" x2={x} y2="200" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>)}
                  {/* Route curve */}
                  <path d="M60 140 Q120 60 200 80 Q280 100 340 60" stroke="#387cf6" strokeWidth="2" strokeDasharray="6 4" fill="none" opacity="0.5"/>
                  {/* Pins */}
                  <circle cx="60" cy="140" r="6" fill="#387cf6" opacity="0.8"/>
                  <circle cx="340" cy="60" r="6" fill="#0dcfaa" opacity="0.8"/>
                  <circle cx="60" cy="140" r="10" fill="#387cf6" opacity="0.2"/>
                  <circle cx="340" cy="60" r="10" fill="#0dcfaa" opacity="0.2"/>
                </svg>
              </div>
              <div className={styles.mapOverlay}>
                <div className={styles.mapLock} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="9" width="14" height="10" rx="2" stroke="#4b8ef1" strokeWidth="1.5"/>
                    <path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="#4b8ef1" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className={styles.mapLockLabel}>Interactive map available after sign up</p>
                <button className={styles.mapUnlockBtn} onClick={() => router.push('/auth/phone')}>
                  Unlock map
                </button>
              </div>
            </div>
          </section>

          {/* Locked premium actions */}
          <section className={styles.lockedSection}>
            <div className={styles.lockedBadge} aria-hidden="true">🔒</div>
            <p className={styles.lockedTitle}>Unlock premium actions</p>
            <p className={styles.lockedSub}>Create a free account to access everything</p>
            <div className={styles.lockedActions}>
              {['Export PDF', 'Save trip', 'Edit itinerary', 'Share with friends', 'Book hotels', 'Book flights'].map((a) => (
                <div
                  key={a}
                  className={styles.lockedChip}
                  role="button"
                  tabIndex={0}
                  aria-label={`${a} — sign in to unlock`}
                  onClick={() => {
                    ClientAnalytics.track('demo_action_locked', { action: a });
                    setStep('signup');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && setStep('signup')}
                >
                  {a}
                </div>
              ))}
            </div>
          </section>

          {/* Conversion CTA */}
          <div className={styles.conversionCta}>
            <div className={styles.conversionCtaInner}>
              <span className={styles.conversionEyebrow}>✦ Your trip is ready</span>
              <h3 className={styles.conversionTitle}>Save this plan to your account</h3>
              <p className={styles.conversionSub}>Free account. No credit card. Takes 30 seconds.</p>
              <ul className={styles.conversionBenefits}>
                <li><span>✓</span> Save &amp; edit this itinerary</li>
                <li><span>✓</span> Unlimited trip generation</li>
                <li><span>✓</span> Budget tracker &amp; expense log</li>
                <li><span>✓</span> Share with travel partners</li>
                <li><span>✓</span> Hotel &amp; flight suggestions</li>
              </ul>
              <button className={`${styles.btnPrimary} ${styles.btnFullWidth}`}
                onClick={() => router.push('/auth/phone')}>
                Continue with phone number →
              </button>
              <button className={styles.btnGhost}
                onClick={() => { setStep('landing'); window.scrollTo({ top: 0 }); }}>
                Generate another trip
              </button>
              {remaining !== null && remaining > 0 && (
                <p className={styles.remainingNote}>{remaining} free generation{remaining !== 1 ? 's' : ''} left today</p>
              )}
            </div>
          </div>

        </div>
        <Footer />
      </div>
    );
  }

  // ── Sign-up modal (triggered from locked actions) ────────
  if (step === 'signup') {
    return (
      <div className={styles.page}>
        <Nav onSignup={() => router.push('/auth/phone')} />
        <div className={styles.signupModal}>
          <button className={styles.signupBack} onClick={() => setStep('result')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 4L5 8l5 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to plan
          </button>
          <div className={styles.signupModalStar} aria-hidden="true">✦</div>
          <h2 className={styles.signupModalTitle}>Save your trip plan</h2>
          <p className={styles.signupModalSub}>Your AI-generated itinerary is waiting. Create a free account to save, edit, and share it.</p>
          <div className={styles.signupBenefitsList}>
            {[
              { icon: '💾', text: 'Save & edit trips' },
              { icon: '♾️', text: 'Unlimited AI plans' },
              { icon: '💰', text: 'Budget tracker' },
              { icon: '👥', text: 'Collaborate & share' },
              { icon: '🏨', text: 'Book hotels & flights' },
            ].map((b) => (
              <div key={b.text} className={styles.signupBenefitRow}>
                <span className={styles.signupBenefitIcon}>{b.icon}</span>
                <span className={styles.signupBenefitText}>{b.text}</span>
                <span className={styles.signupBenefitCheck} aria-hidden="true">✓</span>
              </div>
            ))}
          </div>
          <button className={`${styles.btnPrimary} ${styles.btnFullWidth}`}
            onClick={() => router.push('/auth/phone')}>
            Continue with phone number →
          </button>
          <button className={styles.btnGhost} style={{ width: '100%', marginTop: 8 }}
            onClick={() => setStep('result')}>
            Continue browsing plan
          </button>
        </div>
      </div>
    );
  }

  // ── Landing page (default) ───────────────────────────────
  return (
    <div className={styles.page}>
      <Nav onSignup={() => router.push('/auth/phone')} />

      {/* ── Offline banner ───────────────────────────────── */}
      {isOffline && (
        <div className={styles.offlineBanner} role="status" aria-live="polite">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M10.7 4.3A6.5 6.5 0 0 1 13 7M1 7a6.5 6.5 0 0 1 2.3-2.7M4.5 9.5A3.5 3.5 0 0 1 7 8.5c.9 0 1.7.3 2.3.8M7 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          You&apos;re offline — connect to generate a trip plan
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <span className={styles.heroEyebrow}>✦ AI-powered · Free to try · No signup</span>
          <h1 className={styles.heroHeadline}>
            Plan your perfect trip<br />
            <span className={styles.heroAccent}>in seconds</span>
          </h1>
          <p className={styles.heroSub}>
            Generate personalised travel itineraries using AI.
            Day-by-day plans, budget breakdowns, local recommendations — instantly.
          </p>

          {/* Feature pills */}
          <div className={styles.featurePills}>
            {FEATURE_PILLS.map((f) => (
              <span key={f.label} className={styles.featurePill}>
                <span aria-hidden="true">{f.icon}</span>
                {f.label}
              </span>
            ))}
          </div>

          <button className={`${styles.btnPrimary} ${styles.heroCtaBtn}`}
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Generate my trip ✦
          </button>

          <div className={styles.heroStats}>
            <div className={styles.heroStat}><strong>12,000+</strong> trips generated</div>
            <div className={styles.heroStatDiv} />
            <div className={styles.heroStat}><strong>200+</strong> destinations</div>
            <div className={styles.heroStatDiv} />
            <div className={styles.heroStat}><strong>Free</strong> — no card needed</div>
          </div>
        </div>

        {/* Preview card */}
        <div className={styles.heroRight} aria-hidden="true">
          <div className={styles.heroPreviewCard}>
            <div className={styles.heroPreviewHeader}>
              <div>
                <p className={styles.heroPreviewDest}>Goa</p>
                <p className={styles.heroPreviewMeta}>5 days · ₹30,000</p>
              </div>
              <span className={styles.heroPreviewBadge}>AI-generated ✦</span>
            </div>
            <div className={styles.heroPreviewDays}>
              {[
                { day: 'Day 1', act: 'Arrive · Beach resort check-in', time: '2 PM', cat: 'stay' },
                { day: 'Day 2', act: 'Baga Beach · Water sports', time: '9 AM', cat: 'activity' },
                { day: 'Day 3', act: 'Old Goa churches · Spice farm', time: '8 AM', cat: 'activity' },
              ].map((r) => (
                <div key={r.day} className={styles.heroPreviewRow}>
                  <span className={styles.heroPreviewDayLabel}>{r.day}</span>
                  <span className={styles.heroPreviewAct}>{r.act}</span>
                  <span className={styles.heroPreviewTime}>{r.time}</span>
                </div>
              ))}
              <div className={styles.heroPreviewMore}>+ 4 more days planned</div>
            </div>
            <div className={styles.heroPreviewBudget}>
              <div className={styles.heroPreviewBudgetRow}>
                <span>Accommodation</span><span>₹12K</span>
              </div>
              <div className={styles.heroPreviewBudgetRow}>
                <span>Food &amp; dining</span><span>₹8K</span>
              </div>
              <div className={styles.heroPreviewBudgetRow}>
                <span>Activities</span><span>₹6K</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Popular presets ────────────────────────────────── */}
      <section className={styles.presetsSection}>
        <div className={styles.container}>
          <p className={styles.presetsLabel}>✦ Popular routes — click to auto-fill</p>
          <div className={styles.presetRow}>
            {POPULAR.map((p) => (
              <button key={`${p.from}-${p.to}`} className={styles.presetChip}
                onClick={() => applyPreset(p)}>
                <span className={styles.presetRoute}>{p.from} → {p.to}</span>
                <span className={styles.presetMeta}>{p.days}d · {fmtBudget(p.budget)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trip planner form ─────────────────────────────── */}
      <section className={styles.formSection} ref={(el) => { formRef.current = el; }} id="planner">
        <div className={styles.container}>
          <div className={styles.formCard}>
            <div className={styles.formCardHeader}>
              <h2 className={styles.formTitle}>Build your trip</h2>
              <p className={styles.formSubtitle}>Takes 30 seconds · Generates in under a minute</p>
            </div>
            {error && (
              <div className={styles.errorBanner} role="alert">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 5v4M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div className={styles.errorBannerBody}>
                  <span>{error}</span>
                  {errorType !== 'network' && (
                    <button className={styles.errorRetryBtn} onClick={handleGenerate}
                      disabled={interests.length === 0} aria-label="Retry trip generation">
                      Try again →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* From / To */}
            <div className={styles.routeRow}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="from-city">Travelling from</label>
                <select id="from-city" className={styles.select}
                  value={fromCity} onChange={(e) => setFromCity(e.target.value)}>
                  {CITIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className={styles.routeArrowWrap} aria-hidden="true">
                <div className={styles.routeArrow}>→</div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="to-city">Destination</label>
                <select id="to-city" className={styles.select}
                  value={toCity} onChange={(e) => setToCity(e.target.value)}>
                  {DESTINATIONS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {/* Duration */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Duration</label>
              <div className={styles.chipRow}>
                {DAY_OPTIONS.map((d) => (
                  <button key={d} type="button"
                    className={`${styles.dayChip} ${days === d ? styles.dayChipActive : ''}`}
                    onClick={() => setDays(d)} aria-pressed={days === d}>
                    {d} days
                  </button>
                ))}
              </div>
            </div>

            {/* Budget */}
            <div className={styles.fieldGroup}>
              <div className={styles.budgetHeader}>
                <label className={styles.fieldLabel} htmlFor="budget-slider">Total budget</label>
                <span className={styles.budgetDisplay}>{fmtBudget(budget)}</span>
              </div>
              <div className={styles.sliderWrap}>
                <div className={styles.sliderTrack}>
                  <div className={styles.sliderFill} style={{ width: `${sliderPct}%` }} />
                  <input id="budget-slider" type="range" className={styles.sliderRange}
                    min={5000} max={100000} step={1000} value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    aria-valuemin={5000} aria-valuemax={100000}
                    aria-valuenow={budget} aria-valuetext={fmtBudget(budget)} />
                </div>
                <div className={styles.sliderLabels}><span>₹5K</span><span>₹1L</span></div>
              </div>
            </div>

            {/* Interests */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                What do you enjoy?
                {interests.length === 0 && (
                  <span className={styles.interestHint}> — pick at least one</span>
                )}
              </label>
              <div className={styles.interestGrid}>
                {INTERESTS.map((i) => (
                  <button key={i} type="button"
                    className={`${styles.interestChip} ${interests.includes(i) ? styles.interestActive : ''}`}
                    onClick={() => toggleInterest(i)} aria-pressed={interests.includes(i)}>
                    {i}
                  </button>
                ))}
              </div>
            </div>

            <button
              className={`${styles.btnPrimary} ${styles.btnFullWidth} ${styles.generateBtn}`}
              onClick={handleGenerate}
              disabled={interests.length === 0 || isOffline}
              aria-disabled={interests.length === 0 || isOffline}>
              {isOffline ? '📡 Connect to internet first' : '✦ Generate my trip plan'}
            </button>
            <p className={styles.formNote}>Free · No signup required · 3 plans per day</p>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className={styles.howSection}>
        <div className={styles.container}>
          <div className={styles.howHeader}>
            <h2 className={styles.sectionHeading}>How it works</h2>
            <p className={styles.sectionSub}>From idea to itinerary in under 60 seconds</p>
          </div>
          <div className={styles.howGrid}>
            {[
              { step: '1', title: 'Describe your trip', body: 'Set destination, duration, budget, and travel style. Takes 30 seconds.' },
              { step: '2', title: 'AI builds your plan', body: 'Our AI researches attractions, costs, and timings — then assembles a full itinerary.' },
              { step: '3', title: 'Review & customise', body: 'Browse the day-by-day plan. Create a free account to save, edit, and share.' },
            ].map((h) => (
              <div key={h.step} className={styles.howCard}>
                <div className={styles.howStep}>{h.step}</div>
                <h3 className={styles.howTitle}>{h.title}</h3>
                <p className={styles.howBody}>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reviews ──────────────────────────────────────── */}
      <section className={styles.reviewsSection}>
        <div className={styles.container}>
          <h2 className={styles.sectionHeading}>What travellers say</h2>
          <div className={styles.reviewsGrid}>
            {REVIEWS.map((r) => (
              <div key={r.name} className={styles.reviewCard}>
                <div className={styles.reviewTop}>
                  <div className={styles.reviewAvatar}>{r.avatar}</div>
                  <div>
                    <p className={styles.reviewName}>{r.name}</p>
                    <p className={styles.reviewCity}>{r.city}</p>
                  </div>
                  <div className={styles.reviewStars} aria-label={`${r.rating} stars`}>
                    {'★'.repeat(r.rating)}
                  </div>
                </div>
                <p className={styles.reviewText}>&ldquo;{r.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section className={styles.faqSection}>
        <div className={styles.container}>
          <h2 className={styles.sectionHeading}>Common questions</h2>
          <div className={styles.faqList}>
            {FAQ.map((f, i) => (
              <div key={f.q} className={styles.faqItem}>
                <button className={styles.faqQ}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  aria-controls={`faq-${i}`}>
                  <span>{f.q}</span>
                  <span className={`${styles.faqChev} ${openFaq === i ? styles.faqChevOpen : ''}`}
                    aria-hidden="true">▾</span>
                </button>
                {openFaq === i && (
                  <p id={`faq-${i}`} className={styles.faqA}>{f.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────── */}
      <section className={styles.bottomCta}>
        <div className={styles.container}>
          <span className={styles.bottomCtaEyebrow}>✦ Free to try</span>
          <h2 className={styles.bottomCtaTitle}>Ready to plan your next trip?</h2>
          <p className={styles.bottomCtaSub}>No credit card. No signup. 3 plans per day.</p>
          <button className={styles.btnPrimary}
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Generate free trip ✦
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────

function Nav({ onSignup }: { onSignup: () => void }) {
  return (
    <nav className={styles.nav} role="navigation" aria-label="Main navigation">
      <Link href="/" className={styles.navLogo}>
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="8" r="4" stroke="#387cf6" strokeWidth="1.8"/>
          <path d="M11 18S4 13 4 8a7 7 0 0 1 14 0c0 5-7 10-7 10z" stroke="#387cf6" strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
        PlanBuddy
      </Link>
      <button className={styles.navSignup} onClick={onSignup}>
        Sign up free
      </button>
    </nav>
  );
}

// ── Footer ───────────────────────────────────────────────────

function Footer() {
  return (
    <footer className={styles.footer} role="contentinfo">
      <p className={styles.footerText}>© 2026 PlanBuddy · AI travel planning for India</p>
    </footer>
  );
}
