import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth/AuthProvider';
import { useTheme } from '../../src/theme/ThemeProvider';
import { AppText, Button, Card, Divider, Screen, StatTile } from '../../src/ui';

/**
 * پروفایل — هویت کاربر + میان‌بر به بقیهٔ بخش‌ها.
 *
 * آمار خلاصه اینجا، جزئیات در `/progress`.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const progressQuery = useQuery({
    queryKey: ['progress'],
    queryFn: () => api.progress(),
    staleTime: 60_000,
  });

  const metrics = progressQuery.data?.metrics;
  const accuracy = Math.round(metrics?.accuracyPct ?? 0);

  const confirmSignOut = () => {
    Alert.alert(t('mobile.auth.logout'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () => {
          signOut().then(() => router.replace('/sign-in'));
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + 8, gap: 16 }}>
        {/* هویت */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: 31,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="h2" weight="800" style={{ color: colors.accent }}>
              {(user?.firstName ?? '?').slice(0, 1).toUpperCase()}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" weight="800">
              {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—'}
            </AppText>
            <AppText variant="caption" tone="textHint">
              {user?.email ?? user?.username ?? ''}
            </AppText>
            {user?.subscription ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <Ionicons name="ribbon-outline" size={13} color={colors.success} />
                <AppText variant="tiny" style={{ color: colors.success }}>
                  {user.subscription.daysRemaining} {t('mobile.store.days')}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        {/* آمار */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile label={t('mobile.home.streak')} value={user?.streakCount ?? 0} icon="flame-outline" tone="warning" />
          <StatTile label={t('mobile.progress.accuracy')} value={`${accuracy}%`} icon="locate-outline" tone="success" />
          <StatTile label={t('mobile.home.coins')} value={user?.starsBalance ?? 0} icon="ellipse-outline" tone="accent" />
        </View>

        {/* میان‌برها */}
        <Card padded={false}>
          <MenuItem
            icon="trending-up-outline"
            label={t('mobile.progress.title')}
            onPress={() => router.push('/progress')}
          />
          <Divider />
          <MenuItem
            icon="repeat-outline"
            label={t('mobile.review.title')}
            onPress={() => router.push('/review')}
          />
          <Divider />
          <MenuItem
            icon="chatbubbles-outline"
            label={t('mobile.roleplay.title')}
            onPress={() => router.push('/roleplay')}
          />
          <Divider />
          <MenuItem
            icon="cart-outline"
            label={t('mobile.store.title')}
            onPress={() => router.push('/store')}
          />
          <Divider />
          <MenuItem
            icon="help-buoy-outline"
            label={t('mobile.support.title')}
            onPress={() => router.push('/support')}
          />
          <Divider />
          <MenuItem
            icon="settings-outline"
            label={t('mobile.settings.title')}
            onPress={() => router.push('/settings')}
          />
        </Card>

        <Button
          label={t('mobile.auth.logout')}
          variant="danger"
          icon="log-out-outline"
          onPress={confirmSignOut}
        />
      </View>
    </Screen>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={19} color={colors.textHint} />
      <AppText variant="body" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </Pressable>
  );
}
