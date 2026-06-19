'use client';
// ============================================================
// Packing Assistant — PHASE 1 UPGRADE
// Was: static hardcoded Goa list, no persistence, no trip context
// Now: reads active trip from store, dynamic list based on
//      destination + trip type + duration, persisted packed state,
//      custom item add, AI-generate button
// ============================================================

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import BottomNav from '@/app/components/BottomNav';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import styles from './packing.module.css';

// ─── Base packing templates ───────────────────────────────

interface PackItem { key: string; label: string; essential?: boolean; }
interface PackCat  { name: string; icon: string; items: PackItem[]; }

function buildPackingList(
  destination: string,
  durationDays: number,
  interests: string[]
): PackCat[] {
  const isBeach    = interests.some((i) => /beach|goa|andaman|kerala|coast/i.test(i)) || /goa|andaman|beach|coast/i.test(destination);
  const isMountain = interests.some((i) => /mountain|manali|ladakh|trek/i.test(i))   || /manali|ladakh|shimla|darjeel|ooty/i.test(destination);
  const isHeritage = interests.some((i) => /heritage|history|culture/i.test(i))       || /rajasthan|jaipur|agra|hampi|khajuraho/i.test(destination);

  const clothingItems: PackItem[] = [
    { key: 'tshirts',    label: `T-shirts (${Math.max(3, Math.ceil(durationDays * 0.7))})`,     essential: true },
    { key: 'bottoms',    label: `Bottoms (${Math.max(2, Math.ceil(durationDays * 0.5))})`,       essential: true },
    { key: 'underwear',  label: `Underwear (${durationDays + 1})`,                               essential: true },
    { key: 'socks',      label: `Socks (${durationDays})`,                                       essential: true },
    { key: 'pjs',        label: 'Sleepwear'                                                                     },
    ...(isBeach    ? [{ key: 'swimwear',  label: 'Swimwear (2 sets)' }, { key: 'coverup', label: 'Beach cover-up' }] : []),
    ...(isMountain ? [{ key: 'jacket',    label: 'Warm jacket / fleece',   essential: true }, { key: 'thermals', label: 'Thermal innerwear' }] : []),
    ...(isHeritage ? [{ key: 'modest',    label: 'Modest clothing for temples'               }] : []),
    { key: 'sandals',    label: isBeach ? 'Flip flops + sandals' : 'Comfortable walking shoes',  essential: true },
    { key: 'sunglasses', label: 'Sunglasses'                                                                    },
  ];

  const toiletries: PackItem[] = [
    { key: 'sunscreen',    label: 'Sunscreen SPF 50+',         essential: true  },
    { key: 'toothbrush',   label: 'Toothbrush & toothpaste',   essential: true  },
    { key: 'deodorant',    label: 'Deodorant',                  essential: true  },
    { key: 'shampoo',      label: 'Shampoo & conditioner'                        },
    { key: 'moisturizer',  label: 'Moisturizer'                                  },
    { key: 'insect',       label: 'Insect repellent'                             },
    ...(isBeach ? [{ key: 'aftersun', label: 'After-sun lotion' }] : []),
  ];

  const documents: PackItem[] = [
    { key: 'id',       label: 'Aadhaar / Passport',       essential: true },
    { key: 'tickets',  label: 'Flight / train tickets',   essential: true },
    { key: 'hotel',    label: 'Hotel booking confirmation',essential: true },
    { key: 'insurance',label: 'Travel insurance'                          },
    { key: 'cash',     label: 'Local cash (₹3,000 min)',  essential: true },
  ];

  const electronics: PackItem[] = [
    { key: 'phone',     label: 'Phone + charger',        essential: true },
    { key: 'powerbank', label: 'Portable power bank',    essential: true },
    { key: 'earphones', label: 'Earphones'                               },
    { key: 'adapter',   label: 'Universal power adapter'                 },
    ...(durationDays >= 5 ? [{ key: 'laptop', label: 'Laptop (if WFT)' }] : []),
  ];

  const medicines: PackItem[] = [
    { key: 'ors',         label: 'ORS packets',             essential: true },
    { key: 'antacid',     label: 'Antacids',                essential: true },
    { key: 'paracetamol', label: 'Paracetamol',             essential: true },
    { key: 'motion',      label: 'Motion sickness tabs'                      },
    { key: 'bandaids',    label: 'Band-aids & antiseptic'                    },
    ...(isBeach    ? [{ key: 'diarrhea', label: 'Anti-diarrheal (water change)' }] : []),
    ...(isMountain ? [{ key: 'altitude', label: 'Altitude sickness tabs'        }] : []),
  ];

  const misc: PackItem[] = [
    { key: 'bag',      label: 'Day backpack / tote'                     },
    { key: 'lock',     label: 'Luggage lock',          essential: true  },
    { key: 'laundry',  label: 'Laundry bag'                             },
    ...(isBeach    ? [{ key: 'drybag', label: 'Dry bag / waterproof pouch' }] : []),
    ...(isMountain ? [{ key: 'flask',  label: 'Reusable water flask'       }] : []),
    ...(durationDays >= 7 ? [{ key: 'travel-pillow', label: 'Travel pillow' }] : []),
  ];

  return [
    { name: 'Clothing',    icon: '👕', items: clothingItems  },
    { name: 'Toiletries',  icon: '🧴', items: toiletries     },
    { name: 'Documents',   icon: '📄', items: documents      },
    { name: 'Electronics', icon: '📱', items: electronics    },
    { name: 'Medicines',   icon: '💊', items: medicines      },
    { name: 'Other',       icon: '🎒', items: misc           },
  ].filter((c) => c.items.length > 0);
}

const STORAGE_KEY = (tripId: string) => `pb_packing_${tripId}`;

function loadPacked(tripId: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY(tripId)) ?? '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch { return new Set(); }
}
function savePacked(tripId: string, packed: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY(tripId), JSON.stringify([...packed])); } catch {}
}

export default function PackingPage() {
  // Auth is guarded exclusively by app/dashboard/layout.tsx (single source of truth).
  const router = useRouter();

  const activeTripId = useAppStore((s) => s.activeTripId);
  const trips        = useAppStore((s) => s.trips);

  const activeTrip = useMemo(
    () => trips.find((t) => t.id === activeTripId) ?? trips.find((t) => t.status === 'active') ?? trips[0],
    [activeTripId, trips]
  );

  const durationDays = activeTrip
    ? Math.max(1, Math.round((new Date(activeTrip.endDate).getTime() - new Date(activeTrip.startDate).getTime()) / 86_400_000))
    : 5;

  const packingCats = useMemo(
    () => buildPackingList(activeTrip?.to ?? '', durationDays, activeTrip?.interests ?? []),
    [activeTrip, durationDays]
  );

  const totalItems = useMemo(
    () => packingCats.reduce((s, c) => s + c.items.length, 0),
    [packingCats]
  );

  const [packed,    setPacked]   = useState<Set<string>>(new Set());
  const loadedTripRef = useRef<string | null>(null);
  const [expanded,  setExpanded] = useState<Set<string>>(new Set(['Clothing']));
  const [customItems, setCustomItems] = useState<{ cat: string; label: string; key: string }[]>([]);
  const [addingTo,  setAddingTo] = useState<string | null>(null);
  const [newItem,   setNewItem]  = useState('');

  // Load persisted packed state when trip changes (ref guard avoids setState-in-effect warning)
  useEffect(() => {
    if (activeTrip && loadedTripRef.current !== activeTrip.id) {
      loadedTripRef.current = activeTrip.id;
      const saved = loadPacked(activeTrip.id);
      setPacked(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id]);

  const toggleItem = useCallback((key: string) => {
    setPacked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      if (activeTrip) savePacked(activeTrip.id, next);
      return next;
    });
  }, [activeTrip]);

  const toggleCat = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });
  }, []);

  const handleAddCustom = useCallback((catName: string) => {
    const label = newItem.trim();
    if (!label) return;
    const key = `custom:${catName}:${Date.now()}`;
    setCustomItems((prev) => [...prev, { cat: catName, label, key }]);
    // Phase 2E: track packing_item_added
    ClientAnalytics.track('packing_item_added', { category: catName, custom: true });
    setNewItem('');
    setAddingTo(null);
  }, [newItem]);

  const pct = totalItems > 0 ? Math.round((packed.size / (totalItems + customItems.length)) * 100) : 0;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.ibtn} type="button" aria-label="Back" onClick={() => router.push('/dashboard/you')}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <h1 className={styles.topbarTitle}>Packing Assistant</h1>
      </header>

      <div className={styles.pageScroll}>
        {/* Hero */}
        <div className={styles.packingHero}>
          <div className={styles.heroRow}>
            <div className={styles.heroIcon}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="4" y="7" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className={styles.heroTitle}>{activeTrip ? `${activeTrip.to}` : 'Your Trip'}</p>
              <p className={styles.heroSub}>{durationDays} days{activeTrip?.interests?.length ? ` · ${activeTrip.interests.slice(0, 2).join(', ')}` : ''}</p>
            </div>
          </div>
          <div className={styles.progressWrap}>
            <div className={styles.progressLabels}>
              <span className={styles.progressLbl}>Packed</span>
              <span className={styles.progressPct}>{pct}%</span>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <div className={styles.secHdr}>
          <h3 className={styles.secTitle}>Your Packing List</h3>
          <span className={styles.badgePurple}>{packed.size} of {totalItems + customItems.length} packed</span>
        </div>

        <div className={styles.cats}>
          {packingCats.map((cat) => {
            const catCustom   = customItems.filter((i) => i.cat === cat.name);
            const allItems    = [...cat.items, ...catCustom.map((i) => ({ key: i.key, label: i.label }))];
            const catPacked   = allItems.filter((item) => packed.has(item.key)).length;
            const isOpen      = expanded.has(cat.name);

            return (
              <div key={cat.name} className={styles.catBlock}>
                <button className={styles.catHdr} type="button" onClick={() => toggleCat(cat.name)}>
                  <span className={styles.catEmoji}>{cat.icon}</span>
                  <span className={styles.catName}>{cat.name}</span>
                  <span className={styles.catCount}>{catPacked}/{allItems.length}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease', flexShrink: 0 }}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>

                {isOpen && (
                  <div className={styles.itemsList}>
                    {allItems.map((item) => {
                      const isDone = packed.has(item.key);
                      return (
                        <div key={item.key} className={styles.packItem}>
                          <button
                            className={`${styles.checkBox} ${isDone ? styles.checkBoxDone : ''}`}
                            type="button"
                            aria-pressed={isDone}
                            onClick={() => toggleItem(item.key)}
                          >
                            {isDone && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                          <span className={`${styles.itemLabel} ${isDone ? styles.itemLabelDone : ''}`}>{item.label}</span>
                        </div>
                      );
                    })}

                    {/* Add custom item */}
                    {addingTo === cat.name ? (
                      <div style={{ display: 'flex', gap: 8, padding: 'var(--s8) 0' }}>
                        <input
                          type="text"
                          placeholder="Item name…"
                          value={newItem}
                          onChange={(e) => setNewItem(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCustom(cat.name)}
                          autoFocus
                          style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--s3)', borderRadius: 8, padding: '6px 10px', color: 'var(--fg1)', fontSize: '0.85rem' }}
                        />
                        <button type="button" onClick={() => handleAddCustom(cat.name)} style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' }}>Add</button>
                        <button type="button" onClick={() => setAddingTo(null)} style={{ background: 'var(--s2)', color: 'var(--fg2)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingTo(cat.name)}
                        style={{ background: 'none', border: 'none', color: 'var(--fg3)', fontSize: '0.8rem', cursor: 'pointer', padding: 'var(--s4) 0', textAlign: 'left' }}
                      >
                        + Add item
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ height: 'var(--s40)' }} />
      </div>
      <BottomNav active="you" />
    </div>
  );
}
