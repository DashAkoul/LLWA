/**
 * Google ID Token verification (RS256) — بدون وابستگی بیرونی.
 *
 * اپ موبایل با Google Sign-In یک `idToken` می‌گیرد و به سرور می‌فرستد.
 * این ماژول آن را با JWKS گوگل اعتبارسنجی می‌کند و سپس ما JWT خودمان را
 * صادر می‌کنیم — یعنی هیچ اعتمادی به کلاینت نداریم و نیازی به Supabase
 * Auth هم نیست.
 *
 * ⚠️ نکته‌های امنیتی که رعایت شده‌اند:
 *   ۱. `alg` باید دقیقاً RS256 باشد (جلوگیری از حملهٔ `alg: none` و HS256
 *      با کلید عمومی).
 *   ۲. `iss` باید accounts.google.com باشد.
 *   ۳. `aud` باید یکی از clientId های مجاز ما باشد.
 *   ۴. `exp` باید در آینده و `iat` نه در آیندهٔ دور باشد.
 *   ۵. `email_verified` برای ورود با ایمیل الزامی است.
 */

import { base64UrlDecode } from './crypto-utils';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
}

export interface GoogleVerifyOptions {
  /** یک یا چند clientId مجاز (Web / Android / iOS) */
  clientIds: string[];
  /** حداکثر اختلاف مجاز ساعت (ثانیه) */
  clockSkewSeconds?: number;
}

export type GoogleVerifyResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; error: string };

interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
  use?: string;
}

interface JwksCache {
  keys: Jwk[];
  fetchedAt: number;
}

/** کش ماژول‌سطحی — در هر isolate نگه داشته می‌شود (۶ ساعت معتبر) */
let jwksCache: JwksCache | null = null;
const JWKS_TTL_MS = 6 * 60 * 60 * 1000;

async function loadJwks(forceRefresh = false): Promise<Jwk[]> {
  const now = Date.now();
  if (!forceRefresh && jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  const res = await fetch(JWKS_URL, {
    headers: { accept: 'application/json' },
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) {
    // اگر رفرش شکست خورد ولی کش قدیمی داریم، از همان استفاده می‌کنیم
    if (jwksCache) return jwksCache.keys;
    throw new Error(`JWKS fetch failed: ${res.status}`);
  }

  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = (body.keys ?? []).filter((k) => k.kty === 'RSA' && k.n && k.e);
  if (keys.length === 0) throw new Error('JWKS contained no RSA keys');

  jwksCache = { keys, fetchedAt: now };
  return keys;
}

interface IdTokenHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface IdTokenPayload {
  iss?: string;
  aud?: string;
  azp?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  iat?: number;
  exp?: number;
  nbf?: number;
}

/**
 * اعتبارسنجی کامل idToken گوگل.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  options: GoogleVerifyOptions
): Promise<GoogleVerifyResult> {
  if (!idToken || typeof idToken !== 'string') {
    return { ok: false, error: 'missing_token' };
  }

  // ⚠️ قبل از هر کار شبکه‌ای: اگر clientId تنظیم نشده باشد، هیچ توکنی
  // نمی‌تواند معتبر باشد. زودتر رد می‌کنیم تا JWKS هم fetch نشود.
  const allowed = options.clientIds.filter(Boolean);
  if (allowed.length === 0) return { ok: false, error: 'no_client_ids_configured' };

  const parts = idToken.split('.');
  if (parts.length !== 3) return { ok: false, error: 'malformed_token' };

  const [headerSeg, payloadSeg, sigSeg] = parts as [string, string, string];

  let header: IdTokenHeader;
  let payload: IdTokenPayload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerSeg))) as IdTokenHeader;
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadSeg))) as IdTokenPayload;
  } catch {
    return { ok: false, error: 'malformed_token' };
  }

  // ۱. الگوریتم
  if (header.alg !== 'RS256') return { ok: false, error: 'unsupported_alg' };
  if (!header.kid) return { ok: false, error: 'missing_kid' };

  // ۲. امضا
  const verified = await verifySignature(header.kid, `${headerSeg}.${payloadSeg}`, sigSeg);
  if (!verified) return { ok: false, error: 'bad_signature' };

  // ۳. صادرکننده
  if (!payload.iss || !VALID_ISSUERS.has(payload.iss)) {
    return { ok: false, error: 'bad_issuer' };
  }

  // ۴. مخاطب (aud) — گوگل ممکن است azp را برای چند-کلاینتی بفرستد
  if (!payload.aud || !allowed.includes(payload.aud)) {
    return { ok: false, error: 'bad_audience' };
  }
  if (payload.azp && !allowed.includes(payload.azp)) {
    return { ok: false, error: 'bad_authorized_party' };
  }

  // ۵. زمان
  const now = Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 60;
  if (typeof payload.exp !== 'number' || payload.exp + skew < now) {
    return { ok: false, error: 'token_expired' };
  }
  if (typeof payload.iat !== 'number' || payload.iat - skew > now) {
    return { ok: false, error: 'token_from_future' };
  }

  // ۶. هویت
  if (!payload.sub) return { ok: false, error: 'missing_sub' };
  if (!payload.email) return { ok: false, error: 'missing_email' };

  const emailVerified =
    payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified) return { ok: false, error: 'email_not_verified' };

  return {
    ok: true,
    identity: {
      sub: payload.sub,
      email: payload.email,
      emailVerified,
      name: payload.name,
      givenName: payload.given_name,
      familyName: payload.family_name,
      picture: payload.picture,
      locale: payload.locale,
    },
  };
}

async function verifySignature(
  kid: string,
  signingInput: string,
  signatureSeg: string
): Promise<boolean> {
  const attempt = async (keys: Jwk[]): Promise<boolean | null> => {
    const jwk = keys.find((k) => k.kid === kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlDecode(signatureSeg),
      new TextEncoder().encode(signingInput)
    );
  };

  try {
    const keys = await loadJwks();
    const result = await attempt(keys);
    if (result !== null) return result;

    // kid ناشناخته → احتمال چرخش کلید گوگل؛ یک بار رفرش اجباری
    const refreshed = await loadJwks(true);
    const retry = await attempt(refreshed);
    return retry === true;
  } catch {
    return false;
  }
}

/** برای تست: پاک‌کردن کش JWKS */
export function __clearGoogleJwksCache(): void {
  jwksCache = null;
}
