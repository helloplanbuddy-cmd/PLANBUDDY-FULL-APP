// ============================================================
// src/types/api/index.ts — Strongly typed API response contracts
// Phase 4: All API responses typed here. No "any" allowed.
// These types define the FRONTEND CONTRACT with the backend.
// Backend must match these shapes.
// ============================================================

// ── Auth ─────────────────────────────────────────────────────

/** Response from POST /api/auth/send-otp */
export interface AuthResponse {
  success: boolean;
  message: string;
  /** Only present on rate-limit (429) errors */
  resetAt?: number;
}

/** Response from POST /api/auth/verify-otp */
export interface OTPResponse {
  success: boolean;
  message: string;
  /** Short-lived access token (also set as HttpOnly cookie) */
  accessToken: string;
  userId: string;
  phone: string;
}

/** Response from GET /api/auth/session or POST /api/auth/session (refresh) */
export interface SessionResponse {
  authenticated: boolean;
  userId?: string;
  phone?: string;
  /** New access token returned on POST (refresh) */
  accessToken?: string;
}

// ── Trip ─────────────────────────────────────────────────────

export type TripStatus = 'draft' | 'planned' | 'active' | 'completed';
export type ExpenseCategory = 'food' | 'travel' | 'activity' | 'stay' | 'shopping' | 'misc';

export interface ActivityResponse {
  id: string;
  time: string;
  title: string;
  description: string;
  cost: number;
  category: ExpenseCategory;
  isCompleted: boolean;
}

export interface DayPlanResponse {
  dayNumber: number;
  date: string;
  title: string;
  activities: ActivityResponse[];
  notes: string;
}

export interface TripResponse {
  id: string;
  userId: string;
  title: string;
  from: string;
  to: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: TripStatus;
  interests: string[];
  days: DayPlanResponse[];
  createdAt: string;
  updatedAt: string;
}

// ── Plan Generator ────────────────────────────────────────────

export interface PlanResponse {
  /** The request shape sent to the plan endpoint */
  request: {
    from: string;
    to: string;
    days: number;
    budget: number;
    interests: string[];
    startDate?: string;
  };
  /** Streaming response — parsed from SSE chunks */
  data?: {
    title: string;
    summary: string;
    totalEstimatedCost: number;
    days: DayPlanResponse[];
    packingHighlights: string[];
    budgetBreakdown: Record<string, number>;
    bestTimeToVisit?: string;
    weatherNote?: string;
    highlights?: string[];
    foodRecommendations?: string[];
    safetyTips?: string[];
  };
}

// ── Budget ────────────────────────────────────────────────────

export interface BudgetResponse {
  id: string;
  tripId: string;
  userId: string;
  amount: number;
  category: ExpenseCategory;
  note: string;
  date: string;
  createdAt: string;
  synced: boolean;
}

// ── Memory ────────────────────────────────────────────────────

export interface MemoryResponse {
  id: string;
  userId: string;
  tripId: string;
  destination: string;
  headline: string;
  highlights: string[];
  totalSpent: number;
  daysOnTrip: number;
  createdAt: string;
}

// ── User ─────────────────────────────────────────────────────

export interface UserResponse {
  id: string;
  phone: string;
  name?: string;
  homeCity: string;
  travelStyle: ('budget' | 'mid' | 'luxury')[];
  interests: string[];
  tripsCompleted: number;
  travelerTitle: string;
  createdAt: string;
  updatedAt: string;
}

// ── Companion ─────────────────────────────────────────────────

export interface CompanionMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompanionResponse {
  /** Streaming SSE — assembled from chunks */
  message: string;
}

// ── Error ─────────────────────────────────────────────────────

/** Standard error shape from all API endpoints */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  /** Present on rate-limit errors */
  resetAt?: number;
  /** Present on validation errors */
  details?: Record<string, string[]>;
}
