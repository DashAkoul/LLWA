import React, { useState } from 'react';
import { adminApi } from '../api';
import { PageHead, useAsync } from '../App';

/**
 * پلن‌ها و قیمت‌گذاری.
 *
 * ⚠️ قیمت‌ها منبع واحد فروشگاه و ربات هستند. تغییر اینجا فوراً روی قیمت
 * نمایشی اپ اثر می‌گذارد، پس هر تغییر باید در audit log ثبت شود.
 */
export default function Plans() {
  const { data, loading, error, reload } = useAsync(() => adminApi.plans());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const plans = (data?.plans ?? []) as Record<string, unknown>[];

  const update = async (plan: Record<string, unknown>, patch: Record<string, unknown>) => {
    setBusy(String(plan.id));
    setNotice(null);
    try {
      await adminApi.planUpdate({ id: plan.id, ...patch });
      setNotice('ذخیره شد.');
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title="پلن و قیمت" sub="قیمت، مدت، تخفیف و فعال/غیرفعال بودن هر پلن">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">در حال بارگذاری…</div>
        ) : plans.length === 0 ? (
          <div className="empty">پلنی ثبت نشده.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>پلن</th>
                <th>مدت (روز)</th>
                <th>قیمت (تومان)</th>
                <th>تخفیف ٪</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const id = String(p.id ?? p.plan_type ?? '');
                const active = Boolean(p.is_active);
                return (
                  <tr key={id}>
                    <td>{String(p.title_fa ?? p.titleFa ?? id)}</td>
                    <td>
                      <input
                        type="number"
                        defaultValue={Number(p.duration_days ?? p.durationDays ?? 0)}
                        onBlur={(e) =>
                          update(p, { durationDays: Number(e.target.value) })
                        }
                        style={{ width: 80, padding: '5px 8px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={Number(p.price_irr ?? p.priceIrr ?? 0)}
                        onBlur={(e) => update(p, { priceIrr: Number(e.target.value) })}
                        style={{ width: 130, padding: '5px 8px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={Number(p.discount_percent ?? p.discountPercent ?? 0)}
                        onBlur={(e) =>
                          update(p, { discountPercent: Number(e.target.value) })
                        }
                        style={{ width: 70, padding: '5px 8px' }}
                      />
                    </td>
                    <td>
                      <span className={active ? 'badge badge-ok' : 'badge'}>
                        {active ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busy === id}
                        onClick={() => update(p, { isActive: !active })}
                      >
                        {active ? 'غیرفعال کن' : 'فعال کن'}
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
        <strong>یادآوری</strong>
        <p className="hint" style={{ marginBottom: 0 }}>
          تخفیف سکه در فروشگاه از نرخ تنظیم‌شده در بخش «قابلیت‌ها» محاسبه می‌شود، نه از ستون تخفیف این جدول.
        </p>
      </div>
    </>
  );
}
