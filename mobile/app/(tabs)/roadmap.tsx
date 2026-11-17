import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api';
import { useTheme } from '../../src/theme/ThemeProvider';
import { AppText, Card, EmptyState, Screen, ProgressBar } from '../../src/ui';

/**
 * مسیر — تصویر بزرگ‌تر چرخهٔ ۷ روزه.
 *
 * چرا این تب لازم است؟ «خانه» فقط اقدام امروز را می‌گوید، ولی یادگیرنده
 * باید ببیند کجای مسیر است و چه چیزی در پیش دارد. این صفحه همان نقشه است.
 */
export default function RoadmapScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.home(),
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <Screen>
        <View style={{ paddingTop: insets.top + 12 }}>
          <EmptyState
            icon="cloud-offline-outline"
            title={t('common.retry')}
            body={error instanceof Error ? error.message : undefined}
            action={t('common.retry')}
            onAction={() => refetch()}
          />
        </View>
      </Screen>
    );
  }

  const cycle = data.cycle;
  const days = cycle?.days ?? [];

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + 8, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <AppText variant="h2" weight="800">
            {cycle?.title ?? t('mobile.home.noCycle')}
          </AppText>
          {cycle?.focusSummary ? (
            <AppText variant="small" tone="textHint">
              {cycle.focusSummary}
            </AppText>
          ) : null}
        </View>

        {cycle ? (
          <View style={{ gap: 6 }}>
            <ProgressBar
              value={
                cycle.progress.totalDays
                  ? cycle.progress.completedDays / cycle.progress.totalDays
                  : 0
              }
            />
            <AppText variant="tiny" tone="textHint">
              {cycle.progress.completedDays} / {cycle.progress.totalDays} {t('common.days')}
            </AppText>
          </View>
        ) : null}

        {days.length === 0 ? (
          <EmptyState
            icon="map-outline"
            title={t('mobile.home.noCycle')}
            body={t('mobile.home.generatingHint')}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {days.map((d) => (
              <Card
                key={d.dayNumber}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  opacity: d.isLocked ? 0.55 : 1,
                  borderColor: d.isActive ? colors.accentRing : colors.border,
                  borderWidth: d.isActive ? 1.5 : 1,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: d.isCompleted
                      ? colors.successSoft
                      : d.isActive
                        ? colors.accentSoft
                        : colors.bgSecondary,
                  }}
                >
                  {d.isCompleted ? (
                    <Ionicons name="checkmark" size={19} color={colors.success} />
                  ) : d.isLocked ? (
                    <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                  ) : (
                    <AppText variant="body" weight="800" style={{ color: colors.accent }}>
                      {d.dayNumber}
                    </AppText>
                  )}
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="body" weight={d.isActive ? '700' : '500'} numberOfLines={1}>
                    {d.title}
                  </AppText>
                  {d.phase ? (
                    <AppText variant="tiny" tone="textHint">
                      {d.phase}
                    </AppText>
                  ) : null}
                  {d.objective ? (
                    <AppText variant="caption" tone="textHint" numberOfLines={2}>
                      {d.objective}
                    </AppText>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        )}

        {data.map ? (
          <Card style={{ gap: 8 }}>
            <AppText variant="caption" tone="textHint">
              {t('mobile.home.stage')} {data.map.stageIndex} / {data.map.totalStages}
            </AppText>
            <AppText variant="body" weight="700">
              {data.map.currentStage}
            </AppText>
            <AppText variant="small" tone="textHint">
              {data.map.objective}
            </AppText>
            {data.map.criteria?.length ? (
              <View style={{ gap: 6, marginTop: 6 }}>
                {data.map.criteria.slice(0, 4).map((c, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Ionicons name="ellipse" size={6} color={colors.textMuted} style={{ marginTop: 6 }} />
                    <AppText variant="caption" tone="textHint" style={{ flex: 1 }}>
                      {c}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
