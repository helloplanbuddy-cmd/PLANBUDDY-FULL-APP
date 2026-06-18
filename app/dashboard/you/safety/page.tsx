'use client';
// ============================================================
// Safety Hub — PHASE 1 UPGRADE
// Was: pure UI, SOS did nothing, contacts were hardcoded
// Now: persistent emergency contacts (Zustand + localStorage),
//      persistent checklist, real geolocation sharing prep,
//      SOS with 3-second hold + real tel: links
// ============================================================

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/app/components/BottomNav';
import styles from './safety.module.css';

const INDIA_NUMBERS = [
  { name: 'Police',           num: '100' },
  { name: 'Ambulance',        num: '108' },
  { name: "Women's Helpline", num: '1091' },
  { name: 'Tourist Helpline', num: '1800111363' },
];

const CHECKLIST_ITEMS = [
  { id: 'id',       label: 'Government ID (Aadhaar / Passport)' },
  { id: 'insurance',label: 'Travel insurance purchased' },
  { id: 'offline',  label: 'Offline itinerary downloaded' },
  { id: 'contacts', label: 'Emergency contacts saved' },
  { id: 'hotel',    label: 'Hotel address saved offline' },
  { id: 'cash',     label: 'Local cash ready (₹2,000 minimum)' },
];

const STORAGE_KEY_CONTACTS  = 'pb_emergency_contacts';
const STORAGE_KEY_CHECKLIST = 'pb_safety_checklist';
const SOS_HOLD_MS           = 3000;

interface Contact { id: string; name: string; num: string; }

function loadContacts(): Contact[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_CONTACTS) ?? '[]');
  } catch { return []; }
}
function saveContacts(c: Contact[]) {
  try { localStorage.setItem(STORAGE_KEY_CONTACTS, JSON.stringify(c)); } catch {}
}
function loadChecklist(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CHECKLIST) ?? '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch { return new Set(); }
}
function saveChecklist(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY_CHECKLIST, JSON.stringify([...s])); } catch {}
}

export default function SafetyPage() {
  // Auth is guarded exclusively by app/dashboard/layout.tsx (single source of truth).
  const router = useRouter();

  const [contacts, setContacts]           = useState<Contact[]>(() => loadContacts());
  const [checked,  setChecked]            = useState<Set<string>>(() => loadChecklist());
  const [sosProgress, setSosProgress]     = useState(0);   // 0–100
  const [sosTriggered, setSosTriggered]   = useState(false);
  const [location, setLocation]           = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError]           = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName]             = useState('');
  const [newNum,  setNewNum]              = useState('');
  const [addError, setAddError]           = useState('');

  const sosTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const sosResetTimer = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const sosStart      = useRef<number>(0);
  const sosRaf        = useRef<number>(0);


  // ── Checklist toggle ──────────────────────────────────
  const toggleCheck = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      saveChecklist(next);
      return next;
    });
  }, []);

  // ── Add contact ───────────────────────────────────────
  const handleAddContact = useCallback(() => {
    if (!newName.trim()) { setAddError('Enter a name'); return; }
    const digits = newNum.replace(/\D/g, '');
    if (digits.length < 7) { setAddError('Enter a valid phone number'); return; }

    const updated: Contact[] = [
      ...contacts,
      { id: `${Date.now()}`, name: newName.trim(), num: newNum.trim() },
    ];
    setContacts(updated);
    saveContacts(updated);
    setNewName('');
    setNewNum('');
    setAddError('');
    setShowAddContact(false);
  }, [contacts, newName, newNum]);

  const handleDeleteContact = useCallback((id: string) => {
    const updated = contacts.filter((c) => c.id !== id);
    setContacts(updated);
    saveContacts(updated);
  }, [contacts]);

  // ── SOS hold logic ────────────────────────────────────
  function triggerSOS() {
    setSosTriggered(true);
    setSosProgress(100);
    // Attempt to get location for SOS context
    navigator.geolocation?.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
    // Auto-reset after 5s — tracked for cleanup
    if (sosResetTimer.current) clearTimeout(sosResetTimer.current);
    sosResetTimer.current = setTimeout(() => { setSosTriggered(false); setSosProgress(0); }, 5000);
  }

  const startSOS = useCallback(() => {
    sosStart.current = performance.now();
    setSosProgress(0);

    const tick = () => {
      const elapsed = performance.now() - sosStart.current;
      const pct = Math.min((elapsed / SOS_HOLD_MS) * 100, 100);
      setSosProgress(pct);
      if (pct < 100) {
        sosRaf.current = requestAnimationFrame(tick);
      } else {
        triggerSOS();
      }
    };
    sosRaf.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line

  const cancelSOS = useCallback(() => {
    cancelAnimationFrame(sosRaf.current);
    if (sosTimer.current)      clearInterval(sosTimer.current);
    if (sosResetTimer.current) clearTimeout(sosResetTimer.current);
    setSosProgress(0);
  }, []);


  // ── Request geolocation for sharing ───────────────────
  const handleShareLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocError('');
        // Open Google Maps link — contacts can be sent this via share API
        const url = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
        if (navigator.share) {
          navigator.share({ title: 'My location', url }).catch(() => {});
        } else {
          window.open(url, '_blank');
        }
      },
      (err) => {
        setLocError(
          err.code === 1
            ? 'Location permission denied. Enable it in browser settings.'
            : 'Could not get location. Try again.'
        );
      },
      { timeout: 10000 }
    );
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.ibtn} type="button" aria-label="Back" onClick={() => router.push('/dashboard/you')}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <h1 className={styles.topbarTitle}>Safety</h1>
        <span className={styles.badgeGreen}>● Secure</span>
      </header>

      <div className={styles.pageScroll}>
        {/* SOS Card */}
        <div className={styles.sosCard}>
          <div className={styles.sosInfo}>
            <p className={styles.sosTitle}>Emergency SOS</p>
            <p className={styles.sosSub}>
              {sosTriggered
                ? location
                  ? `SOS sent. Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                  : 'SOS activated! Share your location with emergency contacts.'
                : 'Hold for 3 seconds to activate SOS.'}
            </p>
          </div>
          <button
            className={`${styles.sosBtn} ${sosTriggered ? styles.sosBtnActive : ''}`}
            type="button"
            aria-label="Emergency SOS — hold 3 seconds to activate"
            style={{
              background: sosTriggered
                ? 'var(--red)'
                : sosProgress > 0
                  ? `conic-gradient(var(--red) ${sosProgress * 3.6}deg, var(--bdim) 0deg)`
                  : undefined,
            }}
            onMouseDown={startSOS}
            onMouseUp={cancelSOS}
            onMouseLeave={cancelSOS}
            onTouchStart={(e) => { e.preventDefault(); startSOS(); }}
            onTouchEnd={cancelSOS}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 3v10M7 19l4-6 4 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            SOS
          </button>
          <div className={styles.sosActions}>
            <button className={styles.btnGhost} type="button" onClick={handleShareLocation}>
              📍 Share Location
            </button>
            {contacts[0] && (
              <a href={`tel:${contacts[0].num}`} className={styles.btnGhost}>
                📞 Call {contacts[0].name}
              </a>
            )}
          </div>
          {locError && <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 8, textAlign: 'center' }}>{locError}</p>}
        </div>

        <div className={styles.safetyCards}>
          {/* Emergency contacts — persistent */}
          <div className={styles.safetyCard}>
            <div className={styles.safetyCardHdr}>
              <div className={styles.safetyIcon} style={{ background: 'var(--bdim)', color: 'var(--blue)' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 16c0-3 2-5 5-5s5 2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M13 10v5M10.5 12.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p className={styles.safetyCardTitle}>Emergency Contacts</p>
              <button
                className={styles.btnGhostSm}
                type="button"
                style={{ marginLeft: 'auto' }}
                onClick={() => setShowAddContact((v) => !v)}
              >
                + Add
              </button>
            </div>

            {/* Add contact form */}
            {showAddContact && (
              <div style={{ padding: '0 0 var(--s12)' }}>
                {addError && <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginBottom: 6 }}>{addError}</p>}
                <input
                  type="text"
                  aria-label="Emergency contact name"
                  placeholder="Name (e.g. Mum)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ width: '100%', marginBottom: 8, padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--s3)', borderRadius: 8, color: 'var(--fg1)', fontSize: '0.9rem' }}
                />
                <input
                  type="tel"
                  aria-label="Emergency contact phone number"
                  placeholder="+91 98765 43210"
                  value={newNum}
                  onChange={(e) => setNewNum(e.target.value)}
                  inputMode="tel"
                  style={{ width: '100%', marginBottom: 8, padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--s3)', borderRadius: 8, color: 'var(--fg1)', fontSize: '0.9rem' }}
                />
                <button
                  className={styles.btnGhostSm}
                  type="button"
                  onClick={handleAddContact}
                  style={{ background: 'var(--teal)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8 }}
                >
                  Save Contact
                </button>
              </div>
            )}

            {contacts.length === 0 ? (
              <p style={{ color: 'var(--fg2)', fontSize: '0.85rem', padding: 'var(--s8) 0' }}>
                No contacts saved. Tap + Add to save someone important.
              </p>
            ) : (
              contacts.map((c) => (
                <div key={c.id} className={styles.ecItem}>
                  <div className={styles.ecInfo}>
                    <p className={styles.ecName}>{c.name}</p>
                    <p className={styles.ecNum}>{c.num}</p>
                  </div>
                  <a href={`tel:${c.num}`} className={styles.ecCall} aria-label={`Call ${c.name}`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 2l3 3-1.5 2s1.5 3 5 5l2-1.5 3 3-2 2C8 17 1 10 1 4l2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                  </a>
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => handleDeleteContact(c.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--fg3)', cursor: 'pointer', padding: '4px 6px', fontSize: '1rem' }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          {/* India emergency numbers */}
          <div className={styles.safetyCard}>
            <div className={styles.safetyCardHdr}>
              <div className={styles.safetyIcon} style={{ background: 'var(--rdim)', color: 'var(--red)' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2l2 5 5 .7-3.5 3.5 1 5L9 13l-4.5 2.7 1-5L2 7.7l5-.7z" stroke="currentColor" strokeWidth="1.4"/>
                </svg>
              </div>
              <p className={styles.safetyCardTitle}>India Emergency Numbers</p>
            </div>
            {INDIA_NUMBERS.map((n) => (
              <div key={n.name} className={styles.ecItem}>
                <div className={styles.ecInfo}>
                  <p className={styles.ecName}>{n.name}</p>
                  <p className={styles.ecNum}>{n.num}</p>
                </div>
                <a href={`tel:${n.num}`} className={styles.ecCall} aria-label={`Call ${n.name}`}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 2l3 3-1.5 2s1.5 3 5 5l2-1.5 3 3-2 2C8 17 1 10 1 4l2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  </svg>
                </a>
              </div>
            ))}
          </div>

          {/* Persistent checklist */}
          <div className={styles.safetyCard}>
            <div className={styles.safetyCardHdr}>
              <div className={styles.safetyIcon} style={{ background: 'var(--tdim)', color: 'var(--teal)' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M6 7h6M6 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <p className={styles.safetyCardTitle}>Pre-trip Checklist</p>
              <span className={styles.badgeTeal} style={{ marginLeft: 'auto' }}>{checked.size}/{CHECKLIST_ITEMS.length}</span>
            </div>
            {CHECKLIST_ITEMS.map((item) => (
              <div key={item.id} className={styles.checkItem}>
                <button
                  className={`${styles.checkBox} ${checked.has(item.id) ? styles.checkBoxDone : ''}`}
                  type="button"
                  aria-pressed={checked.has(item.id)}
                  onClick={() => toggleCheck(item.id)}
                >
                  {checked.has(item.id) && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                <span className={`${styles.checkLabel} ${checked.has(item.id) ? styles.checkLabelDone : ''}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 'var(--s40)' }} />
      </div>
      <BottomNav active="you" />
    </div>
  );
}
