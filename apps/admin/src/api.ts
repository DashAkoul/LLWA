/**
 * Admin API client.
 *
 * همان دروازهٔ Edge که اپ موبایل استفاده می‌کند، فقط با توکن ادمین.
 * ⚠️ قرارداد پاسخ: `{ ok, data }` برای موفق و `{ ok:false, error }` برای خطا.
 */

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.infolange.ir';
const GATE_PATH =
  (import.meta.env.VITE_GATE_PATH as string | undefined) ?? '/llwa74/9xkr2mqv/v1/gate';

const TOKEN_KEY = 'llwa.admin.token';

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* حالت خصوصی مرورگر */
  }
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError(): boolean {
    return this.code === 'UNAUTHORIZED' || this.code === 'TOKEN_EXPIRED';
  }
}

interface CallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  anonymous?: boolean;
  query?: Record<string, string>;
}

function buildUrl(action: string, query?: Record<string, string>): string {
  const url = new URL(`${API_BASE}${GATE_PATH}`);
  url.searchParams.set('action', action);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

export async function callApi<T>(action: string, options: CallOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous, query } = options;

  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };

  if (!anonymous) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(action, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError('BAD_RESPONSE', `پاسخ سرور قابل خواندن نبود (HTTP ${res.status})`, res.status);
  }

  const env = payload as
    | { ok?: boolean; data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!res.ok || !env || env.ok === false) {
    throw new ApiError(
      env?.error?.code ?? 'INTERNAL_ERROR',
      env?.error?.message ?? `HTTP ${res.status}`,
      res.status
    );
  }

  return (env.data ?? (env as unknown as T)) as T;
}

export const adminApi = {
  /** ورود با رمز پنل (MVP). توکن ذخیره نمی‌شود؛ فراخواننده خودش setToken می‌زند. */
  login: (password: string) =>
    callApi<{ token: string; user: { id: string; email?: string | null; firstName?: string | null } }>(
      'auth-admin',
      { method: 'POST', body: { password }, anonymous: true }
    ),

  me: () => callApi<{ user: Record<string, unknown> }>('me'),

  stats: () => callApi<Record<string, unknown>>('admin-stats'),

  users: (params: { limit?: number; offset?: number; q?: string } = {}) => {
    const q: Record<string, string> = {};
    if (params.limit) q.limit = String(params.limit);
    if (params.offset) q.offset = String(params.offset);
    if (params.q) q.q = params.q;
    return callApi<{ users: Record<string, unknown>[]; total?: number }>('admin-users', { query: q });
  },

  userDetail: (userId: string) =>
    callApi<Record<string, unknown>>('admin-user-detail', { query: { userId } }),

  gift: (body: { userId?: string; telegramId?: number; planType: string; note?: string }) =>
    callApi<unknown>('admin-gift', { method: 'POST', body }),

  revoke: (body: { userId?: string; telegramId?: number }) =>
    callApi<unknown>('admin-revoke', { method: 'POST', body }),

  // ── پلن‌ها و قیمت‌گذاری ────────────────────────────────────────────
  plans: () => callApi<{ plans: Record<string, unknown>[] }>('admin-plans'),
  planCreate: (body: unknown) => callApi<unknown>('admin-plan-create', { method: 'POST', body }),
  planUpdate: (body: unknown) => callApi<unknown>('admin-plan-update', { method: 'POST', body }),
  planDelete: (id: string) => callApi<unknown>('admin-plan-delete', { method: 'POST', body: { id } }),

  // ── ارائه‌دهندگان AI ─────────────────────────────────────────────
  aiProviders: () => callApi<unknown>('admin-ai-providers'),
  aiProviderCreate: (body: unknown) => callApi<unknown>('admin-ai-provider-create', { method: 'POST', body }),
  aiProviderUpdate: (id: string, body: unknown) =>
    callApi<unknown>('admin-ai-provider-update', { method: 'POST', body: { id, ...(body as object) } }),
  aiProviderDelete: (id: string) => callApi<unknown>('admin-ai-provider-delete', { method: 'POST', body: { id } }),
  aiProviderTest: (id: string) => callApi<unknown>('admin-ai-provider-test', { method: 'POST', body: { id } }),

  // ── پرامپت‌ها (نسخه‌دار) ──────────────────────────────────────────
  prompts: () => callApi<{ prompts: PromptRow[] }>('admin-prompts'),
  promptSave: (body: { taskKey: string; body: string; notes?: string; activate?: boolean }) =>
    callApi<{ prompt: PromptRow }>('admin-prompt-save', { method: 'POST', body }),
  promptActivate: (body: { id: string }) =>
    callApi<{ ok: boolean }>('admin-prompt-activate', { method: 'POST', body }),

  // ── فلگ‌های قابلیت ───────────────────────────────────────────────
  flags: () => callApi<{ flags: FlagRow[] }>('admin-flags'),
  flagSet: (body: { key: string; enabled: boolean; description?: string }) =>
    callApi<{ flag: FlagRow }>('admin-flag-set', { method: 'POST', body }),

  // ── پشتیبانی ─────────────────────────────────────────────────────
  supportList: () => callApi<{ tickets: Record<string, unknown>[] }>('admin-support-list'),
  supportThread: (ticketId: string) =>
    callApi<Record<string, unknown>>('admin-support-thread', { query: { ticketId } }),
  supportReply: (ticketId: string, body: string) =>
    callApi<unknown>('admin-support-reply', { method: 'POST', body: { ticketId, body } }),

  // ── پیام همگانی ──────────────────────────────────────────────────
  messageSend: (body: { title: string; body: string; userId?: string; broadcast?: boolean }) =>
    callApi<unknown>('admin-message-send', { method: 'POST', body }),
  messagesList: () => callApi<{ messages: Record<string, unknown>[] }>('admin-messages-list'),
};

export interface PromptRow {
  id: string;
  task_key: string;
  version: number;
  body: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface FlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}
