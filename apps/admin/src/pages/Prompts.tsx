import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, type PromptRow } from '../api';
import { PageHead, useAsync } from '../App';

/**
 * مدیریت پرامپت‌ها — قلب کنترل آموزشی محصول.
 *
 * پنج فراخوانی خط تولید محتوا، هر کدام یک `task_key` مستقل دارند:
 *   1. placement-test        آزمون تعیین سطح
 *   2. goal-to-steps         هدف → گام‌ها
 *   3. step-to-cycles        گام → چرخه‌های هفتگی
 *   4. cycle-to-lessons      چرخه → سرفصل دروس روزانه
 *   5. lesson-content        ساخت محتوای درس روز
 *
 * ⚠️ قاعدهٔ نسخه‌دار بودن: ویرایش، نسخهٔ **جدید** می‌سازد؛ نسخهٔ منتشرشده
 * هرگز بی‌ردپا تغییر نمی‌کند. «فعال‌کردن» فقط پرچم is_active را جابه‌جا
 * می‌کند و همیشه قابل بازگشت است.
 */

const TASKS: { key: string; label: string; hint: string }[] = [
  {
    key: 'placement-test',
    label: '۱. آزمون تعیین سطح',
    hint: 'ورودی: زبان مبدأ/مقصد، سطح خوداظهاری، هدف. خروجی: سؤال چندگزینه‌ای لغت/گرامر + مهارت‌های چهارگانه.',
  },
  {
    key: 'goal-to-steps',
    label: '۲. هدف → گام‌ها',
    hint: 'ورودی: زبان مقصد، هدف، نتیجهٔ تعیین سطح. خروجی: گام‌ها و نقطه‌عطف پایان هر گام.',
  },
  {
    key: 'step-to-cycles',
    label: '۳. گام → چرخه‌های هفتگی',
    hint: 'ورودی: نقطه‌عطف گام قبل و گام حاضر + عملکرد کاربر. خروجی: چرخه‌ها و نقطه‌عطف هر چرخه.',
  },
  {
    key: 'cycle-to-lessons',
    label: '۴. چرخه → سرفصل دروس',
    hint: 'ورودی: نقطه‌عطف چرخه قبل و چرخه حاضر + عملکرد کاربر. خروجی: سرفصل ۷ روز.',
  },
  {
    key: 'lesson-content',
    label: '۵. محتوای درس روز',
    hint: 'ورودی: سرفصل همان روز. خروجی: محتوای کامل درس متناسب با زمان روزانهٔ کاربر.',
  },
];

export default function Prompts() {
  const { data, loading, error, reload } = useAsync(() => adminApi.prompts());
  const [taskKey, setTaskKey] = useState(TASKS[0]!.key);
  const [body, setBody] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const all: PromptRow[] = data?.prompts ?? [];

  const forTask = useMemo(
    () => all.filter((p) => p.task_key === taskKey).sort((a, b) => b.version - a.version),
    [all, taskKey]
  );

  const active = forTask.find((p) => p.is_active) ?? null;

  // با تغییر تسک، متن ویرایشگر را با نسخهٔ فعال پر کن
  useEffect(() => {
    setBody(active?.body ?? '');
    setNotes('');
  }, [taskKey, active?.id]);

  const save = async (activate: boolean) => {
    if (body.trim().length < 20) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await adminApi.promptSave({ taskKey, body, notes: notes || undefined, activate });
      setNotice(
        activate
          ? `نسخهٔ ${res.prompt.version} ذخیره و فعال شد.`
          : `نسخهٔ ${res.prompt.version} به‌صورت پیش‌نویس ذخیره شد.`
      );
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  const activateVersion = async (id: string) => {
    setBusy(true);
    try {
      await adminApi.promptActivate({ id });
      setNotice('نسخهٔ انتخابی فعال شد.');
      reload();
    } finally {
      setBusy(false);
    }
  };

  const currentTask = TASKS.find((t) => t.key === taskKey)!;

  return (
    <>
      <PageHead title="پرامپت‌ها" sub="نسخه‌بندی و انتشار پرامپت هر فراخوانی هوش مصنوعی">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-info">{notice}</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <strong style={{ display: 'block', marginBottom: 10 }}>انتخاب وظیفه</strong>
          {TASKS.map((t) => {
            const isActive = t.key === taskKey;
            const hasActive = all.some((p) => p.task_key === t.key && p.is_active);
            return (
              <button
                key={t.key}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setTaskKey(t.key)}
                style={{ marginBottom: 4 }}
              >
                <span style={{ flex: 1, textAlign: 'right' }}>{t.label}</span>
                <span className={hasActive ? 'badge badge-ok' : 'badge badge-warn'}>
                  {hasActive ? 'فعال' : 'پیش‌فرض'}
                </span>
              </button>
            );
          })}
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            {currentTask.hint}
          </p>
        </div>

        <div className="card">
          <strong style={{ display: 'block', marginBottom: 10 }}>نسخه‌ها</strong>
          {loading ? (
            <div className="empty">…</div>
          ) : forTask.length === 0 ? (
            <div className="empty">هنوز نسخه‌ای ثبت نشده — پرامپت پیش‌فرض کد استفاده می‌شود.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>نسخه</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {forTask.map((p) => (
                  <tr key={p.id}>
                    <td>v{p.version}</td>
                    <td>
                      <span className={p.is_active ? 'badge badge-ok' : 'badge'}>
                        {p.is_active ? 'فعال' : 'آرشیو'}
                      </span>
                    </td>
                    <td className="hint">{new Date(p.created_at).toLocaleDateString('fa-IR')}</td>
                    <td>
                      <div className="row">
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setBody(p.body)}
                          disabled={p.is_active}
                        >
                          بارگذاری
                        </button>
                        {!p.is_active ? (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => activateVersion(p.id)}
                            disabled={busy}
                          >
                            فعال‌سازی
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <strong>ویرایش — {currentTask.label}</strong>
          <span className="hint">{body.length} کاراکتر</span>
        </div>

        <div className="field">
          <label className="label">متن پرامپت (انگلیسی، دستورهای سیستمی)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the system instruction for this task…"
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label className="label">یادداشت تغییر (اختیاری)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثلاً: سخت‌تر کردن گزینه‌های انحرافی"
          />
        </div>

        <div className="row">
          <button className="btn btn-primary" onClick={() => save(true)} disabled={busy || body.trim().length < 20}>
            ذخیره و فعال‌سازی
          </button>
          <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy || body.trim().length < 20}>
            ذخیره به‌عنوان پیش‌نویس
          </button>
        </div>

        <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
          ⚠️ ذخیره همیشه نسخهٔ جدید می‌سازد. بازگشت به نسخهٔ قبل با دکمهٔ «فعال‌سازی» در جدول انجام می‌شود.
        </p>
      </div>
    </>
  );
}
