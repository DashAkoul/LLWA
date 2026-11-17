import React, { useState } from 'react';
import { adminApi } from '../api';
import { PageHead, useAsync } from '../App';

/**
 * ارائه‌دهندگان AI — زنجیرهٔ failover.
 *
 * ترتیب ردیف‌ها = ترتیب تلاش. کلید API رمزنگاری‌شده در دیتابیس ذخیره
 * می‌شود و هرگز به کلاینت برنمی‌گردد.
 */
export default function Providers() {
  const { data, loading, error, reload } = useAsync(() => adminApi.aiProviders());
  const [label, setLabel] = useState('');
  const [protocol, setProtocol] = useState<'gemini' | 'openai_compatible' | 'anthropic'>(
    'openai_compatible'
  );
  const [vendor, setVendor] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const raw = data as { providers?: Record<string, unknown>[] } | null;
  const providers = raw?.providers ?? [];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
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
      setNotice('ارائه‌دهنده اضافه شد.');
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'خطا');
    } finally {
      setBusy(false);
    }
  };

  const test = async (id: string) => {
    setNotice('در حال تست…');
    try {
      const res = await adminApi.aiProviderTest(id);
      setNotice(`نتیجه: ${JSON.stringify(res).slice(0, 300)}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'خطا');
    }
  };

  return (
    <>
      <PageHead title="ارائه‌دهندگان AI" sub="زنجیرهٔ ترتیب تلاش، کلیدها و تست اتصال">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          به‌روزرسانی
        </button>
      </PageHead>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-info">{notice}</div> : null}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">در حال بارگذاری…</div>
        ) : providers.length === 0 ? (
          <div className="empty">هنوز ارائه‌دهنده‌ای ثبت نشده.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>برچسب</th>
                <th>پروتکل</th>
                <th>مدل</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p, i) => {
                const id = String(p.id ?? '');
                return (
                  <tr key={id}>
                    <td>{i + 1}</td>
                    <td>{String(p.label ?? '—')}</td>
                    <td className="mono">{String(p.protocol ?? '—')}</td>
                    <td className="mono">{String(p.model ?? '—')}</td>
                    <td>
                      <span className={p.is_active ? 'badge badge-ok' : 'badge'}>
                        {p.is_active ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                    <td>
                      <div className="row">
                        <button className="btn btn-sm btn-ghost" onClick={() => test(id)}>
                          تست
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={async () => {
                            await adminApi.aiProviderDelete(id).catch(() => null);
                            reload();
                          }}
                        >
                          حذف
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

      <form className="card" onSubmit={create}>
        <strong>افزودن ارائه‌دهنده</strong>

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
            <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">مدل</label>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} required />
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

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'در حال ذخیره…' : 'افزودن'}
        </button>
      </form>
    </>
  );
}
