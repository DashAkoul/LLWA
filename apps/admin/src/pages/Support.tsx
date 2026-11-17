import React, { useState } from 'react';
import { adminApi } from '../api';
import { PageHead, useAsync } from '../App';

/** پشتیبانی — صف تیکت‌ها و پاسخ‌دهی. */
export default function Support() {
  const { data, loading, error, reload } = useAsync(() => adminApi.supportList());
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<Record<string, unknown> | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const tickets = (data?.tickets ?? []) as Record<string, unknown>[];

  const open = async (id: string) => {
    setOpenId(id);
    setThread(null);
    try {
      const res = await adminApi.supportThread(id);
      setThread(res);
    } catch (err) {
      setThread({ error: err instanceof Error ? err.message : 'خطا' });
    }
  };

  const send = async () => {
    if (!openId || reply.trim().length < 2) return;
    setBusy(true);
    try {
      await adminApi.supportReply(openId, reply.trim());
      setReply('');
      const res = await adminApi.supportThread(openId);
      setThread(res);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const messages = ((thread?.messages ?? []) as Record<string, unknown>[]) ?? [];

  return (
    <>
      <PageHead title="پشتیبانی" sub="تیکت‌های کاربران و پاسخ‌دهی">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-2">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div className="empty">در حال بارگذاری…</div>
          ) : tickets.length === 0 ? (
            <div className="empty">تیکتی نیست.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>موضوع</th>
                  <th>وضعیت</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((tk) => {
                  const id = String(tk.id ?? '');
                  const closed = tk.status === 'CLOSED' || tk.status === 'RESOLVED';
                  return (
                    <tr key={id} style={openId === id ? { background: '#fafafa' } : undefined}>
                      <td>{String(tk.subject ?? '—')}</td>
                      <td>
                        <span className={closed ? 'badge' : 'badge badge-warn'}>
                          {closed ? 'بسته' : 'باز'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-ghost" onClick={() => open(id)}>
                          باز کردن
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
          {!openId ? (
            <div className="empty">یک تیکت را باز کنید.</div>
          ) : (
            <>
              <div className="row-between" style={{ marginBottom: 10 }}>
                <strong>گفت‌وگو</strong>
                <button className="btn btn-sm btn-ghost" onClick={() => setOpenId(null)}>
                  بستن
                </button>
              </div>

              {thread === null ? (
                <div className="empty">در حال بارگذاری…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                  {messages.map((m, i) => (
                    <div
                      key={String(m.id ?? i)}
                      style={{
                        alignSelf: m.fromAdmin ? 'flex-end' : 'flex-start',
                        background: m.fromAdmin ? 'var(--accent-soft)' : 'var(--bg)',
                        borderRadius: 12,
                        padding: '8px 12px',
                        maxWidth: '85%',
                        fontSize: 13,
                      }}
                    >
                      {String(m.body ?? '')}
                    </div>
                  ))}
                  {messages.length === 0 ? <div className="empty">پیامی نیست.</div> : null}
                </div>
              )}

              <div className="field" style={{ marginTop: 12 }}>
                <label className="label">پاسخ</label>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  style={{ minHeight: 80, fontFamily: 'inherit', direction: 'rtl', textAlign: 'right', fontSize: 13 }}
                />
              </div>
              <button className="btn btn-primary" onClick={send} disabled={busy || reply.trim().length < 2}>
                ارسال
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
