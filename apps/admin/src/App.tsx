import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, ApiError, getToken, setToken } from './api';
import Overview from './pages/Overview';
import Users from './pages/Users';
import Plans from './pages/Plans';
import Providers from './pages/Providers';
import Prompts from './pages/Prompts';
import Flags from './pages/Flags';
import Support from './pages/Support';
import Messages from './pages/Messages';

/**
 * Admin console — کنسول وب مدیریت، جدا از اپ موبایل.
 *
 * روی Cloudflare Pages سرو می‌شود (admin.infolange.ir) و فقط از API مشترک
 * استفاده می‌کند. ورود با رمز پنل است (MVP) و بعداً به SSO منتقل می‌شود.
 */

type SectionKey =
  | 'overview'
  | 'users'
  | 'plans'
  | 'providers'
  | 'prompts'
  | 'flags'
  | 'support'
  | 'messages';

interface Section {
  key: SectionKey;
  label: string;
  icon: string;
  render: () => React.ReactElement;
}

const SECTIONS: Section[] = [
  { key: 'overview', label: 'نمای کلی', icon: '📊', render: () => <Overview /> },
  { key: 'users', label: 'کاربران', icon: '👥', render: () => <Users /> },
  { key: 'plans', label: 'پلن و قیمت', icon: '💳', render: () => <Plans /> },
  { key: 'providers', label: 'ارائه‌دهندگان AI', icon: '🤖', render: () => <Providers /> },
  { key: 'prompts', label: 'پرامپت‌ها', icon: '📝', render: () => <Prompts /> },
  { key: 'flags', label: 'قابلیت‌ها', icon: '🚩', render: () => <Flags /> },
  { key: 'support', label: 'پشتیبانی', icon: '💬', render: () => <Support /> },
  { key: 'messages', label: 'پیام همگانی', icon: '📨', render: () => <Messages /> },
];

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [section, setSection] = useState<SectionKey>('overview');

  const logout = useCallback(() => {
    setToken(null);
    setAuthed(false);
  }, []);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const current = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0]!;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="login-logo" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 15 }}>
            LL
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>LLWA</div>
            <div className="hint">کنسول مدیریت</div>
          </div>
        </div>

        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={`nav-item ${section === s.key ? 'active' : ''}`}
            onClick={() => setSection(s.key)}
          >
            <span aria-hidden>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button className="nav-item" onClick={logout}>
            <span aria-hidden>🚪</span>
            <span>خروج</span>
          </button>
        </div>
      </aside>

      <main className="main">{current.render()}</main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.login(password);
      setToken(res.token);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ورود ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">LL</div>
        <div>
          <h1 className="page-title" style={{ fontSize: 19 }}>
            کنسول مدیریت LLWA
          </h1>
          <p className="page-sub">برای ادامه رمز پنل را وارد کنید.</p>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="field">
          <label className="label" htmlFor="pw">
            رمز پنل
          </label>
          <input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy || password.length < 4}>
          {busy ? 'در حال ورود…' : 'ورود'}
        </button>

        <p className="hint" style={{ margin: 0 }}>
          این رمز در متغیر محیطی <span className="mono">ADMIN_PANEL_PASSWORD</span> نگه‌داری می‌شود.
        </p>
      </form>
    </div>
  );
}

/** ابزار مشترک صفحات: بارگذاری داده با مدیریت خطا */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fn()
      .then((d) => setData(d))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : String(err));
        if (err instanceof ApiError && err.isAuthError) setToken(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return useMemo(() => ({ data, loading, error, reload }), [data, loading, error, reload]);
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {children ? <div className="row">{children}</div> : null}
    </div>
  );
}
