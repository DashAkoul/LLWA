/**
 * Design tokens — LLWA mobile.
 *
 * همان پالت وب (brand-500 = #327DFF) ولی به‌صورت آبجکت‌های تایپ‌شده، چون
 * React Native کلاس Tailwind ندارد و `StyleSheet` فقط مقدار ثابت می‌پذیرد.
 *
 * ⚠️ هر رنگ در دو نسخه (light/dark) تعریف شده. هیچ‌جا رنگ را هارد‌کد نکن؛
 * از `useTheme()` بگیر تا تم روشن/تاریک خودکار درست بماند.
 */

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  /** پس‌زمینهٔ اصلی صفحه */
  bg: string;
  /** پس‌زمینهٔ ثانویه (کارت‌های کم‌رنگ، ردیف‌های لیست) */
  bgSecondary: string;
  /** کارت سفید/تیره روی پس‌زمینه */
  card: string;
  /** خط جداکننده */
  border: string;
  /** متن اصلی */
  text: string;
  /** متن کم‌اهمیت */
  textHint: string;
  /** متن خیلی کم‌رنگ */
  textMuted: string;
  /** رنگ برند — دکمهٔ اصلی */
  accent: string;
  /** متن روی رنگ برند */
  accentText: string;
  /** تینت روشن برند (۶٪) برای آیتم انتخاب‌شده */
  accentSoft: string;
  /** حاشیهٔ آیتم انتخاب‌شده */
  accentRing: string;
  success: string;
  successSoft: string;
  successText: string;
  warning: string;
  warningSoft: string;
  warningText: string;
  danger: string;
  dangerSoft: string;
  dangerText: string;
  /** پس‌زمینهٔ اورلی مودال */
  overlay: string;
}

const light: ThemeColors = {
  bg: '#ffffff',
  bgSecondary: '#f4f4f5',
  card: '#ffffff',
  border: '#e4e4e7',
  text: '#0f172a',
  textHint: '#71717a',
  textMuted: '#a1a1aa',
  accent: '#327dff',
  accentText: '#ffffff',
  accentSoft: 'rgba(50,125,255,0.08)',
  accentRing: 'rgba(50,125,255,0.35)',
  success: '#16a34a',
  successSoft: '#dcfce7',
  successText: '#052e16',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  warningText: '#451a03',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  dangerText: '#4c0519',
  overlay: 'rgba(9,9,11,0.45)',
};

const dark: ThemeColors = {
  bg: '#0f0f10',
  bgSecondary: '#1a1a1d',
  card: '#18181b',
  border: '#2e2e33',
  text: '#f4f4f5',
  textHint: '#a1a1aa',
  textMuted: '#71717a',
  accent: '#3b82f6',
  accentText: '#ffffff',
  accentSoft: 'rgba(59,130,246,0.16)',
  accentRing: 'rgba(59,130,246,0.45)',
  success: '#22c55e',
  successSoft: 'rgba(34,197,94,0.16)',
  successText: '#dcfce7',
  warning: '#f59e0b',
  warningSoft: 'rgba(245,158,11,0.16)',
  warningText: '#fef3c7',
  danger: '#f87171',
  dangerSoft: 'rgba(248,113,113,0.16)',
  dangerText: '#fee2e2',
  overlay: 'rgba(0,0,0,0.6)',
};

export const palettes: Record<ColorScheme, ThemeColors> = { light, dark };

/** فاصله‌ها — مضرب ۴ */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** شعاع گوشه‌ها */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** اندازهٔ فونت — مقیاس تایپوگرافی */
export const font = {
  /** ۱۱ — برچسب ریز */
  tiny: 11,
  /** ۱۲ — کپشن */
  caption: 12,
  /** ۱۳ — متن کمکی */
  small: 13,
  /** ۱۵ — متن بدنه */
  body: 15,
  /** ۱۷ — متن برجسته */
  bodyLg: 17,
  /** ۲۰ — تیتر کارت */
  title: 20,
  /** ۲۴ — تیتر صفحه */
  h2: 24,
  /** ۳۰ — تیتر اصلی */
  h1: 30,
  /** ۴۰ — عدد بزرگ آماری */
  display: 40,
} as const;

/** سایهٔ کارت — در تم تاریک سایه بی‌اثر است، پس حاشیه جای آن را می‌گیرد */
export function cardShadow(scheme: ColorScheme) {
  if (scheme === 'dark') return {};
  return {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  };
}
