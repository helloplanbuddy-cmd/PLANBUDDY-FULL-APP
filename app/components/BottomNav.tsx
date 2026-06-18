'use client';

import { useRouter, usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';

export type NavTab = 'home' | 'explore' | 'plus' | 'buddy' | 'you';

const NAV_ITEMS = [
  {
    id: 'home' as NavTab,
    label: 'Home',
    href: '/dashboard',
    svg: '<path d="M3 10.5L10 3l7 7.5M5 8.5V17h4v-4h2v4h4V8.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  },
  {
    id: 'explore' as NavTab,
    label: 'Explore',
    href: '/dashboard/explore',
    svg: '<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M13.5 6.5L10 10m0 0L8 14l4-1z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  { id: 'plus' as NavTab, label: '', href: '/dashboard/plus', svg: '' },
  {
    id: 'buddy' as NavTab,
    label: 'Buddy',
    href: '/dashboard/buddy',
    svg: '<path d="M10 2l2 5 5 .7-3.5 3.5 1 5L10 14l-4.5 2.7 1-5L2 7.7l5-.7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>',
  },
  {
    id: 'you' as NavTab,
    label: 'You',
    href: '/dashboard/you',
    svg: '<circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
  },
];

interface BottomNavProps {
  active: NavTab;
}

export default function BottomNav({ active }: BottomNavProps) {
  const router = useRouter();

  return (
    <nav className={styles.botNav} role="navigation" aria-label="Main navigation">
      {NAV_ITEMS.map(item => {
        if (item.id === 'plus') {
          return (
            <div key="plus" className={styles.navFabWrap}>
              <button
                className={styles.navFab}
                type="button"
                aria-label="Plan a trip"
                onClick={() => router.push('/dashboard/plus')}
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <path d="M11 4v14M4 11h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          );
        }
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            className={`${styles.navBtn} ${isActive ? styles.navBtnActive : ''}`}
            type="button"
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => router.push(item.href)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: item.svg }}
            />
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
