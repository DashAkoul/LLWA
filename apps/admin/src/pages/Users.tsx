import React, { useState } from 'react';
import { adminApi } from '../api';
import { PageHead, useAsync } from '../App';

/**
 * کاربران — جست‌وجو، مشاهده و اعطا/لغو اشتراک.
 *
 * ⚠️ شناسهٔ اصلی `userId` (UUID) است، نه `telegram_id`. کاربران اپ موبایل
 * تلگرام ندارند، پس هر عملیاتی که فقط با telegramId کار می‌کرد برای آن‌ها
 * شکست می‌خورد.
 */
export default function Users() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [planType, setPlanType] = useState('1_MONTH');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useAsync(
    () => adminApi.users({ limit: 50, q: q || undefined }),
    [q]
  );

  const users = (data?.users ?? []) as Record<string, unknown>[];

  const doGift = async (userId: string) => {
    setError(null);
    setNotice(null);
    try {
      await adminApi.gift({ userId, planType });
      setNotice('اشتراک اعطا شد.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا');
    }
  };

  const doRevoke = async (userId: string) => {
    setError(null);
    setNotice(null);
    try {
      await adminApi.revoke({ userId });
      setNotice('اشتراک لغو شد.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا');
    }
  };

  return (
    <>
      <PageHead title="کاربران" sub="جست‌وجو بر اساس ایمیل/نام، اعطا و لغو اشتراک">
        <input
          type="text"
          placeholder="جست‌وجو…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 220 }}
        />
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {loadError ? <div className="alert alert-error">{loadError}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">در حال بارگذاری…</div>
        ) : users.length === 0 ? (
          <div className="empty">کاربری پیدا نشد.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>ایمیل</th>
                <th>سطح</th>
                <th>اشتراک</th>
                <th>زنجیره</th>
                <th>سکه</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const id = String(u.id ?? '');
                const days = Number(u.daysRemaining ?? 0);
                return (
                  <tr key={id}>
                    <td>{String(u.displayName ?? u.firstName ?? '—')}</td>
                    <td className="mono">{String(u.email ?? '—')}</td>
                    <td>{String(u.skillLevel ?? '—')}</td>
                    <td>
                      {u.planType ? (
                        <span className={days > 0 ? 'badge badge-ok' : 'badge badge-warn'}>
                          {String(u.planType)} · {days} روز
                        </span>
                      ) : (
                        <span className="badge">—</span>
                      )}
                    </td>
                    <td>{String(u.streakCount ?? 0)}</td>
                    <td>{String(u.starsBalance ?? 0)}</td>
                    <td>
                      <div className="row">
                        <button className="btn btn-sm btn-ghost" onClick={() => setSelected(u)}>
                          جزئیات
                        </button>
                        <select
                          value={planType}
                          onChange={(e) => setPlanType(e.target.value)}
                          style={{ width: 110, padding: '5px 8px', fontSize: 12 }}
                          aria-label="نوع پلن"
                        >
                          <option value="2_WEEKS">۲ هفته</option>
                          <option value="1_MONTH">۱ ماه</option>
                          <option value="3_MONTHS">۳ ماه</option>
                          <option value="6_MONTHS">۶ ماه</option>
                          <option value="1_YEAR">۱ سال</option>
                        </select>
                        <button className="btn btn-sm btn-primary" onClick={() => doGift(id)}>
                          اعطا
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => doRevoke(id)}>
                          لغو
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected ? (
        <div className="card">
          <div className="row-between">
            <strong>جزئیات کاربر</strong>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>
              بستن
            </button>
          </div>
          <pre className="mono" style={{ overflow: 'auto', maxHeight: 300, marginTop: 10 }}>
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      ) : null}
    </>
  );
}
