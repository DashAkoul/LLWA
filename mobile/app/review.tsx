import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api';
import { useTheme } from '../src/theme/ThemeProvider';
import { useSpeech } from '../src/hooks/useSpeech';
import { AppText, Button, Card, EmptyState, ProgressBar, Screen } from '../src/ui';

/**
 * مرور واژه‌های سررسیده.
 *
 * ⚠️ قاعدهٔ بازیابی فعال: پاسخ **قبل** از نمایش داده می‌شود. اگر معنی را
 * همان اول نشان دهیم، دیگر «بازیابی» نیست و اثر آموزشی ندارد. کاربر اول
 * خودش ارزیابی می‌کند (بلدم / نمی‌دانم) و بعد پاسخ را می‌بیند.
 */
export default function ReviewScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { speak } = useSpeech();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['due-reviews'],
    queryFn: () => api.dueReviews(),
  });

  const items = data?.items ?? [];
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<{ term: string; isCorrect: boolean; responseMs: number }[]>([]);
  const [done, setDone] = useState(false);
  const shownAt = useRef(Date.now());

  const current = items[index];

  const answer = (isCorrect: boolean) => {
    if (!current) return;
    setResults((prev) => [
      ...prev,
      { term: current.term, isCorrect, responseMs: Date.now() - shownAt.current },
    ]);
    setRevealed(false);
    shownAt.current = Date.now();
    if (index + 1 < items.length) {
      setIndex(index + 1);
    } else {
      void submit();
    }
  };

  const submit = async () => {
    try {
      await api.submitReview({ answers: results });
    } catch {
      /* نتیجه در سرور ثبت نشد — ولی کاربر نباید گیر کند */
    }
    setDone(true);
  };

  const progress = useMemo(
    () => (items.length ? (index + (done ? 1 : 0)) / items.length : 0),
    [index, items.length, done]
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!items.length) {
    return (
      <Screen>
        <View style={{ paddingTop: insets.top + 20 }}>
          <EmptyState
            icon="checkmark-done-outline"
            title={t('mobile.review.empty')}
            body={t('mobile.review.emptyHint')}
            action={t('common.back')}
            onAction={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  if (done) {
    const correct = results.filter((r) => r.isCorrect).length;
    return (
      <Screen>
        <View style={{ paddingTop: insets.top + 40, alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colors.successSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark" size={38} color={colors.success} />
          </View>
          <AppText variant="h2" weight="800">
            {t('mobile.review.done')}
          </AppText>
          <AppText variant="body" tone="textHint">
            {correct} / {results.length}
          </AppText>
          <Button label={t('common.done')} onPress={() => router.back()} size="lg" />
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.textHint} />
          </Pressable>
          <AppText variant="caption" tone="textHint">
            {index + 1} / {items.length}
          </AppText>
        </View>
        <ProgressBar value={progress} height={6} />
      </View>

      <View style={{ flex: 1, padding: 20, gap: 18 }}>
        <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 30 }}>
          <Pressable
            onPress={() => current && speak(current.term, 'en')}
            style={{ alignItems: 'center', gap: 6 }}
          >
            <AppText variant="h1" weight="800" align="center">
              {current?.term}
            </AppText>
            <Ionicons name="volume-medium" size={20} color={colors.accent} />
          </Pressable>

          {revealed ? (
            <View style={{ gap: 8, alignItems: 'center' }}>
              <AppText variant="bodyLg" weight="700" align="center">
                {current?.meaning}
              </AppText>
              <AppText variant="small" tone="textHint" align="center">
                {current?.example}
              </AppText>
            </View>
          ) : (
            <AppText variant="small" tone="textMuted">
              {t('mobile.review.subtitle')}
            </AppText>
          )}
        </Card>

        <View style={{ gap: 10, marginTop: 'auto' }}>
          {!revealed ? (
            <Button
              label={t('mobile.lesson.check')}
              onPress={() => setRevealed(true)}
              size="lg"
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label={t('mobile.lesson.wrong')}
                variant="danger"
                onPress={() => answer(false)}
                style={{ flex: 1 }}
              />
              <Button
                label={t('mobile.lesson.correct')}
                onPress={() => answer(true)}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
