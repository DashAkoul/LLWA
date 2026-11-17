import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api';
import { useAuth } from '../src/auth/AuthProvider';
import { useTheme, type ThemeMode } from '../src/theme/ThemeProvider';
import { AppText, Card, Chip, Divider, Screen, SectionTitle } from '../src/ui';
import i18n from '../src/i18n';

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ru', label: 'Русский' },
];

const MINUTES = [10, 15, 20, 30, 45, 60];

export default function SettingsScreen() {
  const { t, i18n: i18nInstance } = useTranslation();
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, refreshUser } = useAuth();

  const changeLanguage = async (code: string) => {
    await i18nInstance.changeLanguage(code);
    await api.updateProfile({ uiLanguage: code }).catch(() => null);
    refreshUser().catch(() => {});
  };

  const changeMinutes = async (minutes: number) => {
    await api.updateProfile({ dailyMinutes: minutes }).catch(() => null);
    refreshUser().catch(() => {});
  };

  const deleteAccount = () => {
    Alert.alert(t('mobile.settings.deleteAccount'), t('mobile.settings.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await api.deleteAccount().catch(() => null);
          await signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + 8, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} onPress={() => router.back()} />
          <AppText variant="h2" weight="800">
            {t('mobile.settings.title')}
          </AppText>
        </View>

        {/* زبان رابط */}
        <View>
          <SectionTitle title={t('mobile.settings.language')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LANGUAGES.map((l) => (
              <Chip
                key={l.code}
                label={l.label}
                selected={i18nInstance.language === l.code}
                onPress={() => changeLanguage(l.code)}
              />
            ))}
          </View>
        </View>

        {/* ظاهر */}
        <View>
          <SectionTitle title={t('mobile.settings.theme')} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                ['system', t('mobile.settings.themeSystem')],
                ['light', t('mobile.settings.themeLight')],
                ['dark', t('mobile.settings.themeDark')],
              ] as [ThemeMode, string][]
            ).map(([value, label]) => (
              <Chip key={value} label={label} selected={mode === value} onPress={() => setMode(value)} />
            ))}
          </View>
        </View>

        {/* زمان روزانه */}
        <View>
          <SectionTitle title={t('mobile.settings.dailyMinutes')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MINUTES.map((m) => (
              <Chip
                key={m}
                label={`${m} ${t('mobile.settings.minutes')}`}
                selected={(user?.dailyMinutes ?? 15) === m}
                onPress={() => changeMinutes(m)}
              />
            ))}
          </View>
        </View>

        {/* حساب */}
        <View>
          <SectionTitle title={t('mobile.settings.about')} />
          <Card padded={false}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <AppText variant="small" tone="textHint">
                {user?.email ?? '—'}
              </AppText>
            </View>
            <Divider />
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <AppText variant="small" tone="textHint">
                {t('mobile.settings.version')} {Constants.expoConfig?.version ?? '1.0.0'}
              </AppText>
            </View>
            <Divider />
            <Pressable
              onPress={deleteAccount}
              style={{ paddingHorizontal: 16, paddingVertical: 14 }}
            >
              <AppText variant="small" style={{ color: colors.danger }}>
                {t('mobile.settings.deleteAccount')}
              </AppText>
            </Pressable>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
