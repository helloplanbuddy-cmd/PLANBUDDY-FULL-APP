// ============================================================
// PlanBuddy v4 — Shared Type Definitions
// ============================================================

export interface OnboardingSlide {
  id: string;
  illustrationKey: 'plan' | 'budget' | 'safety';
  pills: FeaturePill[];
  heading: string;
  description: string;
}

export interface FeaturePill {
  icon: string;
  title: string;
  sub: string;
  isHero?: boolean;
  badge?: string;
}

export type NavigationTarget = '/onboarding' | '/auth/phone';

export interface AuthSession {
  phone: string;
  token: string;
  createdAt: number;
  userId?: string;  // Added in v4
}

export type AuthFSMState =
  | 'IDLE'
  | 'VALIDATING'
  | 'SENDING'
  | 'OTP_SENT'
  | 'VERIFYING'
  | 'SUCCESS'
  | 'ERROR'
  | 'LOCKED';

export const STORAGE_KEYS = {
  ONBOARDING_DONE: 'pb_onboarding_done',
  DEMO_SEEN:       'pb_demo_seen',        // set after user visits /demo-trip-generator
  IS_LOGGED_IN:    'pb_is_logged_in',
  AUTH_TOKEN:      'pb_auth_token',
  USER_SESSION:    'pb_user_session',
  SAVED_PHONE:     'pb_saved_phone',
  LOCK_UNTIL:      'pb_lock_until',
  RESEND_COUNT:    'pb_resend_count',
  // v3 additions
  STORE_KEY:       'planbuddy-v3-store',
} as const;

export const OTP_LENGTH            = 6;
export const OTP_TIMER_SECONDS     = 30;
export const MAX_OTP_ATTEMPTS      = 5;
export const MAX_RESEND_COUNT      = 3;
export const LOCK_DURATION_MS      = 5 * 60 * 1000;

// Travel domain types
export type TravelInterest =
  | 'beach' | 'mountains' | 'heritage' | 'nature' | 'culture'
  | 'food' | 'wellness' | 'adventure' | 'wildlife' | 'shopping';

export type TripStatus = 'draft' | 'planned' | 'active' | 'completed';

export type ExpenseCategory = 'food' | 'travel' | 'activity' | 'stay' | 'shopping' | 'misc';
