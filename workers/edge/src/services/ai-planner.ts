import type { AiCyclePlan, AiDayPlan, AiMapPlan, AiStep } from '@llwa/shared';
import type { LearningMap, MapStage, StageObjective } from '@llwa/shared';
import type { Env } from '../types';
import type { AiEngine } from './ai-engine';

/**
 * برنامه‌ریز نقشه — پل بین خروجی مدل و ساختار `LearningMap`.
 *
 * ⚠️ اصل محصول: «نقشهٔ ثابت، اجرای تطبیقی».
 * این ماژول نقشه را **یک بار** می‌سازد (یا با درخواست صریح کاربر بازسازی
 * می‌کند). تطبیق چرخه‌به‌چرخه جای دیگری انجام می‌شود و اجازه ندارد ساختار
 * گام‌ها را عوض کند.
 *
 * اگر مدل خروجی نامعتبر بدهد، همهٔ توابع `null` برمی‌گردانند تا لایهٔ
 * بالاتر به نقشهٔ قطعی (`buildLearningMap`) برگردد — هیچ‌وقت مسیر نیمه‌کاره
 * ذخیره نمی‌شود.
 */

/** معیار پیش‌فرض عبور از یک گام */
const DEFAULT_CRITERIA = { minAccuracy: 75, minMasteredTerms: 12, maxWeakTerms: 3 };

/**
 * تبدیل گام‌های مدل به مراحل نقشه.
 *
 * خالص و بدون I/O — قابل تست.
 *
 * ⚠️ `prerequisites` زنجیره‌ای است: گام n به گام n-1 وابسته است. اگر
 * خالی بماند، `currentStage` هیچ‌وقت جلو نمی‌رود چون هیچ مرحله‌ای «آماده»
 * تشخیص داده نمی‌شود.
 */
export function toMapStages(steps: AiStep[], startOrder = 1): MapStage[] {
  return steps.map((step, index) => {
    const order = startOrder + index;
    const id = `s${order}`;

    // اهداف قابل اندازه‌گیری از نقاط عطف ساخته می‌شوند تا موتور ارزیابی
    // بتواند هر کدام را جدا بسنجد (نه یک «تسلط» کلی و مبهم).
    const objectives: StageObjective[] = step.milestones.slice(0, 4).map((m, i) => ({
      id: `${id}-o${i + 1}`,
      titleUi: m,
      skill: step.skills[i % step.skills.length] ?? 'vocabulary',
      minAccuracy: 70,
      minSamples: 6,
    }));

    return {
      id,
      order,
      title: step.title,
      titleUi: step.titleUi,
      objective: step.objective,
      objectiveUi: step.objectiveUi,
      skills: step.skills,
      prerequisites: order > 1 ? [`s${order - 1}`] : [],
      criteria: {
        ...DEFAULT_CRITERIA,
        // گام‌های بزرگ‌تر واژهٔ بیشتری می‌خواهند؛ تخمین محافظه‌کارانه
        minMasteredTerms: Math.max(8, Math.min(30, step.estimatedCycles * 8)),
      },
      objectives,
      status: order === 1 ? 'IN_PROGRESS' : 'PLANNED',
      estimatedCycles: step.estimatedCycles,
      masteredAt: null,
    };
  });
}

export interface MapPlanInput {
  targetLanguage: string;
  uiLanguage: string;
  goal: string;
  selfReportedLevel: string;
  placementLevel?: string | null;
  placementScorePct?: number | null;
  dailyMinutes: number;
}

export interface MapPlanResult {
  /** مراحل آماده برای جای‌گذاری در نقشه — یا null اگر مدل شکست خورد */
  stages: MapStage[] | null;
  outcomeUi: string | null;
  estimatedWeeks: number | null;
  /** متن توضیحی برای نمایش «چقدر طول می‌کشد» */
  estimatedLabel: string | null;
  model: string | null;
}

/**
 * فراخوانی #۲ — ساخت گام‌ها.
 * این تابع هیچ‌چیز را ذخیره نمی‌کند؛ ذخیره با لایهٔ route است.
 */
export async function planStages(
  engine: AiEngine,
  input: MapPlanInput
): Promise<MapPlanResult> {
  const empty: MapPlanResult = {
    stages: null,
    outcomeUi: null,
    estimatedWeeks: null,
    estimatedLabel: null,
    model: null,
  };

  try {
    const res = await engine.planMap(input);
    const plan: AiMapPlan | null = res.plan;
    if (!plan || plan.steps.length < 2) return empty;

    const stages = toMapStages(plan.steps);
    return {
      stages,
      outcomeUi: plan.outcomeUi,
      estimatedWeeks: plan.estimatedWeeks,
      estimatedLabel: formatDuration(plan.estimatedWeeks, input.dailyMinutes),
      model: res.model,
    };
  } catch {
    return empty;
  }
}

/**
 * فراخوانی #۳ — گام → چرخه‌ها.
 */
export async function planStageCycles(
  engine: AiEngine,
  input: {
    targetLanguage: string;
    uiLanguage: string;
    goal: string;
    previousMilestone: string;
    currentMilestone: string;
    performance?: string | null;
    estimatedCycles: number;
  }
): Promise<AiCyclePlan[] | null> {
  try {
    const res = await engine.planStepCycles({
      ...input,
      maxCycles: Math.max(1, Math.min(8, input.estimatedCycles)),
    });
    if (!res.cycles || res.cycles.length === 0) return null;

    // ⚠️ محدود کردن به سقف گام: مدل گاهی بیشتر از تخمین می‌سازد و مسیر
    // بی‌دلیل کش می‌آید.
    return res.cycles.slice(0, Math.max(1, input.estimatedCycles));
  } catch {
    return null;
  }
}

/**
 * فراخوانی #۴ — چرخه → سرفصل هفت روز.
 *
 * ⚠️ اگر مدل روزها را نامرتب یا ناقص بدهد، خروجی دور ریخته می‌شود.
 * ترتیب آموزشی چرخه ثابت است و نمی‌توان آن را به مدل سپرد.
 */
export async function planCycleDays(
  engine: AiEngine,
  input: {
    targetLanguage: string;
    uiLanguage: string;
    previousMilestone: string;
    cycleMilestone: string;
    performance?: string | null;
    dailyMinutes: number;
    knownTerms?: string[];
  }
): Promise<CycleSyllabus | null> {
  try {
    const res = await engine.planCycleSyllabus(input);
    const plan = res.plan;
    if (!plan || plan.days.length !== 7) return null;

    const sorted = [...plan.days].sort((a, b) => a.dayNumber - b.dayNumber);
    const numbersOk = sorted.every((d, i) => d.dayNumber === i + 1);
    if (!numbersOk) return null;

    // نوع روزها قفل است: ۱..۵ آموزشی، ۶ سنجش پنهان، ۷ تثبیت
    const kindsOk =
      sorted.slice(0, 5).every((d) => d.kind === 'TEACHING') &&
      sorted[5]?.kind === 'HIDDEN_ASSESSMENT' &&
      sorted[6]?.kind === 'CONSOLIDATION';
    if (!kindsOk) return null;

    return { ...plan, days: sorted };
  } catch {
    return null;
  }
}

/** طرح چرخه پس از اعتبارسنجی */
export interface CycleSyllabus {
  title: string;
  titleUi: string;
  focusSummary: string;
  days: AiDayPlan[];
}

/**
 * جای‌گذاری گام‌های تازه در نقشه — با ثبت سابقه.
 *
 * ⚠️ نسخه افزایش می‌یابد و دلیل تغییر ثبت می‌شود، چون قاعدهٔ ممیزی
 * می‌گوید هر تغییر معنادار مسیر باید دلیل و نسخه داشته باشد.
 */
export function applyStagesToMap(
  map: LearningMap,
  stages: MapStage[],
  reason: string
): LearningMap {
  const previousCurrent = map.currentStageId;
  return {
    ...map,
    version: map.version + 1,
    updatedAt: new Date().toISOString(),
    stages,
    currentStageId: stages[0]?.id ?? map.currentStageId,
    history: [
      ...(map.history ?? []),
      {
        at: new Date().toISOString(),
        kind: 'REVISED' as const,
        from: previousCurrent,
        to: stages[0]?.id ?? null,
        reason,
      },
    ].slice(-50),
  };
}

/** برچسب انسانی مدت مسیر */
export function formatDuration(weeks: number, dailyMinutes: number): string {
  const months = weeks / 4.345;
  const parts: string[] = [];
  if (months >= 1) parts.push(`${Math.round(months)} ماه`);
  else parts.push(`${weeks} هفته`);
  if (dailyMinutes > 0) parts.push(`روزی ${dailyMinutes} دقیقه`);
  return parts.join(' · ');
}

/**
 * جمع‌بندی عملکرد کاربر برای ورودی فراخوانی‌های ۳ و ۴.
 * متن کوتاه و بدون داده‌های شخصی — فقط آنچه برای تنظیم مسیر لازم است.
 */
export function summarizePerformance(input: {
  accuracyPct?: number | null;
  delayedRecallPct?: number | null;
  helpRatePct?: number | null;
  weakTerms?: string[];
  strongTerms?: string[];
}): string | null {
  const bits: string[] = [];
  if (typeof input.accuracyPct === 'number') {
    bits.push(`accuracy ${Math.round(input.accuracyPct)}%`);
  }
  if (typeof input.delayedRecallPct === 'number') {
    bits.push(`delayed recall ${Math.round(input.delayedRecallPct)}%`);
  }
  if (typeof input.helpRatePct === 'number' && input.helpRatePct > 0) {
    bits.push(`needed hints in ${Math.round(input.helpRatePct)}% of items`);
  }
  if (input.weakTerms?.length) {
    bits.push(`weak terms: ${input.weakTerms.slice(0, 8).join(', ')}`);
  }
  if (input.strongTerms?.length) {
    bits.push(`already solid: ${input.strongTerms.slice(0, 8).join(', ')}`);
  }
  return bits.length ? bits.join('; ') : null;
}

/** نوع خروجی برای مصرف در route */
export type { AiCyclePlan, AiDayPlan };

/** کمکی برای تست: خواندن واژه‌های موجود فرهنگ (در صورت نیاز در آینده) */
export function pickKnownTerms(all: string[], limit = 60): string[] {
  return all.filter(Boolean).slice(0, limit);
}

// اشاره به Env تا در آینده برای fetch واژه‌ها استفاده شود
export type PlannerEnv = Env;
