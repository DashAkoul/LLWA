/**
 * API client — دروازهٔ Edge.
 *
 * همهٔ درخواست‌ها از یک مسیر مبهم عبور می‌کنند:
 *   POST https://api.infolange.ir/llwa74/9xkr2mqv/v1/gate?action=<name>
 *
 * ⚠️ قرارداد پاسخ سرور (درس‌آموختهٔ وب):
 *   موفق → `{ ok: true, data, requestId, ts }`
 *   خطا  → `{ ok: false, error: { code, message } }`
 * هر فراخوانی باید `payload.data` را باز کند، نه خود payload را.
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'llwa.jwt';

/**
 * آدرس پایه.
 *
 * ⚠️ هرگز خالی نگذار: اگر خالی باشد درخواست نسبی می‌شود و ۴۰۴ HTML
 * برمی‌گردد → `response.json()` می‌ترکد. (همین باگ یک‌بار در وب کل اپ را
 * از کار انداخت.)
 */
export const API_BASE: string =
  (Constants.expoConfig?.extra?.apiBase as string | undefined) ??
  process.env.EXPO_PUBLIC_API_BASE ??
  'https://api.infolange.ir';

export const GATE_PATH =
  (Constants.expoConfig?.extra?.gatePath as string | undefined) ??
  process.env.EXPO_PUBLIC_GATE_PATH ??
  '/llwa74/9xkr2mqv/v1/gate';

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INIT_DATA'
  | 'INVALID_GOOGLE_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'CYCLE_NOT_READY'
  | 'LESSON_LOCKED'
  | 'LESSON_ALREADY_COMPLETED'
  | 'APP_LOCKED'
  | 'RATE_LIMITED'
  | 'CONTENT_REJECTED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'AI_UNAVAILABLE'
  | 'SERVER_MISCONFIGURED';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode | string,
    message: string,
    public status: number,
    public userMessageKey?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError(): boolean {
    return (
      this.code === 'UNAUTHORIZED' ||
      this.code === 'TOKEN_EXPIRED' ||
      this.code === 'INVALID_INIT_DATA' ||
      this.code === 'INVALID_GOOGLE_TOKEN'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Token storage
// ─────────────────────────────────────────────────────────────────────

let memoryToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export async function saveToken(token: string | null): Promise<void> {
  memoryToken = token;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // اگر Keychain در دسترس نبود، توکن در حافظه می‌ماند (نشست این اجرا)
  }
}

export function getMemoryToken(): string | null {
  return memoryToken;
}

// ─────────────────────────────────────────────────────────────────────
// Re-auth hook
// ─────────────────────────────────────────────────────────────────────

/**
 * وقتی سرور 401 می‌دهد، کلاینت یک‌بار تلاش می‌کند نشست را تازه کند.
 *
 * در اپ موبایل این کار از طریق Google Sign-In بی‌صدا انجام می‌شود؛ اگر
 * ممکن نبود، کاربر به صفحهٔ ورود هدایت می‌شود. تابع را AuthProvider ست
 * می‌کند تا این فایل به لایهٔ UI وابسته نشود.
 */
let reauthHandler: (() => Promise<string | null>) | null = null;

export function setReauthHandler(fn: (() => Promise<string | null>) | null): void {
  reauthHandler = fn;
}

// ─────────────────────────────────────────────────────────────────────
// Core call
// ─────────────────────────────────────────────────────────────────────

interface CallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  anonymous?: boolean;
  signal?: AbortSignal;
  /** پارامترهای اضافی query (مثل ticketId) */
  query?: Record<string, string>;
  timeoutMs?: number;
}

function buildUrl(action: string, query?: Record<string, string>): string {
  const url = new URL(`${API_BASE}${GATE_PATH}`);
  url.searchParams.set('action', action);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function callApi<T>(
  action: string,
  options: CallOptions = {}
): Promise<T> {
  try {
    return await callOnce<T>(action, options);
  } catch (err) {
    const authFail =
      err instanceof ApiError && err.isAuthError && action !== 'auth-google';
    if (!authFail || options.anonymous || !reauthHandler) throw err;

    // یک‌بار تلاش برای تازه‌کردن نشست، بعد تکرار همان درخواست
    const fresh = await reauthHandler().catch(() => null);
    if (!fresh) throw err;
    return await callOnce<T>(action, options);
  }
}

async function callOnce<T>(action: string, options: CallOptions): Promise<T> {
  const { method = 'GET', body, anonymous, signal, query, timeoutMs = 30_000 } = options;

  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };

  if (!anonymous) {
    const token = await loadToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  // تایم‌اوت دستی — fetch در RN تایم‌اوت پیش‌فرض بلندی دارد
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  let res: Response;
  try {
    res = await fetch(buildUrl(action, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(
      'NETWORK_ERROR',
      err instanceof Error && err.name === 'AbortError'
        ? 'درخواست بیش از حد طول کشید'
        : 'اتصال به سرور برقرار نشد',
      0
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  // ⚠️ اگر پاسخ HTML باشد (پروکسی/۴۰۴) خواندن json می‌ترکد — پیام روشن بده
  const text = await res.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(
      'BAD_RESPONSE',
      `پاسخ سرور قابل خواندن نبود (HTTP ${res.status})`,
      res.status
    );
  }

  const envelope = payload as
    | { ok?: boolean; data?: T; error?: { code?: string; message?: string }; userMessageKey?: string }
    | null;

  if (!res.ok || !envelope || envelope.ok === false) {
    const code = envelope?.error?.code ?? 'INTERNAL_ERROR';
    const message = envelope?.error?.message ?? `HTTP ${res.status}`;
    throw new ApiError(code, message, res.status, envelope?.userMessageKey);
  }

  // پاسخ‌های موفق همیشه داخل `data` هستند
  return (envelope.data ?? (envelope as unknown as T)) as T;
}

/** همان callApi ولی با پارامترهای query — برای اکشن‌های پارامتری */
export function callApiWithQuery<T>(
  action: string,
  query: Record<string, string>,
  options: Omit<CallOptions, 'query'> = {}
): Promise<T> {
  return callApi<T>(action, { ...options, query });
}

/**
 * تبدیل متن به صوت.
 *
 * ⚠️ این مسیر اکشن دروازه نیست: `POST <base>/<gate>/v1/media/speak` است و
 * پیش از میدل‌ور auth بررسی می‌شود. پاسخ همیشه JSON است
 * (`{ url, fromCache }`) — نه فایل خام.
 */
export async function speakText(
  text: string,
  language: string,
  voice = 'default'
): Promise<{ url: string; fromCache: boolean }> {
  const base = GATE_PATH.replace(/\/gate$/, '');
  const url = `${API_BASE}${base}/media/speak`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ text, language, voice }),
  });

  const raw = await res.text();
  let payload: { ok?: boolean; data?: { url?: string; fromCache?: boolean }; error?: { message?: string } } | null = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    throw new ApiError('BAD_RESPONSE', 'پاسخ صوت قابل خواندن نبود', res.status);
  }

  if (!res.ok || payload?.ok === false || !payload?.data?.url) {
    throw new ApiError(
      payload?.error?.message ?? 'AI_UNAVAILABLE',
      payload?.error?.message ?? 'تولید صوت ناموفق بود',
      res.status
    );
  }

  return { url: payload.data.url, fromCache: Boolean(payload.data.fromCache) };
}
