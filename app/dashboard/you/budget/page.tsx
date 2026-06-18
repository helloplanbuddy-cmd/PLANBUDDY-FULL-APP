'use client';
// ============================================================
// Budget Tracker — PHASE 1 UPGRADE
// Was: 100% hardcoded demo values, Add button did nothing
// Now: Live data from Zustand store, real expense logging,
//      persistent storage, burn-rate, overspend alerts,
//      category breakdown from actual transactions
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import type { Expense } from '@/store/appStore';
import BottomNav from '@/app/components/BottomNav';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import styles from './budget.module.css';

const CATEGORY_META: Record<
  Expense['category'],
  { name: string; icon: string; color: string }
> = {
  travel:    { name: 'Transport',   icon: '✈️',  color: 'var(--blue)'   },
  stay:      { name: 'Hotels',      icon: '🏨',  color: 'var(--purple)' },
  food:      { name: 'Food',        icon: '🍽',  color: 'var(--amber)'  },
  activity:  { name: 'Activities',  icon: '🎭',  color: 'var(--teal)'   },
  shopping:  { name: 'Shopping',    icon: '🛍',  color: 'var(--red)'    },
  misc:      { name: 'Misc',        icon: '📦',  color: 'var(--fg2)'    },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_META) as Expense['category'][];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

function healthLabel(pct: number): { label: string; color: string } {
  if (pct < 60) return { label: 'On track',      color: 'var(--green)'  };
  if (pct < 85) return { label: 'Watch spend',   color: 'var(--amber)'  };
  return             { label: 'Over budget',     color: 'var(--red)'    };
}

export default function BudgetPage() {
  // Auth is guarded exclusively by app/dashboard/layout.tsx (single source of truth).
  const router = useRouter();

  const activeTripId  = useAppStore((s) => s.activeTripId);
  // Fix #4: only show current user's data
  const trips         = useAppStore((s) => s.getUserTrips());
  const expenses      = useAppStore((s) => s.getUserExpenses());
  const addExpense    = useAppStore((s) => s.addExpense);
  const deleteExpense = useAppStore((s) => s.deleteExpense);

  const [expAmt,  setExpAmt]  = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expCat,  setExpCat]  = useState<Expense['category']>('food');
  const [showForm, setShowForm] = useState(false);
  const [error, setError]     = useState('');

  // ── Active trip resolution ─────────────────────────────
  // Use first active trip if none selected, else first trip
  const activeTrip = useMemo(() => {
    if (activeTripId) return trips.find((t) => t.id === activeTripId);
    return trips.find((t) => t.status === 'active') ?? trips[0];
  }, [activeTripId, trips]);

  // ── Budget calculations ────────────────────────────────
  const tripExpenses = useMemo(
    () => expenses.filter((e) => e.tripId === (activeTrip?.id ?? '')),
    [expenses, activeTrip]
  );

  const totalBudget = activeTrip?.budget ?? 0;

  const spent = useMemo(
    () => tripExpenses.reduce((s, e) => s + e.amount, 0),
    [tripExpenses]
  );

  const remaining = totalBudget - spent;
  const pct       = totalBudget > 0 ? Math.min(Math.round((spent / totalBudget) * 100), 100) : 0;
  const health    = healthLabel(pct);

  // Trip duration for burn-rate
  const daysTotal = activeTrip
    ? Math.max(
        1,
        Math.round(
          (new Date(activeTrip.endDate).getTime() - new Date(activeTrip.startDate).getTime()) /
            86_400_000
        )
      )
    : 1;

  const today      = new Date();
  const startDate  = activeTrip ? new Date(activeTrip.startDate) : today;
  const daysElapsed = Math.max(1, Math.ceil((today.getTime() - startDate.getTime()) / 86_400_000));
  const daysLeft    = Math.max(0, daysTotal - daysElapsed);
  const burnRate    = daysElapsed > 0 ? Math.round(spent / daysElapsed) : 0;
  const safePace    = daysLeft > 0 ? Math.round(remaining / daysLeft) : 0;

  // Category breakdown
  const catBreakdown = useMemo(() => {
    return CATEGORY_KEYS.map((cat) => {
      const catSpent = tripExpenses
        .filter((e) => e.category === cat)
        .reduce((s, e) => s + e.amount, 0);
      return { cat, spent: catSpent, ...CATEGORY_META[cat] };
    }).filter((c) => c.spent > 0 || totalBudget > 0);
  }, [tripExpenses, totalBudget]);

  // Recent expenses sorted newest-first
  const recentExpenses = useMemo(
    () => [...tripExpenses].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20),
    [tripExpenses]
  );

  // ── Add expense ───────────────────────────────────────
  const handleAdd = useCallback(() => {
    const amt = parseFloat(expAmt);
    if (!expDesc.trim()) { setError('Add a description'); return; }
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (!activeTrip)      { setError('No active trip selected'); return; }

    const expense: Expense = {
      id:        uid(),
      tripId:    activeTrip.id,
      amount:    amt,
      category:  expCat,
      note:      expDesc.trim(),
      date:      new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      synced:    false,
    };

    addExpense(expense);
    // Phase 2E: fire budget_created on new expense
    ClientAnalytics.track('budget_created', { category: expCat, amount: amt });
    setExpAmt('');
    setExpDesc('');
    setError('');
    setShowForm(false);
  }, [expAmt, expDesc, expCat, activeTrip, addExpense]);

  // ── No trips yet ──────────────────────────────────────
  if (!activeTrip) {
    return (
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <button className={styles.ibtn} type="button" aria-label="Back" onClick={() => router.push('/dashboard/you')}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
          <h1 className={styles.topbarTitle}>Budget Tracker</h1>
          <span />
        </header>
        <div className={styles.pageScroll} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--s12)', padding: 'var(--s40) var(--s20)' }}>
          <p style={{ fontSize: '2.5rem' }}>💰</p>
          <p style={{ color: 'var(--fg1)', fontWeight: 600 }}>No trips yet</p>
          <p style={{ color: 'var(--fg2)', textAlign: 'center', fontSize: '0.9rem' }}>Create a trip using the + tab to start tracking your budget.</p>
          <button className={styles.btnTeal} type="button" onClick={() => router.push('/dashboard/plus')}>Plan a Trip</button>
        </div>
        <BottomNav active="you" />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.ibtn} type="button" aria-label="Back" onClick={() => router.push('/dashboard/you')}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <h1 className={styles.topbarTitle}>Budget Tracker</h1>
        <button className={styles.ibtn} type="button" aria-label="Add expense" onClick={() => setShowForm((v) => !v)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </header>

      <div className={styles.pageScroll}>
        {/* Overspend alert */}
        {pct >= 85 && (
          <div style={{ margin: 'var(--s16) var(--s20) 0', padding: 'var(--s12) var(--s16)', background: 'var(--rdim)', borderRadius: 'var(--r12)', borderLeft: '3px solid var(--red)' }}>
            <p style={{ color: 'var(--red)', fontWeight: 600, fontSize: '0.85rem' }}>
              {pct >= 100 ? '⚠️ Over budget!' : '⚠️ Budget running low'}
            </p>
            <p style={{ color: 'var(--fg2)', fontSize: '0.8rem', marginTop: 4 }}>
              {pct >= 100
                ? `You've exceeded your ₹${totalBudget.toLocaleString('en-IN')} budget by ₹${Math.abs(remaining).toLocaleString('en-IN')}.`
                : `Only ₹${remaining.toLocaleString('en-IN')} left. Spend ₹${safePace.toLocaleString('en-IN')}/day to stay on track.`}
            </p>
          </div>
        )}

        {/* Hero */}
        <div className={styles.budgetHero}>
          <p className={styles.budgetTotalLabel}>Remaining Budget</p>
          <p className={styles.budgetTotalAmt} style={{ color: remaining < 0 ? 'var(--red)' : undefined }}>
            ₹{Math.abs(remaining).toLocaleString('en-IN')}{remaining < 0 ? ' over' : ''}
          </p>
          <p className={styles.budgetTotalSub}>
            of ₹{totalBudget.toLocaleString('en-IN')} · {activeTrip.to}
          </p>
          <div className={styles.healthBarWrap}>
            <div className={styles.healthBarLabels}>
              <span className={styles.healthSpentLbl}>Spent ₹{spent.toLocaleString('en-IN')}</span>
              <span className={styles.healthPct} style={{ color: health.color }}>{pct}%</span>
            </div>
            <div className={styles.healthBarTrack}>
              <div className={styles.healthBarFill} style={{ width: `${pct}%`, background: health.color }} />
            </div>
          </div>
        </div>

        {/* Burn rate card */}
        {daysElapsed > 0 && (
          <div className={styles.paceCard}>
            <div className={styles.paceIcon}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3v8M10 3L7 6M10 3l3 3" stroke={health.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 17a5 5 0 0 1 10 0" stroke={health.color} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className={styles.paceInfo}>
              <p className={styles.paceTitle} style={{ color: health.color }}>{health.label}</p>
              <p className={styles.paceSub}>
                Spending ₹{burnRate.toLocaleString('en-IN')}/day
                {safePace > 0 ? ` · safe pace ₹${safePace.toLocaleString('en-IN')}/day` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Inline add form */}
        {showForm && (
          <div className={styles.logForm} style={{ margin: 'var(--s16) var(--s20) 0' }}>
            <h3 className={styles.secTitle} style={{ marginBottom: 'var(--s12)' }}>Log Expense</h3>
            {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 8 }}>{error}</p>}
            <input
              type="text"
              className={styles.expInput}
              placeholder="Description (e.g. Rickshaw to temple)"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              aria-label="Expense description"
            />
            <div className={styles.logRow}>
              <input
                type="number" aria-label="Expense amount in rupees"
                className={styles.expAmtInput}
                placeholder="₹ Amount"
                value={expAmt}
                onChange={(e) => setExpAmt(e.target.value)}
                inputMode="decimal"
              />
              <select
                className={styles.expAmtInput}
                value={expCat}
                onChange={(e) => setExpCat(e.target.value as Expense['category'])}
                aria-label="Category"
                style={{ flex: 1 }}
              >
                {CATEGORY_KEYS.map((k) => (
                  <option key={k} value={k}>{CATEGORY_META[k].icon} {CATEGORY_META[k].name}</option>
                ))}
              </select>
              <button className={styles.btnTeal} type="button" onClick={handleAdd}>Add</button>
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {catBreakdown.some((c) => c.spent > 0) && (
          <>
            <div className={styles.secHdr}><h3 className={styles.secTitle}>By Category</h3></div>
            <div className={styles.expenseCats}>
              {catBreakdown.filter((c) => c.spent > 0).map((cat) => {
                const catPct = totalBudget > 0 ? Math.min(Math.round((cat.spent / totalBudget) * 100), 100) : 100;
                return (
                  <div key={cat.cat} className={styles.catItem}>
                    <div className={styles.catRow}>
                      <span className={styles.catEmoji}>{cat.icon}</span>
                      <p className={styles.catName}>{cat.name}</p>
                      <p className={styles.catAmt}>₹{cat.spent.toLocaleString('en-IN')}</p>
                      <p className={styles.catTotal}>{catPct}%</p>
                    </div>
                    <div className={styles.catBarTrack}>
                      <div className={styles.catBarFill} style={{ width: `${catPct}%`, background: cat.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Recent expenses */}
        <div className={styles.secHdr}>
          <h3 className={styles.secTitle}>Recent Expenses</h3>
          <span style={{ color: 'var(--fg2)', fontSize: '0.8rem' }}>{tripExpenses.length} total</span>
        </div>
        {recentExpenses.length === 0 ? (
          <div style={{ padding: 'var(--s20)', textAlign: 'center', color: 'var(--fg2)', fontSize: '0.9rem' }}>
            No expenses logged yet. Tap + to add one.
          </div>
        ) : (
          <div className={styles.expenseList}>
            {recentExpenses.map((exp) => (
              <div key={exp.id} className={styles.expenseItem}>
                <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{CATEGORY_META[exp.category]?.icon ?? '📦'}</span>
                <div className={styles.expInfo}>
                  <p className={styles.expDesc}>{exp.note}</p>
                  <p className={styles.expMeta}>{CATEGORY_META[exp.category]?.name} · {formatDate(exp.date)}</p>
                </div>
                <p className={styles.expAmt}>₹{exp.amount.toLocaleString('en-IN')}</p>
                <button
                  type="button"
                  aria-label="Delete expense"
                  onClick={() => { deleteExpense(exp.id); ClientAnalytics.track('budget_updated', { action: 'expense_deleted' }); }}
                  style={{ background: 'none', border: 'none', color: 'var(--fg3)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 'var(--s40)' }} />
      </div>
      <BottomNav active="you" />
    </div>
  );
}
