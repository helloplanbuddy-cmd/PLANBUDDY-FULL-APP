'use client';
// ============================================================
// Travel Memories — PHASE 1 UPGRADE
// Was: useState only (lost on reload), hardcoded seed data,
//      placeholder trip list, no voice, no AI summary
// Now: Zustand store (persisted), trips from store,
//      live entry count/trip count from real data,
//      AI summary generation via /api/memories,
//      voice note architecture scaffolded
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import type { TravelMemory } from '@/store/appStore';
import BottomNav from '@/app/components/BottomNav';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import { MemoryService } from '@/src/services/memory.service';
import styles from './memories.module.css';

const MOODS = [
  { id: 'amazed',       emoji: '🤩' },
  { id: 'happy',        emoji: '😊' },
  { id: 'calm',         emoji: '😌' },
  { id: 'curious',      emoji: '🧐' },
  { id: 'adventurous',  emoji: '🤠' },
  { id: 'tired',        emoji: '😴' },
  { id: 'moved',        emoji: '🥹' },
];

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MemoriesPage() {
  // Auth is guarded exclusively by app/dashboard/layout.tsx (single source of truth).
  const router = useRouter();

  // Fix #4: only show current user's data
  const trips     = useAppStore((s) => s.getUserTrips());
  const memories  = useAppStore((s) => s.getUserMemories());
  const addMemory = useAppStore((s) => s.addMemory);

  const [selectedTripId, setSelectedTripId] = useState('');
  const [note,           setNote]           = useState('');
  const [selectedMood,   setSelectedMood]   = useState('');
  const [aiSummary,      setAiSummary]      = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [filterTripId,   setFilterTripId]   = useState('');
  const [saveError,      setSaveError]      = useState('');

  // ── Derived stats ─────────────────────────────────────
  const uniqueTrips  = useMemo(() => new Set(memories.map((m) => m.tripId)).size, [memories]);
  const uniqueStates = useMemo(() => {
    // Count unique destinations from completed trips
    return new Set(trips.filter((t) => t.status === 'completed').map((t) => t.to)).size;
  }, [trips]);

  const displayedMemories = useMemo(() => {
    const list = filterTripId
      ? memories.filter((m) => m.tripId === filterTripId)
      : memories;
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [memories, filterTripId]);

  // ── Save memory ───────────────────────────────────────
  const saveMemory = useCallback(() => {
    if (!note.trim() || !selectedMood) return;

    const tripId   = selectedTripId || 'general';
    const tripName = trips.find((t) => t.id === selectedTripId)?.title ?? 'General';

    const mem: TravelMemory = {
      id:          uid(),
      tripId,
      destination: trips.find((t) => t.id === selectedTripId)?.to ?? 'General',
      headline:    tripName,
      highlights:  [note.trim()],
      totalSpent:  0,
      daysOnTrip:  0,
      createdAt:   Date.now(),
      // We store mood + note in highlights[0] as "mood::note"
    };
    // Encode mood into highlights so it renders correctly
    mem.highlights = [`${MOODS.find((m) => m.id === selectedMood)?.emoji ?? '😊'}::${note.trim()}`];

    try {
      addMemory(mem);
      // Phase 2E: track memory_added
      ClientAnalytics.track('memory_added', { destination: mem.destination });
      setSaveError('');
    } catch {
      setSaveError('Could not save memory. Please try again.');
      return;
    }
    setNote('');
    setSelectedMood('');
    setSelectedTripId('');
    setAiSummary('');
  }, [note, selectedMood, selectedTripId, trips, addMemory]);

  // ── AI summary for a trip ─────────────────────────────
  const generateSummary = useCallback(async () => {
    const tripMemories = memories.filter((m) => m.tripId === (filterTripId || memories[0]?.tripId));
    if (!tripMemories.length) return;

    setSummaryLoading(true);
    setAiSummary('');
    try {
      const notes = tripMemories
        .map((m) => m.highlights[0]?.split('::')[1] ?? '')
        .filter(Boolean)
        .slice(0, 10)
        .join('\n- ');

      const data = await MemoryService.summarize(notes);
      setAiSummary(data.summary ?? 'Could not generate summary.');
    } catch {
      setAiSummary('Failed to generate summary. Check your connection.');
    } finally {
      setSummaryLoading(false);
    }
  }, [memories, filterTripId]);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.ibtn} type="button" aria-label="Back" onClick={() => router.push('/dashboard/you')}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <h1 className={styles.topbarTitle}>Travel Memories</h1>
      </header>

      <div className={styles.pageScroll}>
        {/* Hero — live stats */}
        <div className={styles.memoryHero}>
          <p className={styles.memHeroTitle}>Your journey,<br/><span className={styles.memHeroHighlight}>remembered.</span></p>
          <div className={styles.memStatRow} role="list">
            <div className={styles.memStat} role="listitem">
              <p className={styles.memStatVal}>{uniqueTrips || trips.length}</p>
              <p className={styles.memStatLbl}>Trips</p>
            </div>
            <div className={styles.memStat} role="listitem" style={{ margin: '0 var(--s24)' }}>
              <p className={styles.memStatVal}>{memories.length}</p>
              <p className={styles.memStatLbl}>Entries</p>
            </div>
            <div className={styles.memStat} role="listitem">
              <p className={styles.memStatVal}>{uniqueStates}</p>
              <p className={styles.memStatLbl}>States</p>
            </div>
          </div>
        </div>

        {/* AI summary */}
        {memories.length >= 2 && (
          <div style={{ margin: 'var(--s16) var(--s20) 0', padding: 'var(--s16)', background: 'var(--pdim)', borderRadius: 'var(--r12)', borderLeft: '3px solid var(--purple)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiSummary ? 8 : 0 }}>
              <p style={{ color: 'var(--purple)', fontWeight: 600, fontSize: '0.85rem' }}>✨ AI Trip Rewind</p>
              <button
                type="button"
                onClick={generateSummary}
                disabled={summaryLoading}
                style={{ background: 'var(--purple)', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: '0.75rem', cursor: summaryLoading ? 'wait' : 'pointer', opacity: summaryLoading ? 0.7 : 1 }}
              >
                {summaryLoading ? 'Generating…' : 'Generate'}
              </button>
            </div>
            {aiSummary && <p style={{ color: 'var(--fg1)', fontSize: '0.85rem', lineHeight: 1.5 }}>{aiSummary}</p>}
          </div>
        )}

        {/* Compose */}
        <div className={styles.secHdr}><h3 className={styles.secTitle}>Add Memory</h3></div>
        <div className={styles.journalCompose}>
          {trips.length > 0 && (
            <div className={styles.selectWrap}>
              <select
                className={styles.tripSelect}
                value={selectedTripId}
                onChange={(e) => setSelectedTripId(e.target.value)}
                aria-label="Select trip"
              >
                <option value="">General memory…</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>{t.title ?? t.to}</option>
                ))}
              </select>
            </div>
          )}
          <textarea
            className={styles.txtInput}
            placeholder="What made today special? A smell, a conversation, a view…"
            rows={3}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Memory note"
          />
          <div>
            <p className={styles.moodLabel}>How did it feel?</p>
            <div className={styles.moodSelect} role="group" aria-label="Select mood">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  className={`${styles.moodBtn} ${selectedMood === m.id ? styles.moodBtnActive : ''}`}
                  type="button"
                  aria-label={m.id}
                  aria-pressed={selectedMood === m.id}
                  onClick={() => setSelectedMood(m.id)}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>
          <button
            className={styles.btnAmber}
            type="button"
            onClick={saveMemory}
            disabled={!note.trim() || !selectedMood}
          >
            Save Memory
          </button>
        </div>

        {/* Filter by trip */}
        {trips.length > 0 && memories.length > 0 && (
          <div style={{ padding: '0 var(--s20)', marginTop: 'var(--s16)' }}>
            <select
              value={filterTripId}
              onChange={(e) => setFilterTripId(e.target.value)}
              aria-label="Filter by trip"
              style={{ background: 'var(--s2)', border: '1px solid var(--s3)', borderRadius: 8, padding: '6px 10px', color: 'var(--fg1)', fontSize: '0.85rem', width: '100%' }}
            >
              <option value="">All memories</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>{t.title ?? t.to}</option>
              ))}
            </select>
          </div>
        )}

        {/* Timeline */}
        <div className={styles.secHdr} style={{ paddingTop: 'var(--s20)' }}>
          <h3 className={styles.secTitle}>Timeline</h3>
          <span style={{ color: 'var(--fg2)', fontSize: '0.8rem' }}>{displayedMemories.length} entries</span>
        </div>

        {displayedMemories.length === 0 ? (
          <div style={{ padding: 'var(--s20)', textAlign: 'center', color: 'var(--fg2)', fontSize: '0.9rem' }}>
            No memories yet. Add your first one above!
          </div>
        ) : (
          <div className={styles.timeline} role="list">
            {displayedMemories.map((mem) => {
              const raw = mem.highlights[0] ?? '';
              const hasEmoji = raw.includes('::');
              const emoji = hasEmoji ? raw.split('::')[0] : '😊';
              const noteText = hasEmoji ? raw.split('::')[1] : raw;

              return (
                <div key={mem.id} className={styles.memoryCard} role="listitem">
                  <div className={styles.memoryHdr}>
                    <span className={styles.memoryMood}>{emoji}</span>
                    <div className={styles.memoryMeta}>
                      <p className={styles.memoryTrip}>{mem.headline}</p>
                      <p className={styles.memoryDate}>{fmtDate(mem.createdAt)}</p>
                    </div>
                  </div>
                  <p className={styles.memoryNote}>{noteText}</p>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ height: 'var(--s40)' }} />
      </div>
      <BottomNav active="you" />
    </div>
  );
}
