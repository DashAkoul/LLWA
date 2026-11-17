import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cardShadow,
  font,
  palettes,
  radius,
  space,
  type ColorScheme,
  type ThemeColors,
} from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'llwa.theme.mode';

export interface Theme {
  scheme: ColorScheme;
  mode: ThemeMode;
  colors: ThemeColors;
  space: typeof space;
  radius: typeof radius;
  font: typeof font;
  shadow: ReturnType<typeof cardShadow>;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // تم ذخیره‌شده را در اولین رندر بخوان
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!alive) return;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      })
      .catch(() => {
        /* مقدار پیش‌فرض می‌ماند */
      });
    return () => {
      alive = false;
    };
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const scheme: ColorScheme =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<Theme>(
    () => ({
      scheme,
      mode,
      colors: palettes[scheme],
      space,
      radius,
      font,
      shadow: cardShadow(scheme),
      setMode,
    }),
    [scheme, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
