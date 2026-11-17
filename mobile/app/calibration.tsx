import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '../src/api';
import type { CalibrationItem } from '../src/api';
import { useAuth } from '../src/auth/AuthProvider';
import { useTheme } from '../src/theme/ThemeProvider';
import { useSpeech } from '../src/hooks/useSpeech';
import { AppText, Button, Card, EmptyState, ProgressBar, Screen } from '../src/ui';

/**
 * آزمون تعیین سطح.
 *
 * فراخوانی AI #۱ محصول: تولید سؤال بر اساس زبان مبدأ/مقصد، سطح خوداظهاری
 * و هدف کاربر. نتیجه، سطح دقیق در همهٔ مهارت‌های مرتبط با آن هدف است.
 *
 * ⚠️ زمان پاسخ هر سؤال اندازه‌گیری می‌شود؛ سرعت پاسخ یکی از سیگنال‌های
 * تعیین سطح است (حدس زدن تصادفی سریع‌تر از دانستن نیست، ولی تأمل طولانی
 * نشانهٔ عدم تسلط است).
 */
export default function CalibrationScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { speak } = useSpeech();

  const [items, setItems] = useState<CalibrationItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ term: string; isCorrect: boolean; responseMs: number }[]>([]);
  const [result, setResult] = useState<{ estimated: string; scorePct: number } | null>(null);
  const shownAt = useRef(Date.now());

  const startMut = useMutation({
    mutationFn: () => api.calibrationTest(),
    onSuccess: (res) => {
      if (res.alreadyCalibrated) {
        setResult(res.calibration ?? { estimated: '—', scorePct: 0 });
        return;
      }
      setItems(res.items ?? []);
      shownAt.current = Date.now();
    },
  });

  const submitMut = useMutation({
    mutationFn: () => api.calibrationSubmit({ answers }),
    onSuccess: (res) => {
      setResult({ estimated: res.estimated, scorePct: res.scorePct });
      refreshUser().catch(() => {});
    },
  });

  const current = items?.[index];

  const next = () => {
    if (!current || selected === null) return;
    const isCorrect = selected === current.correctIndex;
    const updated = [
      ...answers,
      { term: current.term, isCorrect, responseMs: Date.now() - shownAt.current },
    ];
    setAnswers(updated);
    setSelected(null);
    shownAt.current = Date.now();

    if (index + 1 < (items?.length ?? 0)) {
      setIndex(index + 1);
    } else {
      // آخرین سؤال — ارسال همهٔ پاسخ‌ها
      submitMut.mutate();
      setAnswers(updated);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: insets.top + 8, flex: 1, gap: 16, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="close" size={24} color={colors.textHint} onPress={() => router.back()} />
          <AppText variant="bodyLg" weight="700" style={{ flex: 1 }}>
            {t('calibration.title', { defaultValue: 'تعیین سطح' })}
          </AppText>
        </View>

        {result ? (
          <View style={{ gap: 16, alignItems: 'center', paddingTop: 30 }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="h1" weight="800" style={{ color: colors.accent }}>
                {result.estimated}
              </AppText>
            </View>
            <AppText variant="title" weight="800">
              {t('calibration.title', { defaultValue: 'تعیین سطح' })}
            </AppText>
            <AppText variant="body" tone="textHint">
              {Math.round(result.scorePct)}%
            </AppText>
            <Button label={t('common.done')} onPress={() => router.back()} size="lg" />
          </View>
        ) : !items ? (
          <Card style={{ gap: 12 }}>
            <AppText variant="body" tone="textHint">
              {t('calibration.title', { defaultValue: 'تعیین سطح' })}
            </AppText>
            <Button
              label={t('common.start')}
              onPress={() => startMut.mutate()}
              loading={startMut.isPending}
              size="lg"
            />
          </Card>
        ) : submitMut.isPending ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <ActivityIndicator color={colors.accent} />
            <AppText variant="small" tone="textHint">
              {t('common.loading')}
            </AppText>
          </View>
        ) : current ? (
          <View style={{ gap: 16, flex: 1 }}>
            <ProgressBar value={(index + 1) / items.length} height={6} />

            <AppText variant="bodyLg" weight="600">
              {current.kind === 'LISTENING' ? t('mobile.lesson.chooseWord') : t('mobile.lesson.chooseMeaning')}
            </AppText>

            {current.kind === 'LISTENING' ? (
              <Pressable
                onPress={() => speak(current.term, 'en')}
                style={{
                  alignItems: 'center',
                  paddingVertical: 26,
                  borderRadius: 18,
                  backgroundColor: colors.accentSoft,
                  gap: 8,
                }}
              >
                <Ionicons name="volume-high" size={32} color={colors.accent} />
              </Pressable>
            ) : (
              <AppText variant="h2" weight="800">
                {current.term}
              </AppText>
            )}

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
              <Button
                label={t('common.next')}
                onPress={next}
                disabled={selected === null}
                size="lg"
              />
            </View>
          </View>
        ) : (
          <EmptyState icon="help-circle-outline" title="—" />
        )}
      </View>
    </Screen>
  );
}
