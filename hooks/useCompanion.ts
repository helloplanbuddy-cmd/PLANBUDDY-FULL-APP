// ============================================================
// useCompanion — Claude streaming hook for AI Buddy
// Handles message sending, streaming response assembly,
// and companion context building from app store
// ============================================================

'use client';

import { useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import type { Message } from '@/store/appStore';
import { CompanionService } from '@/src/services/companion.service';

function nowMs(): number { return Date.now(); }
function uid(): string { return Math.random().toString(36).slice(2, 10); }

function buildContext(store: ReturnType<typeof useAppStore.getState>) {
  const activeTrip = store.trips.find((t) => t.id === store.activeTripId)
    ?? store.trips.find((t) => t.status === 'active')
    ?? store.trips[0];

  const spent = activeTrip
    ? store.expenses.filter((e) => e.tripId === activeTrip.id).reduce((s, e) => s + e.amount, 0)
    : 0;

  // Build today's plan from itinerary
  const today = new Date().toISOString().slice(0, 10);
  const todayPlan = activeTrip?.days.find((d) => d.date === today)
    ?? activeTrip?.days[0];
  const dayPlanStr = todayPlan
    ? `Day ${todayPlan.dayNumber}: ${todayPlan.title} — ${todayPlan.activities.slice(0, 4).map((a) => `${a.time} ${a.title} (₹${a.cost})`).join(', ')}`
    : 'No itinerary for today';

  // Budget health
  const remaining = (activeTrip?.budget ?? 0) - spent;
  const budgetPct = activeTrip?.budget ? Math.round((spent / activeTrip.budget) * 100) : 0;
  const budgetHealth = budgetPct >= 100 ? 'OVER BUDGET' : budgetPct >= 85 ? 'CRITICAL' : budgetPct >= 60 ? 'WATCH' : 'ON TRACK';

  // Top categories spent
  const catSpend: Record<string, number> = {};
  if (activeTrip) {
    store.expenses.filter((e) => e.tripId === activeTrip.id).forEach((e) => {
      catSpend[e.category] = (catSpend[e.category] ?? 0) + e.amount;
    });
  }
  const topCats = Object.entries(catSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}: ₹${v.toLocaleString('en-IN')}`)
    .join(', ');

  // Recent memories for trip context
  const recentMemories = store.memories
    .filter((m) => m.tripId === activeTrip?.id)
    .slice(0, 3)
    .map((m) => m.highlights[0]?.split('::')[1] ?? m.headline)
    .join('; ');

  return {
    city:        activeTrip?.to ?? store.profile.homeCity ?? 'India',
    tripSummary: activeTrip
      ? `${activeTrip.days.length}-day trip to ${activeTrip.to} (${activeTrip.status}), ${activeTrip.from} → ${activeTrip.to}, ${activeTrip.startDate} to ${activeTrip.endDate}`
      : 'No active trip',
    stage:       activeTrip?.status === 'active' ? 'active' : activeTrip ? 'pre' : 'none',
    daysInfo:    activeTrip
      ? `${activeTrip.days.length} days, ${activeTrip.from} → ${activeTrip.to}`
      : '',
    spent,
    total:       activeTrip?.budget ?? 0,
    remaining,
    budgetHealth,
    budgetPct:   `${budgetPct}%`,
    topSpendCategories: topCats || 'No expenses yet',
    weather:     'Check local weather app for current conditions',
    dayPlan:     dayPlanStr,
    itinerary:   activeTrip?.days.slice(0, 3).map((d) =>
      `Day ${d.dayNumber} (${d.title}): ${d.activities.slice(0, 3).map((a) => a.title).join(', ')}`
    ).join(' | ') ?? '',
    profile:     `${store.profile.travelStyle.join('/')} traveler from ${store.profile.homeCity}, interests: ${(store.profile.interests ?? []).slice(0, 5).join(', ')}`,
    tripMemories: recentMemories || 'No memories recorded yet',
    interests:   activeTrip?.interests?.join(', ') ?? '',
  };
}

export function useCompanion() {
  const {
    companionMessages,
    companionIsTyping,
    addCompanionMessage,
    setCompanionTyping,
  } = useAppStore();

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: nowMs(),
    };
    addCompanionMessage(userMsg);
    setCompanionTyping(true);

    // Build assistant placeholder for streaming
    const assistantId = uid();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: nowMs(),
    };
    addCompanionMessage(assistantMsg);

    try {
      const store = useAppStore.getState();
      const context = buildContext(store);

      // Send all messages except the empty assistant placeholder
      const apiMessages = [...store.companionMessages]
        .filter((m) => m.id !== assistantId && m.content.trim())
        .slice(-20)
        .map(({ role, content }) => ({ role, content }));

      const res = await CompanionService.streamChat(apiMessages, undefined, context);

      if (!res.ok || !res.body) throw new Error('API error');

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
            if (parsed.text) {
              accumulated += parsed.text;
              // Update the assistant message in place
              useAppStore.setState((state) => ({
                companionMessages: state.companionMessages.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulated } : m
                ),
              }));
            }
          } catch {
            // Partial chunk, continue
          }
        }
      }
    } catch (err) {
      // Structured error log
      if (typeof window !== 'undefined') {
        const logger = (await import('@/lib/logger')).logger;
        logger.error({ err }, '[useCompanion] Stream error');
      }
      // Update placeholder with error message
      useAppStore.setState((state) => ({
        companionMessages: state.companionMessages.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Sorry, I couldn't connect right now. Check your internet and try again." }
            : m
        ),
      }));
    } finally {
      setCompanionTyping(false);
    }
  }, [addCompanionMessage, setCompanionTyping]);

  const clearMessages = useAppStore((s) => s.clearCompanionMessages);

  return {
    messages: companionMessages,
    isTyping: companionIsTyping,
    sendMessage,
    clearMessages,
  };
}

// ─── Exported clearMessages (for BuddyScreen clear button) ─
// Exported as part of the hook return value so the button has
// a real callable function instead of a dead reference.

export function useClearCompanion() {
  return useAppStore((s) => s.clearCompanionMessages);
}
