'use client';
// ============================================================
// BuddyScreen v3 — Real Claude API, streaming, context-aware
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
// P2 FIX: useAuthGuard removed — layout/dashboard handles auth
import { useCompanion } from '@/hooks/useCompanion';
import { useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';
import BottomNav from '@/app/components/BottomNav';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import styles from './buddy.module.css';

const QUICK_PROMPTS = [
  { emoji: '📍', label: "What's nearby?",   prompt: 'What should I do nearby right now?' },
  { emoji: '🍽',  label: 'Local food?',      prompt: 'Best authentic local food to try?' },
  { emoji: '🌧',  label: 'Rain plan?',       prompt: 'It might rain today — what are good indoor alternatives?' },
  { emoji: '💰',  label: 'Budget check?',    prompt: 'How is my budget looking for this trip?' },
  { emoji: '⚡',  label: 'Skip what?',       prompt: "What tourist traps should I avoid here?" },
  { emoji: '🌅',  label: 'Sunrise spot?',    prompt: 'Best sunrise or sunset spot nearby?' },
  { emoji: '🚂',  label: 'Train advice',     prompt: 'What train options do I have from here?' },
  { emoji: '🎒',  label: 'Pack check',       prompt: 'Am I forgetting anything important for this trip?' },
];

function nowTime(): string {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function BuddyScreen() {
  
  const { messages, isTyping, sendMessage, clearMessages } = useCompanion();
  const [inputText, setInputText] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useVirtualKeyboard();

  // Phase 2E: track buddy_opened — layout guarantees auth
  useEffect(() => {
    ClientAnalytics.track('buddy_opened');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;
    setInputText('');
    setHasStarted(true);
    await sendMessage(text);
  }, [inputText, isTyping, sendMessage]);

  const handleQuickPrompt = useCallback(async (prompt: string) => {
    setHasStarted(true);
    await sendMessage(prompt);
  }, [sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showWelcome = messages.length === 0 && !hasStarted;

  return (
    <div className={styles.shell}>
      {/* Topbar */}
      <header className={styles.topbar} role="banner">
        <div className={styles.buddyIdent}>
          <div className={styles.buddyAvatar} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M2 16c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className={styles.buddyName}>Buddy</div>
            <div className={styles.buddyStatus}>
              {isTyping ? (
                <span className={styles.typingLabel}>typing…</span>
              ) : (
                <span className={styles.onlineLabel}>● AI Travel Companion</span>
              )}
            </div>
          </div>
        </div>
        <button className={styles.ibtn} aria-label="Clear conversation" type="button"
          onClick={clearMessages}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      {/* Messages area */}
      <div className={styles.messagesArea} role="log" aria-live="polite" aria-label="Conversation">

        {showWelcome ? (
          /* Welcome state */
          <div className={styles.welcomeWrap}>
            <div className={styles.welcomeAvatar} aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="11" r="5" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M3 25c0-5 5-8.5 11-8.5S25 20 25 25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div className={styles.welcomeTitle}>Hey! I&rsquo;m Buddy</div>
            <div className={styles.welcomeSub}>
              Your AI travel companion. Ask me anything about your trip — destinations, budgets, transport, local food, safety, or just what to do today.
            </div>

            <div className={styles.quickGrid}>
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  className={styles.quickChip}
                  type="button"
                  onClick={() => handleQuickPrompt(q.prompt)}
                  aria-label={`Ask: ${q.label}`}
                >
                  <span className={styles.quickEmoji} aria-hidden="true">{q.emoji}</span>
                  <span className={styles.quickLabel}>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className={styles.messageList}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.msgRow} ${msg.role === 'user' ? styles.msgUser : styles.msgBuddy}`}
              >
                {msg.role === 'assistant' && (
                  <div className={styles.msgAvatar} aria-hidden="true">B</div>
                )}
                <div className={styles.msgBubble}>
                  {msg.content || (
                    <span className={styles.streamDots} aria-label="Buddy is typing">
                      <span /><span /><span />
                    </span>
                  )}
                  <span className={styles.msgTime}>{nowTime()}</span>
                </div>
              </div>
            ))}

            {isTyping && messages[messages.length - 1]?.content === '' && null /* streaming bubble already shown */}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts strip — shown after conversation starts */}
      {!showWelcome && (
        <div className={styles.quickStrip} role="toolbar" aria-label="Quick prompts">
          {QUICK_PROMPTS.slice(0, 4).map((q) => (
            <button
              key={q.label}
              className={styles.quickPill}
              type="button"
              onClick={() => handleQuickPrompt(q.prompt)}
              disabled={isTyping}
            >
              {q.emoji} {q.label}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className={styles.inputBar} role="form" aria-label="Send a message">
        <textarea
          ref={inputRef}
          className={styles.inputField}
          placeholder="Ask Buddy anything…"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            // Auto-resize
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Message input"
          aria-multiline="true"
          disabled={isTyping}
        />
        <button
          className={`${styles.sendBtn} ${inputText.trim() && !isTyping ? styles.sendActive : ''}`}
          type="button"
          onClick={handleSend}
          disabled={!inputText.trim() || isTyping}
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M16 2L2 8l5 3 2 5 7-14z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <BottomNav active="buddy" />
    </div>
  );
}
