import type { Env } from '../types';
import { SupabaseClient } from './supabase';

/**
 * رجیستری پرامپت و فلگ‌ها — لایهٔ مشترک بین موتور AI و کنسول مدیریت.
 *
 * ⚠️ چرا اینجا و نه در `routes/admin-console.ts`: موتور AI نباید به لایهٔ
 * HTTP وابسته شود (چرخهٔ معکوس). تعریف در service است و هم route و هم
 * engine از آن می‌خوانند.
 *
 * رفتار محافظه‌کارانه: هر خطا (شبکه/جدول غایب) → `null`/`false`، تا نبودِ
 * پرامپت هیچ‌وقت تولید محتوا را نشکند و پرامپت پیش‌فرض کد اجرا شود.
 */

export const PROMPT_TASK_KEYS = [
  'placement-test',
  'goal-to-steps',
  'step-to-cycles',
  'cycle-to-lessons',
  'lesson-content',
] as const;

export type PromptTaskKey = (typeof PROMPT_TASK_KEYS)[number];

export function isPromptTaskKey(value: unknown): value is PromptTaskKey {
  return typeof value === 'string' && (PROMPT_TASK_KEYS as readonly string[]).includes(value);
}

/**
 * پرامپت فعال یک وظیفه.
 * اگر نسخهٔ فعالی در دیتابیس نباشد `null` برمی‌گردد.
 */
export async function activePrompt(
  env: Env,
  taskKey: PromptTaskKey
): Promise<string | null> {
  try {
    const db = new SupabaseClient(env);
    const rows = (await db.select<{ body: string }>('ai_prompts', {
      select: 'body',
      task_key: `eq.${taskKey}`,
      is_active: 'eq.true',
      limit: '1',
    })) as { body: string }[];
    const body = rows?.[0]?.body?.trim();
    return body && body.length > 0 ? body : null;
  } catch {
    return null;
  }
}

/**
 * ترکیب پرامپت ادمین با پرامپت پیش‌فرض.
 *
 * ⚠️ عمداً «جایگزینی» نیست، «افزودن» است: پرامپت پیش‌فرض شامل زمینهٔ
 * پویا (سطح، نقاط ضعف، اسکیمای JSON، بودجهٔ زمانی) است که ادمین در پنل
 * نمی‌بیند. اگر کل آن را دور می‌ریختیم، خروجی مدل اعتبارسنجی‌ناپذیر
 * می‌شد. پس دستور ادمین اول می‌آید و قواعد سیستمی بعد از آن.
 */
export function mergePrompt(override: string | null, base: string): string {
  if (!override) return base;
  return `${override}\n\n---\n\n${base}`;
}

/** آیا یک قابلیت روشن است؟ */
export async function isFlagEnabled(env: Env, key: string): Promise<boolean> {
  try {
    const db = new SupabaseClient(env);
    const rows = (await db.select<{ enabled: boolean }>('feature_flags', {
      select: 'enabled',
      key: `eq.${key}`,
      limit: '1',
    })) as { enabled: boolean }[];
    return Boolean(rows?.[0]?.enabled);
  } catch {
    return false;
  }
}
