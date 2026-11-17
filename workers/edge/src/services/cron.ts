import type { Env } from '../types';
import { ContentRepository } from './repository';
import { SupabaseClient } from './supabase';
import {
  LESSON_CONTENT_VERSION,
  runCycleGeneration,
  runLessonGeneration,
} from '../routes/learn';

/**
 * ═════════════════════════════════════════════════════════════════════
 *  کارهای زمان‌بندی‌شده (Cloudflare Cron Triggers)
 *
 *  سه کرون در `wrangler.toml` تعریف شده بود ولی **هیچ handler ای وجود نداشت**
 *  — یعنی تریگرها فعال بودند و هیچ کاری نمی‌کردند. این فایل همان handler است.
 *
 *  چرا Cron و نه Queues: Cloudflare Queues/Workflows فقط روی پلن پولی فعال
 *  است («The specified queue settings are invalid»). Cron روی پلن رایگان
 *  کار می‌کند و برای این حجم کافی است. اگر روزی پلن ارتقا یافت،
 *  `GENERATION_QUEUE` را در wrangler.toml اضافه کنید؛ کد خودکار از صف
 *  استفاده می‌کند و این کرون نقش «تور اطمینان» را بازی می‌کند.
 * ═════════════════════════════════════════════════════════════════════
 */

function repo(env: Env): ContentRepository {
  return new ContentRepository(new SupabaseClient(env), env);
}

// ═════════════════════════════════════════════════════════════════════
// ۱. ساعتی — انقضای اشتراک‌ها  (cron: 0 * * * *)
// ═════════════════════════════════════════════════════════════════════

export async function runHourlyMaintenance(
  env: Env
): Promise<{
  expired: number;
  prunedCache: number;
  stripped: number;
  deletedOld: boolean;
  prunedAiLog: boolean;
  alerted: boolean;
}> {
  const r = repo(env);
  const overdue = await r.listOverdueSubscriptions(200);
  if (overdue.length > 0) {
    await r.expireSubscriptions(overdue.map((s) => s.id));
  }

  // ── پاکسازی کش کهنه ──────────────────────────────────────────────
  // ⚠️ محافظه‌کارانه: فقط ردیف‌هایی که ۱۸۰ روز دست‌نخورده مانده‌اند و
  // کمتر از ۲ بار استفاده شده‌اند. هر حذف = تولید دوباره = هزینهٔ AI،
  // پس این کار فقط «آشغال» را می‌برد، نه محتوای مفید.
  const prunedCache = await r.pruneContentCache(180, 2);

  // ── نگهداری تلمتری (حریم خصوصی) ─────────────────────────────────
  // ⚠️ متن خام پاسخ/مکالمه بعد از ۹۰ روز حذف می‌شود؛ ردیف‌ها بعد از
  // ۲۴ ماه کاملاً پاک می‌شوند. بدون این، دادهٔ متنی برای همیشه می‌ماند.
  const textCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const stripped = await r.stripOldTelemetryText(textCutoff, 200);

  const deleteCutoff = new Date(Date.now() - 730 * 86_400_000).toISOString();
  const deletedOld = await r.deleteTelemetryOlderThan(deleteCutoff);

  // لاگ AI: ۱۸۰ روز کافی است (بودجهٔ توکن فقط ۲۴ ساعت را می‌بیند)
  const aiCutoff = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const prunedAiLog = await r.deleteAiAttemptsOlderThan(aiCutoff);

  /**
   * ⚠️ هشدار سلامت: اگر در یک ساعت اخیر ≥۵ تلاش AI شکست خورده باشد، به
   * مدیر پیام می‌دهیم. بدون این، خرابی provider فقط با شکایت کاربر فهمیده
   * می‌شد. چون این تابع ساعتی اجرا می‌شود، حداکثر یک هشدار در ساعت است.
   */
  let alerted = false;
  try {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const failures = await r.countFailedAiAttempts(since);
    if (failures >= 5) {
      // ⚠️ قبلاً اینجا به ادمین‌ها در تلگرام پیام می‌رفت. با منسوخ شدن
      // مینی‌اپ، هشدار به لاگ منتقل شد تا در پنل ابری دیده شود.
      console.error(
        `[cron:alert] ${failures} failed AI attempts in the last hour — check providers in the admin panel`
      );
      alerted = true;
    }
  } catch {
    /* هشدار هرگز نباید کرون را بشکند */
  }

  return {
    expired: overdue.length,
    prunedCache,
    stripped,
    deletedOld,
    prunedAiLog,
    alerted,
  };
}

// ═════════════════════════════════════════════════════════════════════
// ۲. هر ۵ دقیقه — تولید پس‌زمینهٔ دروس  (cron: */5 * * * *)
//
//    جایگزین رایگان و قابل‌اعتماد صف:
//      الف) چرخه‌های نیمه‌کاره (GENERATING بدون درس) را کامل کن
//      ب) درس‌های خالی را از قبل بساز تا کاربر انتظار نکشد
//
//    هر اجرا تعداد محدودی کار انجام می‌دهد تا سهمیهٔ زمان کرون رعایت شود.
// ═════════════════════════════════════════════════════════════════════

export async function runBackgroundGeneration(
  env: Env,
  opts: { maxCycles?: number; maxLessons?: number; budgetMs?: number } = {}
): Promise<{ cycles: number; lessons: number; failed: number; retried: number }> {
  const maxCycles = opts.maxCycles ?? 1;
  const maxLessons = opts.maxLessons ?? 2;
  const budgetMs = opts.budgetMs ?? 60_000;
  const t0 = Date.now();

  const r = repo(env);
  let cycles = 0;
  let lessons = 0;
  let failed = 0;
  let retried = 0;

  // ⚠️ ترتیب مهم است: درس‌ها **اول**.
  //
  // تجربهٔ عملی: تولید یک چرخهٔ گیرکرده می‌تواند کل بودجهٔ ۶۰ ثانیه‌ای کرون
  // را با یک timeout بخورد و هیچ درسی ساخته نشود (لاگ: lessons=0 failed=1).
  // کاربر مستقیماً درس روز بعد را می‌خواهد، پس اول او.
  const lessonsBudget = Math.floor(budgetMs * 0.6);

  // ── الف) درس‌هایی که محتوا لازم دارند (خالی یا نسخهٔ قدیمی) ─────────
  const missing = await r.listLessonsNeedingContent(LESSON_CONTENT_VERSION, maxLessons);
  for (const l of missing) {
    if (Date.now() - t0 > lessonsBudget) break;
    const res = await runLessonGeneration(
      env,
      l.user_id,
      l.cycle_id,
      l.cycle_number,
      l.day_number
    );
    if (res.ok) lessons += 1;
    else failed += 1;
  }

  // ── ب) چرخه‌های نیمه‌کاره (بودجهٔ جدا) ──────────────────────────────
  //
  // چرخه‌ای که ردیف درس دارد ولی ACTIVE نشده، هرگز ترمیم نمی‌شد.
  // روز ۱ آماده → فعال‌سازی (صفر هزینهٔ AI)؛ وگرنه تولید دوباره.
  const cyclesStart = Date.now();
  const stuck = await r.listStaleGeneratingCycles(10 * 60_000, maxCycles);
  for (const cyc of stuck) {
    if (Date.now() - cyclesStart > budgetMs - lessonsBudget) break;
    const cycLessons = await r.getLessonsForCycle(cyc.id);
    const day1 = cycLessons.find((l) => l.day_number === 1);
    const day1Ready =
      day1?.part_1_data && Object.keys(day1.part_1_data as object).length > 0;
    if (day1Ready) {
      await r.activateCycleWithFirstLesson(cyc.id);
      cycles += 1;
      continue;
    }
    const res = await runCycleGeneration(env, cyc.user_id, cyc.cycle_number, {
      firstOnly: true,
    });
    if (res.ok) cycles += 1;
    else failed += 1;
  }

  // ── ج) چرخه‌های FAILED قدیمی (فقط اگر زمانی مانده باشد) ─────────────
  if (Date.now() - t0 < budgetMs) {
    const staleMinutes = 30;
    const failedCycles = await r.listFailedCyclesForRetry(
      staleMinutes * 60_000,
      maxCycles
    );
    for (const cyc of failedCycles) {
      if (Date.now() - t0 > budgetMs) break;
      const res = await runCycleGeneration(env, cyc.user_id, cyc.cycle_number, {
        firstOnly: true,
      });
      if (res.ok) retried += 1;
      else failed += 1;
    }
  }

  return { cycles, lessons, failed, retried };
}

// ═════════════════════════════════════════════════════════════════════
// ۳. روزانه ۹ صبح — یادآور درس  (cron: 0 9 * * *)
// ═════════════════════════════════════════════════════════════════════

const NUDGE: Record<string, string> = {
  fa: 'سلام {name} 👋\nوقتشه چند دقیقه زبان تمرین کنی.\nدرس امروزت آماده است 🚀',
  en: 'Hi {name} 👋\nTime for a few minutes of language practice.\nToday’s lesson is ready 🚀',
  ar: 'مرحباً {name} 👋\nحان وقت التمرين لبضع دقائق.\nدرس اليوم جاهز 🚀',
  tr: 'Merhaba {name} 👋\nBirkaç dakika pratik yapma zamanı.\nBugünkü dersin hazır 🚀',
  ru: 'Привет, {name} 👋\nПора немного позаниматься.\nУрок на сегодня готов 🚀',
};

/**
 * یادآور روزانه — **به وقت و ساعتی که خود کاربر در تنظیمات انتخاب کرده**.
 *
 * ⚠️ قبلاً همیشه ساعت ۹ محلی بود و انتخاب کاربر نادیده گرفته می‌شد.
 * حالا `reminderOn` و `reminderTime` (HH:MM) از `app_settings` خوانده می‌شود
 * و این تابع از کرونِ هر ۵ دقیقه اجرا می‌شود تا پنجرهٔ ±۵ دقیقه‌ای دقیق باشد.
 */
