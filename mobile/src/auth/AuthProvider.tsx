/**
 * AuthProvider — مدیریت نشست با ورود گوگل.
 *
 * جریان کار:
 *   ۱. کاربر دکمهٔ «ورود با گوگل» را می‌زند.
 *   ۲. Google Sign-In یک `idToken` می‌دهد (کتابخانهٔ نیتیو).
 *   ۳. ما آن را به `auth-google` می‌فرستیم؛ سرور امضا را با JWKS گوگل
 *      بررسی می‌کند و JWT خودمان را می‌دهد.
 *   ۴. JWT در SecureStore ذخیره می‌شود (Keychain / Keystore).
 *
 * ⚠️ ما هیچ‌وقت به پروفایل برنگشتی از گوگل در سمت کلاینت اعتماد نمی‌کنیم
 * برای ساخت حساب؛ فقط idToken می‌فرستیم و پروفایل را از پاسخ سرور
 * می‌گیریم.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { api, loadToken, saveToken, setReauthHandler, ApiError } from '../api';
import type { UserProfile } from '../api';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/**
 * ⚠️ MVP: ورود آزمایشی بدون Google.
 *
 * تا وقتی Google Cloud Console پیکربندی نشده، با `EXPO_PUBLIC_DEMO_MODE=true`
 * دکمهٔ ورود یک کاربر آزمایشی می‌سازد (هر دستگاه یک کاربر جدا). برای انتشار
 * واقعی این پرچم را خاموش کنید.
 */
const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

const DEVICE_ID_KEY = 'llwa.demo.device';

export type AuthStatus =
  | 'loading'
  | 'signed-out'
  | 'signed-in'
  | 'needs-onboarding'
  | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  error: string | null;
  /** آیا ورود گوگل روی این بیلد پیکربندی شده است؟ */
  configured: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** پس از تغییر پروفایل/آنبوردینگ، کاربر را تازه می‌کند */
  refreshUser: () => Promise<void>;
  setUser: (user: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const configured = DEMO_MODE || Boolean(WEB_CLIENT_ID);

  // ── پیکربندی کتابخانه (یک‌بار) ──────────────────────────────────
  useEffect(() => {
    if (!configured || DEMO_MODE) return;
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      iosClientId: IOS_CLIENT_ID || undefined,
      offlineAccess: false,
      // ⚠️ اگر true باشد، کاربر هر بار باید انتخاب کند؛ برای اپ آموزشی
      // تجربهٔ روان‌تر بهتر است
      forceCodeForRefreshToken: false,
    });
  }, [configured]);

  /**
   * ورود واقعی با گوگل و تبادل توکن.
   * این تابع هم برای ورود اولیه و هم برای re-auth بی‌صدا استفاده می‌شود.
   */
  const performGoogleSignIn = useCallback(
    async (silent: boolean): Promise<string | null> => {
      // ── مسیر MVP: بدون گوگل ────────────────────────────────────
      if (DEMO_MODE) {
        const deviceId = await getOrCreateDeviceId();
        const session = await api.authDemo(deviceId);
        await saveToken(session.token);
        setUserState(session.user);
        setError(null);
        return session.token;
      }

      if (!configured) {
        setError('GOOGLE_CLIENT_ID_MISSING');
        return null;
      }

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: !silent });

      // اگر نشست قبلی گوگل هنوز هست، اول پاک کن تا انتخاب حساب بیاید
      if (!silent) {
        try {
          await GoogleSignin.signOut();
        } catch {
          /* نشست نداشت — مهم نیست */
        }
      }

      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        // کاربر انصراف داد
        return null;
      }

      const idToken =
        response.data.idToken ??
        // برخی نسخه‌ها توکن را در سطح بالا برمی‌گردانند
        (response as unknown as { idToken?: string }).idToken ??
        null;

      if (!idToken) {
        throw new Error('GOOGLE_NO_ID_TOKEN');
      }

      const session = await api.authGoogle(idToken);
      await saveToken(session.token);
      setUserState(session.user);
      setError(null);
      return session.token;
    },
    [configured]
  );

  // ── ورود دستی ───────────────────────────────────────────────────
  const signIn = useCallback(async () => {
    setError(null);
    setStatus('loading');
    try {
      const token = await performGoogleSignIn(false);
      if (!token) {
        // انصراف کاربر — به حالت قبلی برگرد
        setStatus(user ? 'signed-in' : 'signed-out');
        return;
      }
      setStatus(user && !user.onboardingDone ? 'needs-onboarding' : 'signed-in');
    } catch (err) {
      handleAuthError(err, setError, setStatus);
    }
  }, [performGoogleSignIn, user]);

  // ── خروج ────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await saveToken(null);
    try {
      await GoogleSignin.signOut();
    } catch {
      /* ignore */
    }
    setUserState(null);
    setStatus('signed-out');
  }, []);

  // ── تازه‌سازی پروفایل ───────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    const res = await api.me();
    setUserState(res.user);
    setStatus(res.user.onboardingDone ? 'signed-in' : 'needs-onboarding');
  }, []);

  const setUser = useCallback((next: UserProfile) => {
    setUserState(next);
    setStatus(next.onboardingDone ? 'signed-in' : 'needs-onboarding');
  }, []);

  // ── راه‌اندازی اولیه ────────────────────────────────────────────
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      // ۱. توکن ذخیره‌شده داریم؟
      const token = await loadToken();
      if (token) {
        try {
          const res = await api.me();
          setUserState(res.user);
          setStatus(res.user.onboardingDone ? 'signed-in' : 'needs-onboarding');
          return;
        } catch {
          // توکن منقضی/نامعتبر → پاک کن و برو سراغ ورود
          await saveToken(null);
        }
      }
      setStatus('signed-out');
    })();
  }, []);

  // ── re-auth بی‌صدا روی 401 ─────────────────────────────────────
  useEffect(() => {
    setReauthHandler(async () => {
      try {
        const token = await performGoogleSignIn(true);
        if (token) {
          setStatus(user && !user.onboardingDone ? 'needs-onboarding' : 'signed-in');
        }
        return token;
      } catch {
        setStatus('signed-out');
        return null;
      }
    });
    return () => setReauthHandler(null);
  }, [performGoogleSignIn, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      configured,
      signIn,
      signOut,
      refreshUser,
      setUser,
    }),
    [status, user, error, configured, signIn, signOut, refreshUser, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

function handleAuthError(
  err: unknown,
  setError: (v: string | null) => void,
  setStatus: (v: AuthStatus) => void
): void {
  if (isErrorWithCode(err)) {
    switch (err.code) {
      case statusCodes.SIGN_IN_CANCELLED:
        setStatus('signed-out');
        return;
      case statusCodes.IN_PROGRESS:
        setError('IN_PROGRESS');
        setStatus('signed-out');
        return;
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        setError('PLAY_SERVICES');
        setStatus('signed-out');
        return;
      default:
        break;
    }
  }

  if (err instanceof ApiError) {
    setError(err.message);
  } else if (err instanceof Error) {
    setError(err.message);
  } else {
    setError('UNKNOWN');
  }
  setStatus('error');
}

/**
 * شناسهٔ پایدار دستگاه برای حالت آزمایشی.
 *
 * چرا لازم است: در حالت دمو هر دستگاه باید کاربر جدا داشته باشد تا بتوان
 * آنبوردینگ و تولید چرخه را چند بار از صفر تست کرد، بدون اینکه پیشرفت
 * تست‌های قبلی روی تست بعدی اثر بگذارد.
 */
async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch {
    /* Keychain در دسترس نیست → شناسهٔ موقت */
  }
  const created = Crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  } catch {
    /* ignore */
  }
  return created;
}
