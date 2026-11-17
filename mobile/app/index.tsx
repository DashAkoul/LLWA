import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth/AuthProvider';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * دروازهٔ ورود.
 *
 * هر بار که اپ باز می‌شود اینجا تصمیم گرفته می‌شود کاربر کجا برود:
 *   • در حال بررسی نشست → اسپینر
 *   • وارد نشده        → /sign-in
 *   • وارد شده ولی آنبوردینگ نکرده → /onboarding
 *   • آماده            → /(tabs)
 */
export default function Gate() {
  const { status } = useAuth();
  const { colors } = useTheme();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (status === 'signed-out' || status === 'error') {
    return <Redirect href="/sign-in" />;
  }

  if (status === 'needs-onboarding') {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
