import React, { useState } from 'react';
import { adminApi } from '../api';
import { PageHead, useAsync } from '../App';

/**
 * ارائه‌دهندگان AI — مدیریت چند کلید و ترتیب تلاش.
 *
 * هر ردیف = یک «کلید + مدل». برای داشتن چند کلید از یک سرویس، چند ردیف
 * با همان vendor و مدل‌های مختلف بسازید؛ زنجیرهٔ failover به ترتیب
 * `priority` آن‌ها را امتحان می‌کند.
 *
 * ⚠️ کلید API هرگز به کلاینت برنمی‌گردد (رمزنگاری‌شده در دیتابیس)؛
 * فیلد کلید در ویرایش خالی است و فقط اگر پر شود جایگزین می‌شود.
 */

interface Provider {
  id: string;
  label: string;
  protocol: string;
  vendor: string;
  model: string;
  base_url?: string | null;
  priority: number;
  is_active: boolean;
  supports_json_schema?: boolean;
  last_error?: string | null;
  last_ok_at?: string | null;
}

export default function Providers() {
  const { data, loading, error, reload } = useAsync(() => adminApi.aiProviders());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; model: string; apiKey: string }>({
    label: '',
    model: '',
    apiKey: '',
  });

  const [label, setLabel] = useState('');
  const [protocol, setProtocol] = useState<'gemini' | 'openai_compatible' | 'anthropic'>(
    'openai_compatible'
  );
  const [vendor, setVendor] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  const raw = data as { providers?: Provider[] } | null;
  const providers = [...(raw?.providers ?? [])].sort((a, b) => a.priority - b.priority);

  const run = async (id: string, fn: () => Promise<unknown>, okMessage?: string) => {
    setBusy(id);
    setNotice(null);
    try {
      await fn();
      if (okMessage) setNotice(okMessage);
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'خطا');
    } finally {
      setBusy(null);
    }
  };

  const move = (index: number, delta: number) => {
    const next = [...providers];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    void run('reorder', () => adminApi.aiProviderReorder(next.map((p) => p.id)), 'ترتیب ذخیره شد.');
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('create');
    setNotice(null);
    try {
      await adminApi.aiProviderCreate({
        label,
        protocol,
        vendor,
        model,
        apiKey,
        baseUrl: baseUrl || undefined,
      });
      setLabel('');
      setVendor('');
      setModel('');
      setApiKey('');
      setBaseUrl('');
      setNotice('ارائه‌دهنده اضافه شد و در انتهای زنجیره قرار گرفت.');
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'خطا');
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async (id: string) => {
    const patch: Record<string, unknown> = {};
    if (draft.label.trim()) patch.label = draft.label.trim();
    if (draft.model.trim()) patch.model = draft.model.trim();
    if (draft.apiKey.trim()) patch.apiKey = draft.apiKey.trim();
    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }
    await run(id, () => adminApi.aiProviderUpdate(id, patch), 'ذخیره شد.');
    setEditing(null);
  };

  return (
    <>
      <PageHead title="ارائه‌دهندگان AI" sub="چند کلید، ترتیب تلاش، تست اتصال">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-info">{notice}</div> : null}

      <div className="alert alert-info">
        ترتیب ردیف‌ها = ترتیب تلاش. اگر اولی خطا بدهد، بعدی امتحان می‌شود. برای چند کلید از یک
        سرویس، چند ردیف با همان <span className="mono">vendor</span> بسازید.
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">در حال بارگذاری…</div>
        ) : providers.length === 0 ? (
          <div className="empty">هنوز ارائه‌دهنده‌ای ثبت نشده — تولید محتوا کار نمی‌کند.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>برچسب</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p, i) => (
                <tr key={p.id}>
                  <td>
                    <div className="row">
                      <span className="mono">{p.priority}</span>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => move(i, -1)}
                        disabled={i === 0 || busy === 'reorder'}
                        title="بالا"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => move(i, 1)}
                        disabled={i === providers.length - 1 || busy === 'reorder'}
                        title="پایین"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    {editing === p.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          type="text"
                          value={draft.label}
                          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                          placeholder="برچسب"
                          style={{ padding: '5px 8px' }}
                        />
                        <input
                          type="text"
                          value={draft.model}
                          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                          placeholder="مدل"
                          className="mono"
                          style={{ padding: '5px 8px' }}
                        />
                        <input
                          type="password"
                          value={draft.apiKey}
                          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                          placeholder="کلید جدید (خالی = بدون تغییر)"
                          style={{ padding: '5px 8px' }}
                          autoComplete="off"
                        />
                        <div className="row">
                          <button className="btn btn-sm btn-primary" onClick={() => saveEdit(p.id)}>
                            ذخیره
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
                            انصراف
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.label}</div>
                        <div className="hint mono">
                          {p.protocol} · {p.model}
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={p.is_active ? 'badge badge-ok' : 'badge'}>
                      {p.is_active ? 'فعال' : 'غیرفعال'}
                    </span>
                    {p.last_error ? (
                      <div className="hint" style={{ color: 'var(--danger)', marginTop: 4 }}>
                        {p.last_error.slice(0, 60)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busy === p.id}
                        onClick={() => {
                          setEditing(p.id);
                          setDraft({ label: p.label, model: p.model, apiKey: '' });
                        }}
                      >
                        ویرایش
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busy === p.id}
                        onClick={() =>
                          run(
                            p.id,
                            () => adminApi.aiProviderUpdate(p.id, { isActive: !p.is_active }),
                            p.is_active ? 'غیرفعال شد.' : 'فعال شد.'
                          )
                        }
                      >
                        {p.is_active ? 'خاموش' : 'روشن'}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busy === p.id}
                        onClick={() =>
                          run(p.id, async () => {
                            const res = await adminApi.aiProviderTest(p.id);
                            setNotice(`نتیجهٔ تست: ${JSON.stringify(res).slice(0, 240)}`);
                          })
                        }
                      >
                        تست
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy === p.id}
                        onClick={() => run(p.id, () => adminApi.aiProviderDelete(p.id), 'حذف شد.')}
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form className="card" onSubmit={create}>
        <strong>افزودن کلید / ارائه‌دهنده</strong>
        <p className="hint" style={{ marginTop: 4 }}>
          ردیف جدید در انتهای زنجیره اضافه می‌شود؛ بعد با دکمه‌های ↑ ↓ جای آن را تعیین کنید.
        </p>

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="label">برچسب</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">پروتکل</label>
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as never)}>
              <option value="openai_compatible">openai_compatible</option>
              <option value="gemini">gemini</option>
              <option value="anthropic">anthropic</option>
            </select>
          </div>
          <div className="field">
            <label className="label">vendor</label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="gemini / deepseek / openrouter"
              required
            />
          </div>
          <div className="field">
            <label className="label">مدل</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gemini-2.5-flash"
              required
            />
          </div>
          <div className="field">
            <label className="label">Base URL (اختیاری)</label>
            <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">کلید API</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy === 'create'}>
          {busy === 'create' ? 'در حال ذخیره…' : 'افزودن'}
        </button>
      </form>
    </>
  );
}
