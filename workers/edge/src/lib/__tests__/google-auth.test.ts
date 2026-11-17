import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyGoogleIdToken, __clearGoogleJwksCache } from '../google-auth';

/**
 * تست‌های اعتبارسنجی idToken گوگل.
 *
 * ما نمی‌توانیم امضای واقعی گوگل را در تست بسازیم (کلید خصوصی نداریم)،
 * پس روی «رد کردن» توکن‌های نامعتبر تمرکز می‌کنیم — همان چیزی که امنیت
 * را تضمین می‌کند. مسیر موفق با توکن واقعی در E2E پوشش داده می‌شود.
 *
 * ⚠️ `fetch` عمداً stub شده: تست واحد نباید به اینترنت وابسته باشد، وگرنه
 * در شبکهٔ کند/فیلترشده بی‌دلیل timeout می‌دهد و CI را قرمز می‌کند.
 */

function b64url(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): string {
  return `${b64url(header)}.${b64url(payload)}.c2ln`;
}

const CLIENT_IDS = ['test-client.apps.googleusercontent.com'];

/**
 * JWKS ساختگی — کلید واقعی نیست، فقط برای اینکه مسیر «kid ناشناخته»
 * بدون تماس شبکه تست شود.
 */
beforeEach(() => {
  __clearGoogleJwksCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          keys: [
            {
              kid: 'some-other-kid',
              kty: 'RSA',
              alg: 'RS256',
              use: 'sig',
              n: 'sXchDaQebHnPiGvyDOAT4saGEUetSyo9MKLOoWFsueri23bOdgWp4Dy1WlUzewbgBHod5pcM9H95GQRV3JDXboIRROSBigeC5yjU1hGzHHyXss8UDprecbAYxknTcQkhslANGRUZmdTOQ5qTRsLAt6BTYuyvVRdhS8exSZEy_c4gs_7svlJJQ4H9_NxsiIoLwAEk7-Q3UXERGYw_75IDrGA84-lA_-Ct4eTlXHBIY2EaV7t7LjJaynVJCpkv4LKjTTAumiGUIuQhrNhZLuF_RJLqHpM2kgWFLU7-VTdL1VbC2tejvcI2BlMkEpk1BzBZI0KQB0GaDWFLN-aEAw3vRw',
              e: 'AQAB',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  __clearGoogleJwksCache();
});

function basePayload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_IDS[0],
    sub: '1234567890',
    email: 'user@example.com',
    email_verified: true,
    iat: now - 10,
    exp: now + 3600,
    ...overrides,
  };
}

describe('verifyGoogleIdToken — رد کردن ورودی نامعتبر', () => {
  it('توکن خالی را رد می‌کند', async () => {
    const r = await verifyGoogleIdToken('', { clientIds: CLIENT_IDS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('missing_token');
  });

  it('توکن بدون سه بخش را رد می‌کند', async () => {
    const r = await verifyGoogleIdToken('abc.def', { clientIds: CLIENT_IDS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('malformed_token');
  });

  it('⚠️ الگوریتم none را رد می‌کند (حملهٔ کلاسیک)', async () => {
    const token = makeToken({ alg: 'none', kid: 'k1' }, basePayload());
    const r = await verifyGoogleIdToken(token, { clientIds: CLIENT_IDS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unsupported_alg');
  });

  it('⚠️ HS256 را رد می‌کند (امضا با کلید عمومی)', async () => {
    const token = makeToken({ alg: 'HS256', kid: 'k1' }, basePayload());
    const r = await verifyGoogleIdToken(token, { clientIds: CLIENT_IDS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unsupported_alg');
  });

  it('اگر clientId ای تنظیم نشده باشد، خطا می‌دهد', async () => {
    const token = makeToken({ alg: 'RS256', kid: 'k1' }, basePayload());
    const r = await verifyGoogleIdToken(token, { clientIds: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('no_client_ids_configured');
  });

  it('توکن با kid ناشناخته را رد می‌کند', async () => {
    const token = makeToken({ alg: 'RS256', kid: 'does-not-exist' }, basePayload());
    const r = await verifyGoogleIdToken(token, { clientIds: CLIENT_IDS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad_signature');
  });
});
