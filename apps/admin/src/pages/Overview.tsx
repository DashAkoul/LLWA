import React from 'react';
import { adminApi } from '../api';
import { PageHead, useAsync } from '../App';

/** نمای کلی — شاخص‌های سلامت محصول در یک نگاه. */
export default function Overview() {
  const { data, loading, error, reload } = useAsync(() => adminApi.stats());

  const stats = (data ?? {}) as Record<string, unknown>;
  const num = (key: string): string => {
    const v = stats[key];
    return typeof v === 'number' ? v.toLocaleString('fa-IR') : typeof v === 'string' ? v : '—';
  };

  return (
    <>
      <PageHead title="نمای کلی" sub="وضعیت کاربران، درآمد و مصرف هوش مصنوعی">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <div className="empty">در حال بارگذاری…</div> : null}

      {!loading ? (
        <>
          <div className="grid grid-3">
            <Stat label="کل کاربران" value={num('totalUsers')} />
            <Stat label="کاربران فعال" value={num('activeUsers')} />
            <Stat label="اشتراک فعال" value={num('activeSubscriptions')} />
            <Stat label="چرخه‌های در جریان" value={num('activeCycles')} />
            <Stat label="درس‌های تکمیل‌شده" value={num('completedLessons')} />
            <Stat label="تیکت‌های باز" value={num('openTickets')} />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="row-between">
              <strong>مصرف هوش مصنوعی</strong>
              <span className="hint">۲۴ ساعت گذشته</span>
            </div>
            <div className="grid grid-3" style={{ marginTop: 12 }}>
              <Stat label="توکن مصرفی" value={num('aiTokens24h')} />
              <Stat label="فراخوانی موفق" value={num('aiOk24h')} />
              <Stat label="فراخوانی ناموفق" value={num('aiFailed24h')} />
            </div>
          </div>

          <div className="card">
            <strong>پاسخ خام سرور</strong>
            <p className="hint" style={{ marginTop: 4 }}>
              اگر شاخصی «—» است یعنی این نسخهٔ API آن را برنمی‌گرداند.
            </p>
            <pre className="mono" style={{ overflow: 'auto', maxHeight: 260 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
