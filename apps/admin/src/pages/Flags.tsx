import React, { useState } from 'react';
import { adminApi } from '../api';
import { PageHead, useAsync } from '../App';

/**
 * فلگ‌های قابلیت.
 *
 * هر تغییر باید اتمیک و برگشت‌پذیر باشد. خاموش‌کردن یک قابلیت در سرور
 * اعمال می‌شود، نه در کلاینت — پس کاربر با نسخهٔ قدیمی اپ هم نمی‌تواند
 * از آن استفاده کند.
 */

const KNOWN_FLAGS: { key: string; label: string; description: string }[] = [
  { key: 'demo_mode', label: 'حالت آزمایشی', description: 'ورود بدون گوگل با کاربر تست (فقط MVP).' },
  { key: 'spaced_repetition', label: 'مرور فاصله‌دار', description: 'موتور لایتنر و صف مرور روزانه.' },
  { key: 'roleplay', label: 'نقش‌آفرینی', description: 'گفت‌وگوی آزاد با ارزیابی AI.' },
  { key: 'calibration', label: 'آزمون تعیین سطح', description: 'تولید سؤال سطح‌سنجی در اولین ورود.' },
  { key: 'story_part', label: 'بخش داستان', description: 'بخش سوم درس (داستان + درک مطلب).' },
  { key: 'payments', label: 'پرداخت', description: 'درگاه پرداخت و خرید اشتراک.' },
  { key: 'push_notifications', label: 'اعلان‌ها', description: 'یادآور روزانه با Expo Push.' },
];

export default function Flags() {
  const { data, loading, error, reload } = useAsync(() => adminApi.flags());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flags = data?.flags ?? [];
  const byKey = new Map(flags.map((f) => [f.key, f]));

  const toggle = async (key: string, next: boolean, description?: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await adminApi.flagSet({ key, enabled: next, description });
      setNotice(`${key} → ${next ? 'روشن' : 'خاموش'}`);
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'خطا');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title="قابلیت‌ها" sub="روشن/خاموش کردن قابلیت‌ها در سطح سرور">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-info">{notice}</div> : null}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">در حال بارگذاری…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>قابلیت</th>
                <th>توضیح</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {KNOWN_FLAGS.map((kf) => {
                const row = byKey.get(kf.key);
                const enabled = row?.enabled ?? false;
                return (
                  <tr key={kf.key}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{kf.label}</div>
                      <div className="mono hint">{kf.key}</div>
                    </td>
                    <td className="hint">{row?.description ?? kf.description}</td>
                    <td>
                      <span className={enabled ? 'badge badge-ok' : 'badge'}>
                        {enabled ? 'روشن' : 'خاموش'}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`btn btn-sm ${enabled ? 'btn-danger' : 'btn-primary'}`}
                        disabled={busy === kf.key}
                        onClick={() => toggle(kf.key, !enabled, kf.description)}
                      >
                        {enabled ? 'خاموش کن' : 'روشن کن'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <strong>فلگ‌های ثبت‌نشده</strong>
        <p className="hint" style={{ marginBottom: 0 }}>
          {flags.filter((f) => !KNOWN_FLAGS.some((k) => k.key === f.key)).length === 0
            ? 'همهٔ فلگ‌های دیتابیس در فهرست بالا هستند.'
            : flags
                .filter((f) => !KNOWN_FLAGS.some((k) => k.key === f.key))
                .map((f) => f.key)
                .join('، ')}
        </p>
      </div>
    </>
  );
}
