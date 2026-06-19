'use client';

import { useRouter } from 'next/navigation';
import { useLogout } from '@/hooks/useAuthGuard'; // P2 FIX: layout is auth guard
import { useAppStore } from '@/store/appStore';
import BottomNav from '@/app/components/BottomNav';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import styles from './you.module.css';

function formatPhone(phone: string): string {
  if (!phone) return 'Traveler';
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

// Fix #6: removed href:null items — either route exists or item is hidden
const MENU_ITEMS = [
  { id: 'trips',   label: 'My Trips',           href: '/dashboard/you/trips',    iconPath: '<path d="M4 6h12M4 10h8M4 14h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' },
  { id: 'memory',  label: 'Travel Memories',    href: '/dashboard/you/memories', iconPath: '<path d="M4 3h12a2 2 0 0 1 2 2v13l-7-4-7 4V5a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.7"/>' },
  { id: 'budget',  label: 'Budget Tracker',     href: '/dashboard/you/budget',   iconPath: '<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M10 7v6M8 8.5h3a1 1 0 0 1 0 2H9a1 1 0 0 0 0 2h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' },
  { id: 'packing', label: 'Packing Assistant',  href: '/dashboard/you/packing',  iconPath: '<rect x="3" y="7" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M7 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' },
  { id: 'safety',  label: 'Safety & Emergency', href: '/dashboard/you/safety',   iconPath: '<path d="M10 2l6 3v5c0 3.5-2.5 6.5-6 8-3.5-1.5-6-4.5-6-8V5l6-3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" fill="none"/>' },
  // Fix #6: "Travel Preferences" and "Help & Support" hidden until routes exist
];

export default function YouScreen() {
  // Auth is guarded exclusively by app/dashboard/layout.tsx (single source of truth).
  const logout = useLogout();
  const router = useRouter();
  const auth     = useAppStore((s) => s.auth);
  const trips    = useAppStore((s) => s.getUserTrips());
  const memories = useAppStore((s) => s.getUserMemories());

  const displayName = auth?.phone ? formatPhone(auth.phone) : 'Traveler';
  const avatarChar  = displayName.charAt(0).toUpperCase();

  // Fix #4: real stats from store
  const tripCount    = trips.length;
  const memoryCount  = memories.length;
  const totalPlanned = trips.reduce((sum, t) => sum + (t.budget ?? 0), 0);
  const plannedFmt   = totalPlanned >= 100000
    ? `₹${(totalPlanned / 100000).toFixed(1)}L`
    : totalPlanned >= 1000
      ? `₹${Math.round(totalPlanned / 1000)}K`
      : `₹${totalPlanned}`;

  const handleLogout = async () => {
    // Fix #5: track logout
    ClientAnalytics.track('logout', { phone_masked: auth?.phone?.slice(0, 4) + '****' });
    await logout();
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar} role="banner">
        <h1 className={styles.topbarTitle}>Profile</h1>
        <button className={styles.ibtn} aria-label="Settings" type="button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7"/>
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.6 4.6l1.4 1.4M14 14l1.4 1.4M4.6 15.4l1.4-1.4M14 6l1.4-1.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      <div className={styles.pageScroll}>
        {/* Profile hero */}
        <div className={styles.profileHero}>
          <div className={styles.profileAv} aria-hidden="true">{avatarChar}</div>
          <p className={styles.profileName}>{displayName}</p>
          <p className={styles.profilePhone}>PlanBuddy member</p>
          <span className={styles.badgeTeal}>✦ AI Companion</span>
        </div>

        {/* Stats — Fix #4: real data from store */}
        <div className={styles.statsRow} role="list">
          <div className={styles.statCard} role="listitem">
            <p className={styles.statVal}>{tripCount}</p>
            <p className={styles.statLbl}>Trips</p>
          </div>
          <div className={styles.statCard} role="listitem">
            <p className={styles.statVal}>{memoryCount}</p>
            <p className={styles.statLbl}>Memories</p>
          </div>
          <div className={styles.statCard} role="listitem">
            <p className={styles.statVal}>{plannedFmt}</p>
            <p className={styles.statLbl}>Planned</p>
          </div>
        </div>

        {/* Menu — Fix #6: only items with real routes */}
        <nav className={styles.menuList} aria-label="Profile menu">
          {MENU_ITEMS.map(item => (
            <button
              key={item.id}
              className={styles.menuBtn}
              type="button"
              onClick={() => router.push(item.href)}
            >
              <span className={styles.menuBtnIcon}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" dangerouslySetInnerHTML={{ __html: item.iconPath }} />
              </span>
              <span className={styles.menuBtnText}>{item.label}</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.menuBtnArrow}>
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          ))}
          <button className={`${styles.menuBtn} ${styles.menuBtnDanger}`} type="button" onClick={handleLogout}>
            <span className={styles.menuBtnIcon}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M13 3h4v14h-4M9 14l4-4-4-4M13 10H4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className={styles.menuBtnText}>Log Out</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.menuBtnArrow}>
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </nav>
        <div style={{ height: 'var(--s40)' }} />
      </div>

      <BottomNav active="you" />
    </div>
  );
}
