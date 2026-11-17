import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { AuthProvider } from '../src/auth/AuthProvider';
import { setupI18n } from '../src/i18n';

/**
 * پوستهٔ اپ.
 *
 * ترتیب provider ها مهم است:
 *   SafeArea → Theme (رنگ‌ها) → Query (داده) → Auth (نشست) → Stack
 *
 * i18n قبل از هر رندری آماده می‌شود تا هیچ صفحه‌ای با کلید خام دیده نشود.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // در اپ موبایل، بازگشت به اپ باید دادهٔ تازه بدهد ولی نه هر بار
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

function ThemedShell() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="lesson/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="calibration" options={{ gestureEnabled: false }} />
        <Stack.Screen name="delayed-check" />
        <Stack.Screen name="roleplay" />
        <Stack.Screen name="review" />
        <Stack.Screen name="store" />
        <Stack.Screen name="support" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="progress" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    setupI18n('fa')
      .catch(() => {
        /* اگر ترجمه بارگذاری نشد، کلیدها نمایش داده می‌شوند — بهتر از کرش */
      })
      .finally(() => setI18nReady(true));
  }, []);

  if (!i18nReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#327dff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemedShell />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
