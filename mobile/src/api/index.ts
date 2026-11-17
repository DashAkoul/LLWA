/**
 * لایهٔ typed روی دروازهٔ API.
 *
 * شکل پاسخ‌ها از `@llwa/shared` گرفته می‌شود (فقط type — در زمان اجرا
 * هیچ کدی از آن پکیج بارگذاری نمی‌شود، پس Metro نیازی به resolve کردنش
 * ندارد).
 */

import type {
  Cycle,
  Lesson,
  PlanType,
  SubscriptionInfo,
  UserProfile,
} from '@llwa/shared';
import { callApi, callApiWithQuery } from './client';

export * from './client';

// ─────────────────────────────────────────────────────────────────────
// اشکال پاسخ که فقط در اپ استفاده می‌شوند
// ─────────────────────────────────────────────────────────────────────

export interface HomeMap {
  version: number;
  outcome: string;
  currentStage: string;
  objective: string;
  stageIndex: number;
  totalStages: number;
  criteria: string[];
  calibrated: boolean;
}

export interface CoinDiscount {
  enabled?: boolean;
  percent?: number;
  coinsUsed?: number;
  rate?: number;
}

export interface HomeResponse {
  user: UserProfile;
  map?: HomeMap;
  cycle: Cycle | null;
  lesson: Lesson | null;
  partsDone: number;
  coinDiscount: CoinDiscount | null;
  generating: boolean;
  generationStatus: string | null;
  generationError?: string | null;
  nextUnlockAt?: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface PlanDto {
  id: string;
  planType: PlanType;
  titleFa: string;
  titleEn: string;
  durationDays: number;
  priceIrr: number;
  priceStars: number;
  discountPercent: number;
  isActive: boolean;
  badge?: string | null;
  /** قیمت نهایی پس از تخفیف سکه */
  finalPriceIrr?: number;
  coinDiscountPercent?: number;
}

export interface DueReviewItem {
  term: string;
  meaning: string;
  example: string;
  exampleTranslation?: string;
  pronunciation?: string;
  box: number;
}

export interface DelayedCheckItem {
  term: string;
  options: string[];
  correctIndex: number;
  fromDay: number;
}

export interface CalibrationItem {
  kind: 'MEANING' | 'LISTENING';
  term: string;
  options: string[];
  correctIndex: number;
}

export interface RoleplayScenario {
  scenario: string;
  aiRole: string;
  userRole: string;
  opening: string;
  goal: string;
}

export interface RoleplayResult {
  verdict: 'PASS' | 'PARTIAL' | 'FAIL';
  score: number;
  strengths: string[];
  corrections: { original: string; fixed: string; note?: string }[];
  summary: string;
}

export interface ProgressResponse {
  metrics?: {
    accuracyPct?: number;
    errorProfile?: { type: string; count: number }[];
    helpRatePct?: number;
    delayedRecallPct?: number;
    transferPct?: number;
    skillMastery?: { skill: string; pct: number; total: number }[];
  };
  words?: {
    learning?: { term: string; meaning: string; box: number }[];
    consolidated?: { term: string; meaning: string; box: number }[];
  };
  streak?: { current: number; longest: number };
  totals?: { lessonsCompleted?: number; answers?: number; minutes?: number };
  [key: string]: unknown;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  lastMessageAt?: string | null;
  unread?: number;
}

export interface SupportMessage {
  id: string;
  fromAdmin: boolean;
  body: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────
// اکشن‌ها
// ─────────────────────────────────────────────────────────────────────

export const api = {
  // ── ورود ────────────────────────────────────────────────────────
  authGoogle: (idToken: string) =>
    callApi<AuthResponse>('auth-google', {
      method: 'POST',
      body: { idToken },
      anonymous: true,
    }),

  /**
   * ورود آزمایشی MVP — بدون Google.
   * ⚠️ فقط وقتی سرور `DEMO_MODE=true` داشته باشد پاسخ می‌دهد.
   */
  authDemo: (deviceId?: string) =>
    callApi<AuthResponse>('auth-demo', {
      method: 'POST',
      body: deviceId ? { deviceId } : {},
      anonymous: true,
    }),

  me: () => callApi<{ user: UserProfile }>('me'),

  health: () => callApi<Record<string, unknown>>('health', { anonymous: true }),

  plans: () => callApi<{ plans: PlanDto[] }>('plans', { anonymous: true }),

  // ── مسیر یادگیری ────────────────────────────────────────────────
  home: () => callApi<HomeResponse>('home'),

  progress: () => callApi<ProgressResponse>('progress'),

  retryCycle: () =>
    callApi<{ ok: boolean; via: string; alreadyGenerating?: boolean }>('retry-cycle', {
      method: 'POST',
    }),

  genStatus: () =>
    callApi<{ generating: boolean; ready: boolean; dayNumber: number | null }>(
      'gen-status'
    ),

  completeLesson: (body: {
    lessonId: string;
    durationSeconds: number;
    answers: {
      term: string;
      isCorrect: boolean;
      responseMs: number;
      skill?: string;
      errorType?: string;
      objectiveId?: string;
      stage?: string;
    }[];
  }) => callApi<unknown>('complete-lesson', { method: 'POST', body }),

  telemetry: (body: {
    lessonId?: string;
    events: {
      term: string;
      isCorrect: boolean;
      responseMs?: number;
      skill?: string;
      errorType?: string;
      objectiveId?: string;
      stage?: string;
    }[];
  }) => callApi<{ accepted: number }>('telemetry', { method: 'POST', body }),

  markPart: (body: { lessonId: string; part: 1 | 2 | 3 }) =>
    callApi<{ partsDone: number }>('mark-part', { method: 'POST', body }),

  // ── مرور ────────────────────────────────────────────────────────
  dueReviews: () =>
    callApi<{ items: DueReviewItem[]; count: number; totalDue: number }>('due-reviews'),

  submitReview: (body: {
    answers: { term: string; isCorrect: boolean; responseMs: number }[];
  }) => callApi<{ ok: boolean; updated: number }>('review-submit', { method: 'POST', body }),

  delayedCheck: () =>
    callApi<{ items: DelayedCheckItem[]; fromLessonId?: string }>('delayed-check'),

  delayedSubmit: (body: {
    answers: { term: string; isCorrect: boolean }[];
    lessonId?: string;
  }) => callApi<{ recorded: number }>('delayed-submit', { method: 'POST', body }),

  // ── کالیبراسیون ─────────────────────────────────────────────────
  calibrationTest: (stage?: 'hard') =>
    callApi<{
      alreadyCalibrated: boolean;
      items?: CalibrationItem[];
      calibration?: { estimated: string; scorePct: number } | null;
    }>('calibration-test', { method: 'POST', body: stage ? { stage } : {} }),

  calibrationSubmit: (body: {
    answers: { term: string; isCorrect: boolean; responseMs: number }[];
    hard?: boolean;
  }) =>
    callApi<{
      estimated: string;
      scorePct: number;
      mismatch: boolean;
      stage: string;
    }>('calibration-submit', { method: 'POST', body }),

  // ── نقش‌آفرینی ──────────────────────────────────────────────────
  roleplayStart: () =>
    callApi<RoleplayScenario>('roleplay-start', { method: 'POST', body: {} }),

  roleplayTurn: (body: {
    scenario: string;
    goal: string;
    aiRole: string;
    userRole: string;
    transcript: { role: 'ai' | 'user'; text: string }[];
  }) => callApi<{ reply: string }>('roleplay-turn', { method: 'POST', body }),

  roleplayFinish: (body: {
    scenario: string;
    goal: string;
    aiRole: string;
    userRole: string;
    transcript: { role: 'ai' | 'user'; text: string }[];
  }) => callApi<RoleplayResult>('roleplay-finish', { method: 'POST', body }),

  // ── پروفایل ─────────────────────────────────────────────────────
  onboarding: (body: {
    uiLanguage: string;
    targetLanguage: string;
    skillLevel: string;
    learningGoal: string;
    dailyMinutes: number;
    dialect?: string | null;
    timezone?: string;
  }) => callApi<{ user: UserProfile }>('onboarding', { method: 'POST', body }),

  updateProfile: (body: Record<string, unknown>) =>
    callApi<{ user: UserProfile }>('update-profile', { method: 'POST', body }),

  deleteAccount: () =>
    callApi<{ deleted: boolean }>('delete-account', { method: 'POST', body: {} }),

  // ── فروشگاه ─────────────────────────────────────────────────────
  previewDiscount: (planId: string) =>
    callApiWithQuery<{
      planId: string;
      originalPriceIrr: number;
      finalPriceIrr: number;
      coinDiscountPercent: number;
      coinsUsed: number;
      coinsBalance: number;
    }>('preview-discount', { planId }),

  createInvoice: (planId: string, useCoins = false) =>
    callApi<{ invoiceUrl?: string; paymentUrl?: string; amountIrr?: number; authority?: string }>(
      'create-invoice',
      { method: 'POST', body: { planId, useCoins } }
    ),

  // ── پشتیبانی ────────────────────────────────────────────────────
  supportCreate: (body: { subject: string; body: string; category: string }) =>
    callApi<{ ticket: SupportTicket }>('support-create', { method: 'POST', body }),

  supportList: () => callApi<{ tickets: SupportTicket[] }>('support-list'),

  supportThread: (ticketId: string) =>
    callApi<{ ticket: SupportTicket; messages: SupportMessage[] }>(
      'support-thread',
      { query: { ticketId } }
    ),

  supportReply: (ticketId: string, body: string) =>
    callApi<{ ok: boolean }>('support-reply', {
      method: 'POST',
      body: { ticketId, body },
    }),

  supportClose: (ticketId: string) =>
    callApi<{ ok: boolean }>('support-close', {
      method: 'POST',
      body: { ticketId },
    }),

  // ── پیام‌های ادمین ──────────────────────────────────────────────
  messagesList: () =>
    callApi<{
      messages: { id: string; title: string; body: string; createdAt: string; read: boolean }[];
    }>('messages-list'),

  messagesRead: (ids?: string[]) =>
    callApi<{ ok: boolean }>('messages-read', { method: 'POST', body: { ids } }),
};

export type { Cycle, Lesson, UserProfile, SubscriptionInfo, PlanType };
