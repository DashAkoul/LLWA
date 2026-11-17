/**
 * ترجمه‌ها — منبع واحد برای وب و اپ موبایل.
 *
 * چرا در `packages/shared`؟
 * ─────────────────────────
 * قبلاً در `apps/web/src/locales` بود. با اضافه‌شدن اپ موبایل، اگر همان
 * فایل‌ها را کپی می‌کردیم دو نسخهٔ ناهمگام داشتیم: یک متن در وب اصلاح
 * می‌شد و در اپ قدیمی می‌ماند. حالا هر دو مصرف‌کننده از همین‌جا می‌خوانند.
 *
 * ⚠️ این فایل‌ها عمداً هیچ import ای ندارند — آبجکت خالص‌اند تا هم
 * i18next وب و هم Metro در اپ موبایل بتوانند مستقیم بارگذاری کنند.
 */

import fa from './fa';
import en from './en';
import ar from './ar';
import tr from './tr';
import ru from './ru';

export const locales = { fa, en, ar, tr, ru } as const;

export type SupportedLocale = keyof typeof locales;

export const localeCodes: SupportedLocale[] = ['fa', 'en', 'ar', 'tr', 'ru'];

/** زبان‌های راست‌به‌چپ */
export const rtlLocaleCodes: SupportedLocale[] = ['fa', 'ar'];

export { fa, en, ar, tr, ru };
