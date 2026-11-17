/**
 * i18n — راه‌اندازی i18next برای اپ موبایل.
 *
 * ترجمه‌ها از `packages/shared/src/locales` می‌آیند (منبع مشترک با وب) تا
 * متن‌ها در دو جا واگرا نشوند.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import { locales, rtlLocaleCodes } from '@llwa/shared/locales';

export type UiLanguage = 'fa' | 'en' | 'ar' | 'tr' | 'ru';

export function isRtlLanguage(language: string): boolean {
  return (rtlLocaleCodes as readonly string[]).includes(language);
}

/**
 * ⚠️ نکتهٔ مهم React Native:
 * برخلاف وب، جهت چیدمان را نمی‌توان در زمان اجرا با `document.dir` عوض
 * کرد. `I18nManager.forceRTL` فقط پس از ری‌استارت اپ اثر می‌کند. پس:
 *   • برای زبان‌های RTL، چیدمان را با `flexDirection: 'row-reverse'` و
 *     `textAlign: 'right'` دستی می‌چینیم (کامپوننت‌ها این را از تم می‌گیرند)
 *   • `forceRTL` را فقط در بوت اولیه ست می‌کنیم و از کاربر می‌خواهیم
 *     اپ را یک‌بار ببندد و باز کند.
 */
export function applyDirection(language: string): void {
  const rtl = isRtlLanguage(language);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}

let initialized = false;

export async function setupI18n(initialLanguage: UiLanguage = 'fa'): Promise<void> {
  if (initialized) {
    await i18n.changeLanguage(initialLanguage);
    return;
  }
  initialized = true;

  await i18n.use(initReactI18next).init({
    resources: locales,
    lng: initialLanguage,
    fallbackLng: 'en',
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    returnNull: false,
    compatibilityJSON: 'v4',
  });

  applyDirection(initialLanguage);
  i18n.on('languageChanged', (lng) => applyDirection(lng));
}

export default i18n;
