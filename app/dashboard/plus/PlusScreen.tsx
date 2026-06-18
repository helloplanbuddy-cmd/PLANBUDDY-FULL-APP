'use client';
// ============================================================
// PlusScreen v3 — Real AI trip planning via /api/plan
// Streams itinerary from Claude, saves to Zustand store
// ============================================================

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
// P2 FIX: useAuthGuard removed — layout/dashboard handles auth
import { useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';
import { useAppStore } from '@/store/appStore';
import BottomNav from '@/app/components/BottomNav';
import PrimaryButton from '@/app/components/PrimaryButton';
import styles from './plus.module.css';
import type { Trip } from '@/store/appStore';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import { PlanService } from '@/src/services/plan.service';

const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Kochi'];
const DESTINATIONS = ['Goa', 'Manali', 'Kerala', 'Rajasthan', 'Rishikesh', 'Andaman', 'Ladakh', 'Hampi', 'Ooty', 'Coorg'];
const DAY_OPTIONS = [3, 5, 7, 10, 14];
const INTERESTS = ['🏖 Beach', '🏔 Mountains', '🏛 Heritage', '🌿 Nature', '🎭 Culture', '🍽 Food', '🧘 Wellness', '🤿 Adventure', '🦁 Wildlife', '🛍 Shopping'];

function fmtBudget(val: number): string {
  if (val >= 100000) return '₹1L';
  if (val >= 1000) return `₹${Math.round(val / 1000)}K`;
  return `₹${val}`;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

type Step = 'form' | 'generating' | 'result';

const GEN_STEPS = [
  'Analysing your preferences',
  'Finding the best routes',
  'Estimating costs',
  'Building your itinerary',
];

export default function PlusScreen() {
  
  const router = useRouter();
  const addTrip = useAppStore((s) => s.addTrip);
  const setActiveTrip = useAppStore((s) => s.setActiveTrip);

  useVirtualKeyboard();

  const [step, setStep] = useState<Step>('form');
  const [fromCity, setFromCity] = useState('Mumbai');
  const [toCity, setToCity] = useState('Goa');
  const [budget, setBudget] = useState(20000);
  const [days, setDays] = useState(5);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['🏖 Beach']);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [genPct, setGenPct] = useState(0);
  const [generatedTrip, setGeneratedTrip] = useState<Trip | null>(null);
  const [rawJSON, setRawJSON] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sliderPct = ((budget - 5000) / (100000 - 5000)) * 100;

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const handleGenerate = useCallback(async () => {
    setStep('generating');
    setGenStepIdx(0);
    setGenPct(0);
    setError(null);
    setRawJSON('');

    // Fake step progress while streaming
    const stepInterval = setInterval(() => {
      setGenStepIdx((i) => Math.min(i + 1, GEN_STEPS.length - 1));
      setGenPct((p) => Math.min(p + 25, 90));
    }, 1800);

    abortRef.current = new AbortController();

    try {
      // Fix #6: 60-second hard timeout combined with user abort signal
      const timeoutSignal = AbortSignal.timeout(60_000);
      const userAbortSignal = abortRef.current!.signal;
      // AbortSignal.any() supported in modern browsers/Node 20+; graceful fallback
      const combinedSignal: AbortSignal = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any
        ? (AbortSignal as { any: (signals: AbortSignal[]) => AbortSignal }).any([userAbortSignal, timeoutSignal])
        : userAbortSignal;

      const res = await PlanService.generatePlan(
        {
          from: fromCity,
          to: toCity,
          days,
          budget,
          interests: selectedInterests,
        },
        combinedSignal,
      );

      if (!res.ok || !res.body) {
        if (!res.ok && res.status === 408) throw new Error('Request timed out. Please try again.');
        throw new Error('Generation failed. Please try again.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) accumulated += parsed.text;
          } catch { /* partial chunk */ }
        }
      }

      // Parse the completed JSON
      const clean = accumulated.replace(/```json|```/g, '').trim();
      setRawJSON(clean);
      const planData = JSON.parse(clean);

      // Build Trip object
      const trip: Trip = {
        id: uid(),
        title: planData.title || `${toCity} Trip`,
        from: fromCity,
        to: toCity,
        startDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        endDate: new Date(Date.now() + (7 + days) * 86400000).toISOString().split('T')[0],
        budget,
        status: 'planned',
        interests: selectedInterests,
        days: planData.days || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Fix #7: track trip_created
      ClientAnalytics.tripCreated(toCity, days);
      setGeneratedTrip(trip);
      clearInterval(stepInterval);
      setGenPct(100);
      setTimeout(() => setStep('result'), 500);
    } catch (err) {
      clearInterval(stepInterval);
      if ((err as Error).name === 'AbortError') return; // user cancelled
      const isTimeout = (err as Error).name === 'TimeoutError';
      console.error('[PlusScreen generate]', err);
      // Fix #6: user-friendly error with retry guidance
      setError(isTimeout
        ? 'Trip generation timed out. Check your connection and try again.'
        : ((err as Error).message || 'Could not generate your plan. Please try again.'));
      setStep('form');
    }
  }, [fromCity, toCity, days, budget, selectedInterests]);

  const handleSaveTrip = useCallback(() => {
    if (!generatedTrip) return;
    addTrip(generatedTrip);
    setActiveTrip(generatedTrip.id);
    // Fix #7: track trip_saved
    ClientAnalytics.track('trip_saved', { destination: generatedTrip.to, days: generatedTrip.days?.length });
    router.push('/dashboard');
  }, [generatedTrip, addTrip, setActiveTrip, router]);

  // ── No auth guard needed — layout handles it ──────────
  // ── Generating screen ──────────────────────────────────
  if (step === 'generating') {
    return (
      <div className={styles.shell}>
        <div className={styles.genWrap}>
          <div className={styles.genOrb} aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="#387cf6" strokeWidth="2" strokeDasharray="5 4"
                style={{ animation: 'spin 3s linear infinite', transformOrigin: 'center' }}/>
              <path d="M16 24l6 6 10-12" stroke="#387cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
            </svg>
          </div>

          <div className={styles.genTitle}>Building your plan…</div>
          <div className={styles.genSub}>{fromCity} → {toCity} · {days} days · {fmtBudget(budget)}</div>

          <div className={styles.genBar}>
            <div className={styles.genBarFill} style={{ width: `${genPct}%` }} />
          </div>

          <div className={styles.genSteps}>
            {GEN_STEPS.map((s, i) => (
              <div key={s} className={`${styles.genStep} ${i <= genStepIdx ? styles.genStepActive : ''}`}>
                <span className={styles.genStepDot}>{i < genStepIdx ? '✓' : i === genStepIdx ? '…' : ''}</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Result screen ──────────────────────────────────────
  if (step === 'result' && generatedTrip) {
    let planData: { summary?: string; budgetBreakdown?: Record<string, number>; bestTimeToVisit?: string; weatherNote?: string; totalEstimatedCost?: number; days?: { dayNumber: number; title: string; activities: { time: string; title: string; cost: number; category: string }[] }[] } = {};
    try { planData = JSON.parse(rawJSON); } catch { /* use generatedTrip fallback */ }

    return (
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <button className={styles.ibtn} onClick={() => setStep('form')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <h1 className={styles.topbarTitle}>Your Plan</h1>
          <div style={{ width: 36 }} />
        </header>

        <div className={styles.resultScroll}>
          {/* Hero */}
          <div className={styles.resultHero}>
            <div className={styles.resultDest}>{generatedTrip.to}</div>
            <div className={styles.resultMeta}>{generatedTrip.from} · {days} days · {fmtBudget(budget)}</div>
            {planData.summary && <p className={styles.resultSummary}>{planData.summary}</p>}
          </div>

          {/* Budget breakdown */}
          {planData.budgetBreakdown && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Budget breakdown</div>
              {Object.entries(planData.budgetBreakdown).map(([cat, amt]) => (
                <div key={cat} className={styles.budgetRow}>
                  <span className={styles.budgetCat}>{cat}</span>
                  <span className={styles.budgetAmt}>{fmtBudget(amt as number)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Itinerary days */}
          {generatedTrip.days.map((day) => (
            <div key={day.dayNumber} className={styles.section}>
              <div className={styles.sectionTitle}>Day {day.dayNumber} — {day.title}</div>
              {day.activities.map((act) => (
                <div key={act.id} className={styles.actRow}>
                  <div className={styles.actTime}>{act.time}</div>
                  <div className={styles.actInfo}>
                    <div className={styles.actTitle}>{act.title}</div>
                    {act.description && <div className={styles.actDesc}>{act.description}</div>}
                  </div>
                  {act.cost > 0 && (
                    <div className={styles.actCost}>{fmtBudget(act.cost)}</div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Info chips */}
          {(planData.bestTimeToVisit || planData.weatherNote) && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Good to know</div>
              {planData.bestTimeToVisit && (
                <div className={styles.infoChip}>📅 Best time: {planData.bestTimeToVisit}</div>
              )}
              {planData.weatherNote && (
                <div className={styles.infoChip}>🌡 {planData.weatherNote}</div>
              )}
            </div>
          )}

          <div className={styles.resultActions}>
            <PrimaryButton onClick={handleSaveTrip}>
              Save this trip
            </PrimaryButton>
            <PrimaryButton variant="outline" onClick={() => setStep('form')}>
              Regenerate plan
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  // ── Form screen ────────────────────────────────────────
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <h1 className={styles.topbarTitle}>Plan a trip</h1>
        <button className={styles.ibtn} aria-label="Close" type="button" onClick={() => router.push('/dashboard')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      <div className={styles.formScroll}>
        {error && (
          <div className={styles.errorBanner} role="alert">{error}</div>
        )}

        {/* From / To */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="from-select">From</label>
          <select id="from-select" className={styles.select} value={fromCity} onChange={(e) => setFromCity(e.target.value)}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="to-select">To</label>
          <select id="to-select" className={styles.select} value={toCity} onChange={(e) => setToCity(e.target.value)}>
            {DESTINATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Days */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Duration</label>
          <div className={styles.chipRow}>
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.dayChip} ${days === d ? styles.dayChipActive : ''}`}
                onClick={() => setDays(d)}
                aria-pressed={days === d}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Budget */}
        <div className={styles.fieldGroup}>
          <div className={styles.budgetHeader}>
            <label className={styles.fieldLabel} htmlFor="budget-slider">Budget</label>
            <span className={styles.budgetDisplay}>{fmtBudget(budget)}</span>
          </div>
          <div className={styles.sliderWrap}>
            <div className={styles.sliderFill} style={{ width: `${sliderPct}%` }} />
            <input
              id="budget-slider"
              type="range"
              className={styles.slider}
              min={5000}
              max={100000}
              step={1000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              aria-valuemin={5000}
              aria-valuemax={100000}
              aria-valuenow={budget}
              aria-valuetext={fmtBudget(budget)}
            />
          </div>
          <div className={styles.sliderLabels}>
            <span>₹5K</span><span>₹1L</span>
          </div>
        </div>

        {/* Interests */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Interests</label>
          <div className={styles.interestGrid}>
            {INTERESTS.map((interest) => (
              <button
                key={interest}
                type="button"
                className={`${styles.interestChip} ${selectedInterests.includes(interest) ? styles.interestActive : ''}`}
                onClick={() => toggleInterest(interest)}
                aria-pressed={selectedInterests.includes(interest)}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formFooter}>
          <PrimaryButton
            onClick={handleGenerate}
            disabled={selectedInterests.length === 0}
          >
            ✨ Generate plan
          </PrimaryButton>
        </div>
      </div>

      <BottomNav active="plus" />
    </div>
  );
}
