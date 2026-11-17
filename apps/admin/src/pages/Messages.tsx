import React, { useState } from 'react';
import { adminApi } from '../api';
import { PageHead, useAsync } from '../App';

/** پیام همگانی — ارسال اطلاعیه به همه یا یک کاربر. */
export default function Messages() {
  const { data, loading, reload } = useAsync(() => adminApi.messagesList());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [broadcast, setBroadcast] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const messages = (data?.messages ?? []) as Record<string, unknown>[];

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2 || body.trim().length < 2) return;
    setBusy(true);
    setNotice(null);
    try {
      await adminApi.messageSend({ title: title.trim(), body: body.trim(), broadcast });
      setTitle('');
      setBody('');
      setNotice('پیام ثبت شد.');
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'خطا');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="پیام همگانی" sub="اطلاعیه درون‌برنامه‌ای برای کاربران">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {notice ? <div className="alert alert-info">{notice}</div> : null}

      <form className="card" onSubmit={send}>
        <div className="field">
          <label className="label">عنوان</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label">متن</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            style={{ minHeight: 100, fontFamily: 'inherit', direction: 'rtl', textAlign: 'right', fontSize: 13 }}
          />
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={broadcast}
              onChange={(e) => setBroadcast(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span className="hint">ارسال به همهٔ کاربران</span>
          </label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'در حال ارسال…' : 'ارسال'}
        </button>
      </form>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">…</div>
        ) : messages.length === 0 ? (
          <div className="empty">پیامی ارسال نشده.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>عنوان</th>
                <th>تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m, i) => (
                <tr key={String(m.id ?? i)}>
                  <td>{String(m.title ?? '—')}</td>
                  <td className="hint">
                    {m.createdAt ? new Date(String(m.createdAt)).toLocaleString('fa-IR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
