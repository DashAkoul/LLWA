import {
  authRequestSchema,
  authLinkRequestSchema,
  googleAuthRequestSchema,
} from '@llwa/shared';
import { SECURITY, languageFromTelegramCode } from '@llwa/shared';
import type { Env, RequestContext } from '../types';
import { jsonError, jsonSuccess, readJson } from '../lib/response';
import { validateInitData } from '../lib/telegram-auth';
import { verifyGoogleIdToken } from '../lib/google-auth';
import { signJwt } from '../lib/jwt';
import { consumeLinkToken } from '../lib/link-token';
import {
  ContentRepository,
  toUserProfile,
  type UserRow,
} from '../services/repository';
import { SupabaseClient } from '../services/supabase';
import { isAdminFromEnv } from './admin';

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
export async function handleAuth(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;

  const body = await readJson(request);
  const parsed = authRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'initData is required',
      requestId,
      env,
      400
    );
  }

  const validation = await validateInitData(
    parsed.data.initData,
    env.TELEGRAM_BOT_TOKEN,
    { maxAgeSeconds: SECURITY.initDataMaxAgeSeconds }
  );

  if (!validation.ok || !validation.user) {
    return jsonError(
      'INVALID_INIT_DATA',
      validation.error ?? 'initData validation failed',
      requestId,
      env,
      401,
      'errors.invalid_session'
    );
  }

  const tgUser = validation.user;

  return issueTelegramSession(env, requestId, {
    id: tgUser.id,
    first_name: tgUser.first_name,
    last_name: tgUser.last_name,
    username: tgUser.username,
    photo_url: tgUser.photo_url,
    language_code: tgUser.language_code,
  });
}

/**
 * POST /gate?action=auth-google
 *
 * ورود اپ موبایل با حساب گوگل.
 *
 * کلاینت با Google Sign-In یک `idToken` می‌گیرد و اینجا می‌فرستد.
 * ما امضا/صادرکننده/مخاطب/انقضا را با JWKS گوگل بررسی می‌کنیم، سپس
 * کاربر را upsert و JWT خودمان را صادر می‌کنیم.
 *
 * ⚠️ هیچ‌وقت به فیلدهای پروفایل که کلاینت می‌فرستد اعتماد نکن — فقط
 * `idToken` را قبول کن و بقیه را از داخل توکن بخوان.
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
    telegramId: undefined,
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
export async function handleAuthLink(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;

  const body = await readJson(request);
  const parsed = authLinkRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'token is required',
      requestId,
      env,
      400
    );
  }

  const record = await consumeLinkToken(env, parsed.data.token);

  if (!record) {
    return jsonError(
      'INVALID_INIT_DATA',
      'Link token is invalid, expired, or already used',
      requestId,
      env,
      401,
      'errors.invalid_session'
    );
  }

  // نام کاربر را از تلگرام می‌گیریم تا پروفایل کامل باشد.
  // (توکن فقط id را حمل می‌کند تا اطلاعات شخصی در URL لو نرود)
  const fallback: TelegramIdentity = {
    id: record.telegramId,
    first_name: `User ${record.telegramId}`,
    language_code: record.languageCode,
  };

  return issueTelegramSession(env, requestId, fallback);
}

/**
 * صدور JWT برای مسیر تلگرام.
 */
async function issueTelegramSession(
  env: Env,
  requestId: string,
  tgUser: TelegramIdentity
): Promise<Response> {
  const detectedLanguage = languageFromTelegramCode(tgUser.language_code);

  const db = new SupabaseClient(env);
  const repo = new ContentRepository(db, env);

  const user = await repo.upsertUser({
    telegramId: tgUser.id,
    firstName: tgUser.first_name,
    lastName: tgUser.last_name,
    username: tgUser.username,
    photoUrl: tgUser.photo_url,
    uiLanguage: detectedLanguage,
    languageSource: 'TELEGRAM',
  });

  return finalizeSession(env, requestId, repo, user, {
    telegramId: tgUser.id,
    detectedLanguage,
  });
}

interface SessionIdentity {
  telegramId?: number;
  googleSub?: string;
  email?: string;
  detectedLanguage: string;
}

/**
 * منطق مشترک هر سه مسیر ورود: بررسی مسدودی، تعیین نقش ادمین، صدور JWT،
 * و ساخت پروفایل کامل (شامل ترجیحات).
 */
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
    isAdminFromEnv(env, identity.telegramId) || isAdminEmail(env, identity.email);
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
      telegramId: identity.telegramId,
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
    isAdminFromEnv(env, telegramId) || isAdminEmail(env, email)
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
        telegramStars: true,
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
