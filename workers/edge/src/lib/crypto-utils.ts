/**
 * ابزارهای رمزنگاری مشترک — Base64URL و HMAC.
 *
 * ⚠️ چرا این فایل جدا شد: این توابع قبلاً داخل `lib/telegram-auth.ts` بودند
 * و با حذف مینی‌اپ تلگرام، JWT و اعتبارسنجی گوگل هم می‌شکستند — در حالی
 * که هیچ ربطی به تلگرام ندارند. حالا در یک ماژول بی‌طرف‌اند.
 */

/** ورودی‌های قابل پذیرش برای انکود */
export type BinaryInput = string | Uint8Array | ArrayBuffer;

function toBytes(input: BinaryInput): Uint8Array {
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

/** Base64URL بدون padding — مطابق RFC 4648 §5 */
export function base64UrlEncode(input: BinaryInput): string {
  const bytes = toBytes(input);
  let binary = '';
  // در بلوک‌های کوچک تا از پشتهٔ آرگومان‌ها سرریز نشود
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64URL → بایت. ورودی نامعتبر باعث خطا می‌شود (نه خروجی خالی). */
export function base64UrlDecode(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** HMAC-SHA256 — خروجی خام برای امضا/مقایسه */
export async function hmacSha256(key: string, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

/**
 * مقایسهٔ ثابت‌زمان.
 * ⚠️ `===` روی رشته زودتر از موعد برمی‌گردد و طول/پیشوند رمز را لو می‌دهد.
 */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
