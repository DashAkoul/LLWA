import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api';
import { useTheme } from '../src/theme/ThemeProvider';
import { AppText, Card, EmptyState, ProgressBar, Screen, SectionTitle, StatTile } from '../src/ui';

/**
 * پیشرفت — همان چیزی که انگیزه را نگه می‌دارد.
 *
 * اصل محصول: کاربر باید در هر قدم «پیشرفت خودش را ببیند». پس این صفحه
 * اول شاخص‌های مثبت را نشان می‌دهد، بعد نقاط ضعف را به‌عنوان «فرصت» نه
 * «شکست».
 */
export default function ProgressScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['progress'],
    queryFn: () => api.progress(),
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const m = data?.metrics ?? {};
  const skills = m.skillMastery ?? [];
  const learning = data?.words?.learning ?? [];
  const consolidated = data?.words?.consolidated ?? [];
  const errors = m.errorProfile ?? [];

  const isEmpty = !skills.length && !learning.length && !consolidated.length;

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + 8, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} onPress={() => router.back()} />
          <AppText variant="h2" weight="800">
            {t('mobile.progress.title')}
          </AppText>
        </View>

        {isEmpty ? (
          <EmptyState icon="bar-chart-outline" title={t('mobile.progress.noData')} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile
                label={t('mobile.progress.accuracy')}
                value={`${Math.round(m.accuracyPct ?? 0)}%`}
                icon="locate-outline"
                tone="success"
              />
              <StatTile
                label={t('mobile.progress.recall')}
                value={`${Math.round(m.delayedRecallPct ?? 0)}%`}
                icon="time-outline"
                tone="accent"
              />
              <StatTile
                label={t('mobile.progress.transfer')}
                value={`${Math.round(m.transferPct ?? 0)}%`}
                icon="git-compare-outline"
                tone="warning"
              />
            </View>

            {skills.length ? (
              <View>
                <SectionTitle title={t('mobile.progress.skills')} />
                <Card style={{ gap: 12 }}>
                  {skills.map((s) => (
                    <View key={s.skill} style={{ gap: 5 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="small" weight="600">
                          {s.skill}
                        </AppText>
                        <AppText variant="tiny" tone="textHint">
                          {Math.round(s.pct)}%
                        </AppText>
                      </View>
                      <ProgressBar value={s.pct / 100} height={6} />
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            {errors.length ? (
              <View>
                <SectionTitle title={t('mobile.progress.errors')} />
                <Card style={{ gap: 10 }}>
                  {errors.slice(0, 5).map((e) => (
                    <View
                      key={e.type}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <AppText variant="small">{e.type}</AppText>
                      <View
                        style={{
                          paddingHorizontal: 9,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor: colors.warningSoft,
                        }}
                      >
                        <AppText variant="tiny" style={{ color: colors.warningText }}>
                          {e.count}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            <View>
              <SectionTitle title={`${t('mobile.progress.wordsLearning')} (${learning.length})`} />
              <Card style={{ gap: 8 }}>
                {learning.slice(0, 8).map((w) => (
                  <View key={w.term} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="small" weight="600">
                      {w.term}
                    </AppText>
                    <AppText variant="tiny" tone="textHint">
                      {w.meaning}
                    </AppText>
                  </View>
                ))}
                {!learning.length ? (
                  <AppText variant="small" tone="textHint">
                    —
                  </AppText>
                ) : null}
              </Card>
            </View>

            <View>
              <SectionTitle title={`${t('mobile.progress.wordsDone')} (${consolidated.length})`} />
              <Card style={{ gap: 8 }}>
                {consolidated.slice(0, 8).map((w) => (
                  <View key={w.term} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="small" weight="600">
                      {w.term}
                    </AppText>
                    <AppText variant="tiny" tone="textHint">
                      {w.meaning}
                    </AppText>
                  </View>
                ))}
                {!consolidated.length ? (
                  <AppText variant="small" tone="textHint">
                    —
                  </AppText>
                ) : null}
              </Card>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
