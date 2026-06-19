// ============================================================
// PlanBuddy — Onboarding Slide Data
// ============================================================
import type { OnboardingSlide } from '@/types/index';

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'plan',
    illustrationKey: 'plan',
    pills: [
      { icon: '✈️', title: 'AI Trip Planner', sub: 'Full itinerary in seconds', isHero: true, badge: 'AI' },
      { icon: '💰', title: 'Smart Budget', sub: 'Real costs & splits' },
      { icon: '🗺️', title: 'Route Maps', sub: 'Day-by-day routes' },
    ],
    heading: 'Plan any trip<br/><em>in seconds</em>',
    description: 'Mumbai → Goa, 5 days, ₹20k — just tell the AI.',
  },
  {
    id: 'budget',
    illustrationKey: 'budget',
    pills: [
      { icon: '📊', title: 'Budget Tracker', sub: 'Track every rupee spent', isHero: true, badge: 'Smart' },
      { icon: '🧾', title: 'Expense Splits', sub: 'Easy group splitting' },
      { icon: '🔔', title: 'Overspend Alerts', sub: 'Never go over budget' },
    ],
    heading: 'Track every<br/><em>rupee spent</em>',
    description:
      'Real-time budget health, category breakdowns, and smart alerts so you never overspend.',
  },
  {
    id: 'safety',
    illustrationKey: 'safety',
    pills: [
      { icon: '🛡️', title: 'Safety First', sub: 'One-tap SOS & contacts', isHero: true, badge: 'Live' },
      { icon: '📞', title: 'Emergency Contacts', sub: 'Police, ambulance & more' },
      { icon: '✅', title: 'Safety Checklist', sub: 'Travel-ready every time' },
    ],
    heading: 'Travel safe,<br/><em>always prepared</em>',
    description:
      'SOS button, emergency contacts, and a pre-trip safety checklist — your peace-of-mind companion.',
  },
];

// Re-export storage key for backward-compat with any imports
export { STORAGE_KEYS } from '@/types/index';
export const ONBOARDING_STORAGE_KEY = 'pb_onboarding_done';
