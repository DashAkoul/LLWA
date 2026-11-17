import { describe, expect, it } from 'vitest';
import { toMapStages, formatDuration, summarizePerformance } from '../ai-planner';
import type { AiStep } from '@llwa/shared';

/**
 * تست‌های تبدیل «گام‌های مدل» به «مراحل نقشه».
 *
 * چرا این تست مهم است: خروجی مدل ساختار مسیر را می‌سازد. اگر این تبدیل
 * اشتباه باشد، موتور تطبیقی هیچ‌وقت مرحله را «آماده» نمی‌بیند و کاربر
 * تا ابد در گام اول می‌ماند — باگ خاموش و بسیار گران.
 */

const step = (overrides: Partial<AiStep> = {}): AiStep => ({
  title: 'Basic greetings',
  titleUi: 'سلام و احوالپرسی',
  objective: 'Greet strangers and respond to greetings in a simple exchange.',
  objectiveUi: 'می‌توانی با غریبه سلام و احوالپرسی کنی و جواب بدهی.',
  skills: ['vocabulary', 'speaking'],
  estimatedCycles: 2,
  milestones: ['Can greet and respond', 'Can introduce yourself'],
  ...overrides,
});

describe('toMapStages', () => {
  it('ترتیب و شناسهٔ مراحل را پیوسته می‌سازد', () => {
    const stages = toMapStages([step(), step({ title: 'Ordering food' })]);
    expect(stages.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(stages.map((s) => s.order)).toEqual([1, 2]);
  });

  it('⚠️ گام دوم به گام اول وابسته است', () => {
    const stages = toMapStages([step(), step(), step()]);
    expect(stages[0]!.prerequisites).toEqual([]);
    expect(stages[1]!.prerequisites).toEqual(['s1']);
    expect(stages[2]!.prerequisites).toEqual(['s2']);
  });

  it('فقط گام اول IN_PROGRESS است و بقیه PLANNED', () => {
    const stages = toMapStages([step(), step()]);
    expect(stages[0]!.status).toBe('IN_PROGRESS');
    expect(stages[1]!.status).toBe('PLANNED');
  });

  it('از نقاط عطف، اهداف قابل اندازه‌گیری می‌سازد', () => {
    const stages = toMapStages([step()]);
    expect(stages[0]!.objectives).toHaveLength(2);
    expect(stages[0]!.objectives![0]!.id).toBe('s1-o1');
    expect(stages[0]!.objectives![0]!.minSamples).toBeGreaterThan(0);
  });

  it('حداقل واژهٔ لازم با اندازهٔ گام مقیاس می‌شود', () => {
    const small = toMapStages([step({ estimatedCycles: 1 })])[0]!;
    const big = toMapStages([step({ estimatedCycles: 6 })])[0]!;
    expect(big.criteria.minMasteredTerms).toBeGreaterThan(small.criteria.minMasteredTerms);
    // سقف منطقی دارد تا معیار غیرقابل‌دسترس نشود
    expect(big.criteria.minMasteredTerms).toBeLessThanOrEqual(30);
  });

  it('startOrder را رعایت می‌کند (افزودن گام به نقشهٔ موجود)', () => {
    const stages = toMapStages([step()], 4);
    expect(stages[0]!.id).toBe('s4');
    expect(stages[0]!.prerequisites).toEqual(['s3']);
  });
});

describe('formatDuration', () => {
  it('هفته را به ماه تبدیل می‌کند', () => {
    expect(formatDuration(13, 30)).toContain('ماه');
    expect(formatDuration(13, 30)).toContain('30');
  });

  it('مسیر کوتاه را به هفته نشان می‌دهد', () => {
    expect(formatDuration(3, 15)).toContain('3 هفته');
  });
});

describe('summarizePerformance', () => {
  it('خلاصهٔ خوانا می‌سازد', () => {
    const s = summarizePerformance({
      accuracyPct: 72.4,
      delayedRecallPct: 55,
      weakTerms: ['though', 'although'],
    });
    expect(s).toContain('accuracy 72%');
    expect(s).toContain('though');
  });

  it('بدون داده null می‌دهد', () => {
    expect(summarizePerformance({})).toBeNull();
  });
});
