import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthProvider';
import { useTheme } from '../src/theme/ThemeProvider';
import { AppText, Button, Card } from '../src/ui';

/**
 * صفحهٔ ورود.
 *
 * در نسخهٔ MVP دکمه «ورود آزمایشی» است و بدون گوگل یک کاربر تست می‌سازد
 * (`EXPO_PUBLIC_DEMO_MODE=true`). با پیکربندی Google، همین دکمه ورود واقعی
 * با حساب گوگل می‌شود.
 */
const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, status, error, configured } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const loading = busy || status === 'loading';

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await signIn();
      // پس از ورود موفق، دروازهٔ index تصمیم می‌گیرد کجا برود
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  const errorText = (() => {
    if (!configured) return t('mobile.auth.notConfigured');
    if (!error) return null;
    switch (error) {
      case 'PLAY_SERVICES':
        return t('mobile.auth.playServices');
      case 'IN_PROGRESS':
        return t('mobile.auth.inProgress');
      case 'GOOGLE_CLIENT_ID_MISSING':
        return t('mobile.auth.notConfigured');
      default:
        return t('mobile.auth.failed');
    }
  })();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingHorizontal: 24,
        paddingTop: insets.top + 48,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
        {/* نشان */}
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 26,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chatbubbles" size={44} color={colors.accentText} />
          </View>

          <AppText variant="h1" weight="800" align="center">
            {t('mobile.auth.title')}
          </AppText>
          <AppText variant="body" tone="textHint" align="center" style={{ maxWidth: 320 }}>
            {t('mobile.auth.subtitle')}
          </AppText>
        </View>

        {/* ویژگی‌ها */}
        <Card style={{ gap: 14 }}>
          <Feature icon="sparkles-outline" text={t('mobile.home.objective')} />
          <Feature icon="repeat-outline" text={t('mobile.review.title')} />
          <Feature icon="trending-up-outline" text={t('mobile.progress.title')} />
        </Card>
      </View>

      {/* دکمه‌ها */}
      <View style={{ gap: 12 }}>
        {errorText ? (
          <View
            style={{
              backgroundColor: colors.dangerSoft,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <AppText variant="small" style={{ color: colors.dangerText }}>
              {errorText}
            </AppText>
          </View>
        ) : null}

        <Pressable
          onPress={handleSignIn}
          disabled={loading || !configured}
          style={({ pressed }) => ({
            height: 54,
            borderRadius: 14,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: loading || !configured ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name="logo-google" size={20} color="#4285F4" />
          <AppText variant="bodyLg" weight="700" style={{ color: '#111827' }}>
            {loading
              ? t('mobile.auth.signingIn')
              : DEMO_MODE
                ? t('mobile.auth.demo')
                : t('mobile.auth.google')}
          </AppText>
        </Pressable>

        <AppText variant="caption" tone="textMuted" align="center">
          {t('mobile.auth.terms')}
        </AppText>
      </View>
    </View>
  );
}

function Feature({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <AppText variant="small" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}
