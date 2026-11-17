import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '../src/api';
import type { DelayedCheckItem } from '../src/api';
import { useTheme } from '../src/theme/ThemeProvider';
import { AppText, Button, EmptyState, ProgressBar, Screen } from '../src/ui';

/**
 * سنجش یادآوری تأخیری.
 *
 * این با «مرور» فرق دارد: مرور برای نگه‌داشتن است، این برای **سنجیدن**
 * اینکه آیا آموخته‌ها بعد از چند روز هنوز در دسترس‌اند. نتیجه در شاخص
 * `delayedRecallPct` می‌نشیند و چرخهٔ بعدی را تنظیم می‌کند.
 */
export default function DelayedCheckScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<DelayedCheckItem[] | null>(null);
  const [lessonId, setLessonId] = useState<string | undefined>();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ term: string; isCorrect: boolean }[]>([]);
  const [done, setDone] = useState(false);

  const startMut = useMutation({
    mutationFn: () => api.delayedCheck(),
    onSuccess: (res) => {
      setItems(res.items ?? []);
      setLessonId(res.fromLessonId);
    },
  });

  const submitMut = useMutation({
    mutationFn: (payload: { term: string; isCorrect: boolean }[]) =>
      api.delayedSubmit({ answers: payload, lessonId }),
    onSuccess: () => setDone(true),
  });

  const current = items?.[index];

  const next = () => {
    if (!current || selected === null) return;
    const updated = [...answers, { term: current.term, isCorrect: selected === current.correctIndex }];
    setAnswers(updated);
    setSelected(null);
    if (index + 1 < (items?.length ?? 0)) {
      setIndex(index + 1);
    } else {
      submitMut.mutate(updated);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: insets.top + 8, flex: 1, gap: 16, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="close" size={24} color={colors.textHint} onPress={() => router.back()} />
          <AppText variant="bodyLg" weight="700">
            {t('mobile.progress.recall')}
          </AppText>
        </View>

        {done ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Ionicons name="checkmark-circle" size={54} color={colors.success} />
            <AppText variant="title" weight="800">
              {t('common.done')}
            </AppText>
            <Button label={t('common.back')} onPress={() => router.back()} />
          </View>
        ) : !items ? (
          <View style={{ gap: 14 }}>
            <AppText variant="body" tone="textHint">
              {t('mobile.progress.recall')}
            </AppText>
            <Button
              label={t('common.start')}
              onPress={() => startMut.mutate()}
              loading={startMut.isPending}
              size="lg"
            />
          </View>
        ) : submitMut.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : current ? (
          <View style={{ gap: 16, flex: 1 }}>
            <ProgressBar value={(index + 1) / items.length} height={6} />
            <AppText variant="bodyLg" weight="600">
              {t('mobile.lesson.chooseMeaning')}
            </AppText>
            <AppText variant="h2" weight="800">
              {current.term}
            </AppText>
            <View style={{ gap: 10 }}>
              {current.options.map((opt, i) => (
                <Pressable
                  key={i}
                  onPress={() => setSelected(i)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 15,
                    borderRadius: 14,
                    backgroundColor: selected === i ? colors.accentSoft : colors.bgSecondary,
                    borderWidth: 1.5,
                    borderColor: selected === i ? colors.accentRing : colors.border,
                  }}
                >
                  <AppText variant="body" weight={selected === i ? '700' : '500'}>
                    {opt}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <View style={{ marginTop: 'auto', paddingBottom: insets.bottom + 16 }}>
              <Button label={t('common.next')} onPress={next} disabled={selected === null} size="lg" />
            </View>
          </View>
        ) : (
          <EmptyState icon="time-outline" title="—" />
        )}
      </View>
    </Screen>
  );
}
