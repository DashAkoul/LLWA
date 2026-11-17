import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../src/api';
import { useAuth } from '../../src/auth/AuthProvider';
import { useTheme } from '../../src/theme/ThemeProvider';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Screen,
  SectionTitle,
  StatTile,
} from '../../src/ui';

/**
 * خانه — «امروز چه کاری باید بکنم؟»
 *
 * این صفحه فقط یک تصمیم می‌گیرد و همان را نشان می‌دهد. حالت‌های ممکن:
 *   • درس امروز آماده → دکمهٔ شروع
 *   • در حال تولید     → اسپینر + polling سبک
 *   • چرخه تمام شده    → پیام و انتظار برای چرخهٔ بعد
 *   • اشتراک لازم      → کارت فروشگاه
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [polling, setPolling] = useState(false);

  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: () => api.home(),
    // اگر درس در حال تولید است، هر ۵ ثانیه دوباره بپرس
    refetchInterval: (q) => (q.state.data?.generating ? 5000 : false),
  });

  const reviewsQuery = useQuery({
    queryKey: ['due-reviews'],
    queryFn: () => api.dueReviews(),
    staleTime: 60_000,
  });

  const data = homeQuery.data;
  const generating = Boolean(data?.generating);

  // وقتی تولید تمام شد، پروفایل را هم تازه کن (سکه/اشتراک ممکن است عوض شده باشد)
  useEffect(() => {
    if (polling && !generating && data?.lesson) {
      setPolling(false);
      refreshUser().catch(() => {});
    }
  }, [polling, generating, data?.lesson, refreshUser]);

  const onRefresh = useCallback(async () => {
    await Promise.all([homeQuery.refetch(), reviewsQuery.refetch()]);
  }, [homeQuery, reviewsQuery]);

  const locked = homeQuery.error instanceof ApiError && homeQuery.error.code === 'SUBSCRIPTION_REQUIRED';
  const errorCode = homeQuery.error instanceof ApiError ? homeQuery.error.code : null;

  const greeting = useMemo(() => {
    const name = user?.firstName?.trim();
    return name ? `${t('mobile.home.hello')}، ${name}` : t('mobile.home.hello');
  }, [user?.firstName, t]);

  // ── بارگذاری اولیه ───────────────────────────────────────────────
  if (homeQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // ── خطای شبکه ───────────────────────────────────────────────────
  if (homeQuery.isError && !locked) {
    return (
      <Screen>
        <View style={{ paddingTop: insets.top + 12 }}>
          <EmptyState
            icon="cloud-offline-outline"
            title={t('common.retry')}
            body={homeQuery.error instanceof Error ? homeQuery.error.message : undefined}
            action={t('common.retry')}
            onAction={() => homeQuery.refetch()}
          />
        </View>
      </Screen>
    );
  }

  const lesson = data?.lesson ?? null;
  const cycle = data?.cycle ?? null;
  const map = data?.map;
  const cycleComplete = cycle?.status === 'COMPLETED' && !lesson;
  const reviewsDue = reviewsQuery.data?.count ?? 0;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={homeQuery.isRefetching && !generating}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <View style={{ paddingTop: insets.top + 8, gap: 18 }}>
        {/* سرصفحه */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" tone="textHint">
              {greeting}
            </AppText>
            <AppText variant="h2" weight="800" style={{ marginTop: 2 }}>
              {map?.currentStage ?? t('app.name')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Badge icon="flame" value={user?.streakCount ?? 0} tone="warning" />
            <Badge icon="ellipse" value={user?.starsBalance ?? 0} tone="accent" />
          </View>
        </View>

        {/* هدف امروز */}
        {map?.objective ? (
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flag-outline" size={14} color={colors.accent} />
              <AppText variant="caption" tone="textHint">
                {t('mobile.home.objective')}
              </AppText>
            </View>
            <AppText variant="bodyLg" weight="600">
              {map.objective}
            </AppText>
            <View style={{ gap: 6, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="tiny" tone="textHint">
                  {t('mobile.home.stage')} {map.stageIndex} / {map.totalStages}
                </AppText>
                {cycle ? (
                  <AppText variant="tiny" tone="textHint">
                    {cycle.progress.completedDays} / {cycle.progress.totalDays} {t('common.days')}
                  </AppText>
                ) : null}
              </View>
              <ProgressBar
                value={map.totalStages ? (map.stageIndex - 1) / Math.max(1, map.totalStages) : 0}
              />
            </View>
          </Card>
        ) : null}

        {/* اشتراک لازم */}
        {locked ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="lock-closed" size={18} color={colors.warning} />
              <AppText variant="bodyLg" weight="700">
                {t('mobile.home.lockedTitle')}
              </AppText>
            </View>
            <AppText variant="small" tone="textHint">
              {t('mobile.home.lockedBody')}
            </AppText>
            <Button
              label={t('mobile.home.subscribe')}
              onPress={() => router.push('/store')}
              icon="cart-outline"
            />
          </Card>
        ) : null}

        {/* درس امروز */}
        <View>
          <SectionTitle title={t('mobile.home.today')} />

          {generating ? (
            <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 26 }}>
              <ActivityIndicator color={colors.accent} />
              <AppText variant="bodyLg" weight="700">
                {t('mobile.home.generating')}
              </AppText>
              <AppText variant="small" tone="textHint" align="center">
                {t('mobile.home.generatingHint')}
              </AppText>
            </Card>
          ) : lesson ? (
            <LessonCard
              title={lesson.title}
              dayNumber={lesson.dayNumber}
              kind={lesson.kind}
              isCompleted={lesson.isCompleted}
              durationSeconds={lesson.durationSeconds}
              onPress={() => router.push(`/lesson/${lesson.id}`)}
            />
          ) : cycleComplete ? (
            <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 24 }}>
              <AppText variant="bodyLg" weight="800">
                {t('mobile.home.cycleComplete')}
              </AppText>
              <AppText variant="small" tone="textHint" align="center">
                {t('mobile.home.cycleCompleteHint')}
              </AppText>
            </Card>
          ) : errorCode === 'CYCLE_NOT_READY' || data?.generationStatus === 'GENERATING' ? (
            <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 26 }}>
              <ActivityIndicator color={colors.accent} />
              <AppText variant="bodyLg" weight="700">
                {t('mobile.home.generating')}
              </AppText>
              <Button
                label={t('common.retry')}
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={async () => {
                  setPolling(true);
                  await api.retryCycle().catch(() => null);
                  homeQuery.refetch();
                }}
              />
            </Card>
          ) : (
            <EmptyState
              icon="book-outline"
              title={t('mobile.home.noCycle')}
              body={t('mobile.home.generatingHint')}
            />
          )}
        </View>

        {/* مرور واژه‌ها */}
        {reviewsDue > 0 ? (
          <Pressable onPress={() => router.push('/review')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: colors.warningSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="repeat" size={21} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="700">
                  {reviewsDue} {t('mobile.home.reviewsDue')}
                </AppText>
                <AppText variant="caption" tone="textHint">
                  {t('mobile.review.subtitle')}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Card>
          </Pressable>
        ) : null}

        {/* آمار کوتاه */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile
            label={t('mobile.home.streak')}
            value={user?.streakCount ?? 0}
            icon="flame-outline"
            tone="warning"
          />
          <StatTile
            label={t('mobile.home.coins')}
            value={user?.starsBalance ?? 0}
            icon="ellipse-outline"
            tone="accent"
          />
          <StatTile
            label={t('mobile.home.partsDone')}
            value={data?.partsDone ?? 0}
            icon="checkmark-done-outline"
            tone="success"
          />
        </View>

        {/* نقش‌آفرینی — وقتی درس امروز تمام شده */}
        {lesson?.isCompleted ? (
          <Button
            label={t('mobile.roleplay.title')}
            variant="secondary"
            icon="chatbubbles-outline"
            onPress={() => router.push('/roleplay')}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Badge({
  icon,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  tone: 'accent' | 'warning';
}) {
  const { colors } = useTheme();
  const color = tone === 'warning' ? colors.warning : colors.accent;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.bgSecondary,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
      }}
    >
      <Ionicons name={icon} size={13} color={color} />
      <AppText variant="caption" weight="700" style={{ color }}>
        {value}
      </AppText>
    </View>
  );
}

function LessonCard({
  title,
  dayNumber,
  kind,
  isCompleted,
  durationSeconds,
  onPress,
}: {
  title: string;
  dayNumber: number;
  kind: string;
  isCompleted: boolean;
  durationSeconds: number | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const kindLabel =
    kind === 'REVIEW'
      ? t('mobile.review.title')
      : kind === 'STORY'
        ? t('mobile.lesson.story')
        : t('mobile.home.today');

  return (
    <Pressable onPress={onPress}>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="title" weight="800" style={{ color: colors.accent }}>
              {dayNumber}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" tone="textHint">
              {kindLabel}
            </AppText>
            <AppText variant="bodyLg" weight="700" numberOfLines={2}>
              {title}
            </AppText>
          </View>
          {isCompleted ? (
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Button
            label={isCompleted ? t('common.done') : t('mobile.home.start')}
            onPress={onPress}
            size="md"
            style={{ flex: 1 }}
            icon={isCompleted ? 'refresh' : 'play'}
            variant={isCompleted ? 'secondary' : 'primary'}
          />
          {durationSeconds ? (
            <AppText variant="caption" tone="textMuted">
              ~{Math.round(durationSeconds / 60)} {t('mobile.settings.minutes')}
            </AppText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
