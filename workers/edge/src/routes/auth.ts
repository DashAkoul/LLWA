import {
  googleAuthRequestSchema,
  demoAuthRequestSchema,
  adminAuthRequestSchema,
} from '@llwa/shared';
import { SECURITY } from '@llwa/shared';
import type { Env, RequestContext } from '../types';
import { jsonError, jsonSuccess, readJson } from '../lib/response';
import { verifyGoogleIdToken, type GoogleIdentity } from '../lib/google-auth';
import { signJwt } from '../lib/jwt';
import {
  ContentRepository,
  toUserProfile,
  type UserRow,
} from '../services/repository';
import { SupabaseClient } from '../services/supabase';

/** اطلاعات کاربر تلگرام — مشترک بین دو مسیر ورود */
interface TelegramIdentity {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

/**
 * POST /gate?action=auth
 *
 * مسیر ورود مینی‌اپ تلگرام: initData امضاشده را با JWT کوتاه‌عمر عوض می‌کند.
 * (اپ موبایل از `auth-google` استفاده می‌کند.)
 */
export async function handleAuthGoogle(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;

  const clientIds = (env.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (clientIds.length === 0) {
    return jsonError(
      'SERVER_MISCONFIGURED',
      'GOOGLE_CLIENT_IDS is not configured on the server',
      requestId,
      env,
      500
    );
  }

  const body = await readJson(request);
  const parsed = googleAuthRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'idToken is required',
      requestId,
      env,
      400
    );
  }

  const verification = await verifyGoogleIdToken(parsed.data.idToken, { clientIds });

  if (!verification.ok) {
    return jsonError(
      'INVALID_GOOGLE_TOKEN',
      `Google token rejected: ${verification.error}`,
      requestId,
      env,
      401,
      'errors.invalid_session'
    );
  }

  const identity = verification.identity;

  const db = new SupabaseClient(env);
  const repo = new ContentRepository(db, env);

  const detectedLanguage = languageFromGoogleLocale(identity.locale);

  const user = await repo.upsertUserByGoogle({
    sub: identity.sub,
    email: identity.email,
    firstName: identity.givenName ?? identity.name ?? identity.email.split('@')[0]!,
    lastName: identity.familyName ?? null,
    photoUrl: identity.picture ?? null,
    uiLanguage: detectedLanguage,
  });

  return finalizeSession(env, requestId, repo, user, {
    googleSub: identity.sub,
    email: identity.email,
    detectedLanguage,
  });
}

/**
 * POST /gate?action=auth-link
 *
 * مسیر ورود جایگزین برای زمانی که `initData` در دسترس نیست
 * (مینی‌اپ در BotFather ثبت نشده، یا اپ در وب‌ویو ساده باز شده است).
 *
 * ربات در `/start` یک توکن یک‌بارمصرف می‌سازد و به URL دکمه اضافه
 * می‌کند. اینجا آن توکن بررسی و سوزانده می‌شود.
 */
/** هویت نشست — فقط آنچه برای ساخت JWT لازم است */
interface SessionIdentity {
  /** شناسهٔ گوگل (یا شناسهٔ مصنوعی در حالت دمو/پنل) */
  googleSub: string;
  email?: string;
  detectedLanguage: string;
}

async function finalizeSession(
  env: Env,
  requestId: string,
  repo: ContentRepository,
  user: UserRow,
  identity: SessionIdentity
): Promise<Response> {
  if (user.is_blocked) {
    return jsonError(
      'UNAUTHORIZED',
      'Account is blocked',
      requestId,
      env,
      403,
      'errors.account_blocked'
    );
  }

  const subscription = await repo.getActiveSubscription(user.id);

  // نقش ادمین: لیست env (تلگرام یا ایمیل) → SUPER_ADMIN، وگرنه نقش DB.
  // ⚠️ اگر نقش را اینجا resolve نکنیم، مدیرِ env با adminRole=null می‌ماند و
  // تب «مدیران» او را غیرمجاز می‌بیند («فقط مدیر اصلی به این بخش دسترسی دارد»).
  const dbRole = (user as { admin_role?: string | null }).admin_role ?? null;
  const envAdmin =
    isAdminEmail(env, identity.email);
  const adminRole = envAdmin ? 'SUPER_ADMIN' : dbRole;
  const isAdmin = Boolean(adminRole);

  // اگر کاربر ادمین است ولی پرچم در دیتابیس ست نشده، همگام‌سازی کن
  if (isAdmin !== user.is_admin) {
    await repo.updateUser(user.id, { is_admin: isAdmin });
    user.is_admin = isAdmin;
  }

  const token = await signJwt(
    {
      // ⚠️ نام‌ها باید دقیقاً با AuthClaims بخوانند (camelCase).
      // میدلور auth.ts این فیلدها را مستقیم روی context می‌گذارد.
      // هویت اصلی `userId` است؛ telegramId/googleSub اختیاری‌اند.
      googleSub: identity.googleSub,
      email: identity.email,
      userId: user.id,
      uiLanguage: user.ui_language ?? identity.detectedLanguage,
    },
    env.JWT_SECRET,
    SECURITY.jwtTtlSeconds
  );

  /**
   * ⚠️ ترجیحات (دقایق روزانه/گویش) در `app_settings` است، نه در جدول users.
   * بدون این، پاسخ `auth` مقدار `dailyMinutes: null` می‌داد و در تنظیمات
   * **هیچ گزینه‌ای انتخاب‌شده دیده نمی‌شد**.
   */
  const prefs = await repo.getUserPrefs(user.id);
  const profile = toUserProfile(user, subscription, { isAdmin, adminRole });
  profile.dailyMinutes = prefs.dailyMinutes;
  profile.dialect = prefs.dialect;
  profile.reminderOn = prefs.reminderOn;
  profile.reminderTime = prefs.reminderTime;

  return jsonSuccess({ token, user: profile }, requestId, env);
}

/** آیا این ایمیل در فهرست ادمین‌های env است؟ */
function isAdminEmail(env: Env, email?: string): boolean {
  if (!email) return false;
  const list = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * زبان رابط را از locale گوگل حدس می‌زند (`fa-IR` → `fa`).
 * فقط فارسی و انگلیسی پشتیبانی می‌شوند؛ بقیه → انگلیسی.
 */
function languageFromGoogleLocale(locale?: string): string {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  return base === 'fa' ? 'fa' : 'en';
}

/**
 * POST /gate?action=auth-demo
 *
 * ⚠️ ورود آزمایشی برای MVP — **بدون Google**.
 *
 * چرا؟ در نسخهٔ MVP می‌خواهیم کل جریان (آنبوردینگ، تعیین سطح، تولید درس،
 * چرخه، مرور، فروشگاه) را بدون تنظیم Google Cloud Console تست کنیم.
 *
 * امنیت:
 *   • فقط وقتی `DEMO_MODE === 'true'` است فعال می‌شود؛ در production خاموش.
 *   • کاربر ساخته‌شده `auth_provider = 'GOOGLE'` و `google_sub = 'demo:…'`
 *     دارد ولی **ادمین نیست** — پس نمی‌تواند به مسیرهای مدیریتی دست بزند.
 *   • هر دستگاه با `deviceId` خودش کاربر جدا می‌گیرد تا بتوان چند بار
 *     آنبوردینگ را تست کرد.
 */
export async function handleAuthDemo(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;

  if (String(env.DEMO_MODE ?? 'false') !== 'true') {
    return jsonError(
      'NOT_FOUND',
      'Demo sign-in is disabled',
      requestId,
      env,
      404
    );
  }

  const body = await readJson(request);
  const parsed = demoAuthRequestSchema.safeParse(body ?? {});
  const deviceId = parsed.success ? parsed.data.deviceId : undefined;
  const key = deviceId ? `demo:${deviceId}` : 'demo:default';

  const db = new SupabaseClient(env);
  const repo = new ContentRepository(db, env);

  const user = await repo.upsertUserByGoogle({
    sub: key,
    email: `${deviceId ? `demo-${deviceId}` : 'demo'}@llwa.local`,
    firstName: 'کاربر آزمایشی',
    lastName: null,
    photoUrl: null,
    uiLanguage: 'fa',
  });

  return finalizeSession(env, requestId, repo, user, {
    googleSub: key,
    email: user.email ?? undefined,
    detectedLanguage: 'fa',
  });
}

/**
 * POST /gate?action=auth-admin
 *
 * ورود پنل ادمین وب با رمز مشترک (MVP).
 *
 * ⚠️ این یک راه‌حل موقت است تا پنل از روز اول قابل استفاده باشد. برای
 * production باید به Google Workspace / SSO منتقل شود. رمز فقط از env
 * خوانده می‌شود و هرگز در کد یا دیتابیس نیست.
 */
export async function handleAuthAdmin(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;

  const expected = env.ADMIN_PANEL_PASSWORD;
  if (!expected) {
    return jsonError(
      'SERVER_MISCONFIGURED',
      'Admin panel password is not configured',
      requestId,
      env,
      500
    );
  }

  const body = await readJson(request);
  const parsed = adminAuthRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'password is required', requestId, env, 400);
  }

  if (!(await constantTimeEqual(parsed.data.password, expected))) {
    return jsonError(
      'UNAUTHORIZED',
      'Invalid password',
      requestId,
      env,
      401,
      'errors.invalid_session'
    );
  }

  // کاربر ادمین: اولین ایمیل از ADMIN_EMAILS، وگرنه یک حساب پیش‌فرض
  const adminEmail =
    (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0] ?? 'admin@llwa.local';

  const db = new SupabaseClient(env);
  const repo = new ContentRepository(db, env);

  const user = await repo.upsertUserByGoogle({
    sub: `panel:${adminEmail}`,
    email: adminEmail,
    firstName: 'مدیر',
    lastName: null,
    photoUrl: null,
    uiLanguage: 'fa',
  });

  // نقش ادمین را تضمین کن (کاربر پنل همیشه SUPER_ADMIN است)
  if (!user.is_admin || (user as { admin_role?: string | null }).admin_role !== 'SUPER_ADMIN') {
    await repo.updateUser(user.id, { is_admin: true, admin_role: 'SUPER_ADMIN' });
    user.is_admin = true;
  }

  return finalizeSession(env, requestId, repo, user, {
    googleSub: `panel:${adminEmail}`,
    email: adminEmail,
    detectedLanguage: 'fa',
  });
}

/**
 * مقایسهٔ ثابت‌زمان برای جلوگیری از حملهٔ زمان‌سنجی.
 * (مقایسهٔ `===` رشته در JS زودتر از موعد برمی‌گردد و طول رمز را لو می‌دهد.)
 */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i]! ^ vb[i]!;
  return diff === 0;
}

/**
 * GET|POST /gate?action=me
 * Refresh profile after settings change.
 */
export async function handleMe(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId, userId, telegramId, email } = context;
  if (!userId && !telegramId) {
    return jsonError('UNAUTHORIZED', 'No identity', requestId, env, 401);
  }

  const db = new SupabaseClient(env);
  const repo = new ContentRepository(db, env);

  const user = userId
    ? await repo.findUserById(userId)
    : await repo.findUserByTelegramId(telegramId!);

  if (!user) {
    return jsonError('NOT_FOUND', 'User not found', requestId, env, 404);
  }

  const subscription = await repo.getActiveSubscription(user.id);
  const dbRole = (user as { admin_role?: string | null }).admin_role ?? null;
  const adminRole =
    isAdminEmail(env, email)
      ? 'SUPER_ADMIN'
      : dbRole;
  const profile = toUserProfile(user, subscription, {
    isAdmin: Boolean(adminRole),
    adminRole,
  });

  return jsonSuccess({ user: profile }, requestId, env);
}

/**
 * GET /gate?action=health
 */
export async function handleHealth(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;
  return jsonSuccess(
    {
      status: 'ok',
      time: new Date().toISOString(),
      version: '1.0.0',
      features: {
        googleSignIn: Boolean(env.GOOGLE_CLIENT_IDS),
        /** MVP: ورود بدون گوگل. در production باید false شود. */
        demoMode: String(env.DEMO_MODE ?? 'false') === 'true',
        adminPanel: Boolean(env.ADMIN_PANEL_PASSWORD),
        adminGift: true,
        payloadEncryption:
          String(env.ENABLE_PAYLOAD_ENCRYPTION ?? 'false') === 'true',
        aiProviders: {
          gemini: Boolean(env.GEMINI_API_KEY),
          deepseek: Boolean(env.DEEPSEEK_API_KEY),
          anthropic: Boolean(env.ANTHROPIC_API_KEY),
        },
      },
    },
    requestId,
    env
  );
}
