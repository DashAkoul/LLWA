import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api';
import type { Lesson } from '../../src/api';
import { useAuth } from '../../src/auth/AuthProvider';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useSpeech } from '../../src/hooks/useSpeech';
import { AppText, Button, Card, EmptyState, ProgressBar } from '../../src/ui';

/**
 * پخش‌کنندهٔ درس.
 *
 * ساختار (طبق قواعد آموزشی محصول):
 *   بخش ۱ — تمرین الگو: معنی → مثال → شنیداری → نمایش → الگو → ساخت جمله
 *   بخش ۲ — کاربرد واقعی: سناریو + چند سؤال
 *   بخش ۳ — داستان: متن + سؤال درک مطلب
 *
 * ⚠️ قواعدی که عمداً رعایت شده‌اند:
 *   • تمرین نوشتاری آزاد با AI ارزیابی نمی‌شود؛ «ساخت جمله با کاشی واژه»
 *     قطعی است و هزینهٔ توکن ندارد.
 *   • در مرحلهٔ شنیداری، خودِ واژه نمایش داده نمی‌شود (وگرنه سؤال بی‌معنی است).
 *   • گزینه‌های انتخاب‌شده متن تیره دارند تا روی تینت روشن خوانا بمانند.
 */

type Step = 'meaning' | 'example' | 'listen' | 'reveal' | 'pattern' | 'write';

interface Answer {
  term: string;
  isCorrect: boolean;
  responseMs: number;
  skill?: string;
  errorType?: string;
}

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { speak } = useSpeech();

  const startedAt = useRef(Date.now());
  const questionShownAt = useRef(Date.now());

  const lessonQuery = useQuery({
    queryKey: ['lesson', id],
    queryFn: async () => {
      const res = await api.home();
      if (res.lesson && res.lesson.id === id) return res.lesson;
      if (res.lesson) return res.lesson;
      throw new Error('lesson_not_found');
    },
    staleTime: 0,
  });

  const lesson = lessonQuery.data;

  const [part, setPart] = useState<1 | 2 | 3>(1);
  const [itemIndex, setItemIndex] = useState(0);
  const [step, setStep] = useState<Step>('reveal');
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [builtIdx, setBuiltIdx] = useState<number[]>([]);
  const [buildResult, setBuildResult] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const items = lesson?.part1?.items ?? [];
  const current = items[itemIndex];

  // اولین مرحلهٔ ممکن برای آیتم جاری
  const firstStepFor = useCallback((item: typeof current): Step => {
    if (item?.meaningOptions) return 'meaning';
    if (item?.exampleOptions) return 'example';
    return 'reveal';
  }, []);

  const stepAfter = useCallback(
    (s: Step, item: typeof current): Step | null => {
      if (s === 'meaning') return item?.exampleOptions ? 'example' : 'reveal';
      if (s === 'example') return item?.listeningOptions ? 'listen' : 'reveal';
      if (s === 'listen') return 'reveal';
      if (s === 'reveal') {
        if (item?.substitution && item.substitution.correctIndex !== undefined) return 'pattern';
        return item?.wordOrder || item?.freeWrite ? 'write' : null;
      }
      if (s === 'pattern') return item?.wordOrder || item?.freeWrite ? 'write' : null;
      return null;
    },
    []
  );

  // با تغییر آیتم، مرحله را ریست کن
  useEffect(() => {
    setStep(firstStepFor(current));
    setSelected(null);
    setChecked(false);
    setAttempts(0);
    setBuiltIdx([]);
    setBuildResult(null);
    questionShownAt.current = Date.now();
  }, [itemIndex, part, current, firstStepFor]);

  const choice = useMemo(() => {
    if (!current) return undefined;
    if (step === 'meaning') return current.meaningOptions;
    if (step === 'example') return current.exampleOptions;
    if (step === 'pattern' && current.substitution) {
      return {
        options: current.substitution.slots,
        correctIndex: current.substitution.correctIndex ?? 0,
      };
    }
    return undefined;
  }, [current, step]);

  const record = useCallback(
    (isCorrect: boolean, term?: string) => {
      setAnswers((prev) => [
        ...prev,
        {
          term: term ?? current?.term ?? 'unknown',
          isCorrect,
          responseMs: Date.now() - questionShownAt.current,
          skill: step === 'listen' ? 'LISTENING' : 'MEANING',
        },
      ]);
      questionShownAt.current = Date.now();
    },
    [current?.term, step]
  );

  // ── بررسی پاسخ چندگزینه‌ای ──────────────────────────────────────
  const checkChoice = () => {
    if (!choice || selected === null) return;
    const ok = selected === choice.correctIndex;
    setChecked(true);
    if (!ok && attempts === 0) {
      // یک تلاش دوباره با راهنما
      setAttempts(1);
      record(false);
      return;
    }
    record(ok);
  };

  // ── ساخت جمله ───────────────────────────────────────────────────
  const checkBuild = () => {
    const wo = current?.wordOrder;
    if (!wo) return;
    const built = builtIdx.map((i) => wo.words[i]).join(' ').trim().toLowerCase();
    const target = wo.answer.join(' ').trim().toLowerCase();
    const ok = built === target;
    setBuildResult(ok);
    record(ok);
  };

  const goNext = () => {
    const next = stepAfter(step, current);
    if (next) {
      setStep(next);
      setSelected(null);
      setChecked(false);
      setBuildResult(null);
      setBuiltIdx([]);
      questionShownAt.current = Date.now();
      return;
    }

    // آیتم بعدی
    if (itemIndex + 1 < items.length) {
      setItemIndex(itemIndex + 1);
      return;
    }

    // بخش بعدی
    if (part === 1) {
      setPart(2);
      setItemIndex(0);
      return;
    }
    if (part === 2) {
      if (lesson?.part3?.questions?.length) {
        setPart(3);
        setItemIndex(0);
      } else {
        void finish();
      }
      return;
    }
    void finish();
  };

  const finish = async () => {
    if (!lesson || submitting) return;
    setSubmitting(true);
    try {
      await api.completeLesson({
        lessonId: lesson.id,
        durationSeconds: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
        answers,
      });
      setFinished(true);
      refreshUser().catch(() => {});
    } catch (err) {
      Alert.alert(t('mobile.auth.failed'), err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmExit = () => {
    Alert.alert(t('mobile.lesson.exit'), t('mobile.lesson.exitConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => router.back() },
    ]);
  };

  if (lessonQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!lesson) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: insets.top + 20 }}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('mobile.home.noCycle')}
          action={t('common.back')}
          onAction={() => router.back()}
        />
      </View>
    );
  }

  // ── پایان درس ───────────────────────────────────────────────────
  if (finished) {
    const total = answers.length || 1;
    const correct = answers.filter((a) => a.isCorrect).length;
    const accuracy = Math.round((correct / total) * 100);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 40, gap: 18 }}
      >
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: colors.successSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark" size={40} color={colors.success} />
          </View>
          <AppText variant="h2" weight="800" align="center">
            {t('mobile.lesson.completed')}
          </AppText>
          <AppText variant="small" tone="textHint" align="center">
            {t('mobile.home.cycleCompleteHint')}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat label={t('mobile.lesson.accuracy')} value={`${accuracy}%`} />
          <Stat label={t('mobile.lesson.time')} value={`${minutes} ${t('mobile.settings.minutes')}`} />
          <Stat label={t('mobile.lesson.question')} value={String(answers.length)} />
        </View>

        <Button label={t('common.done')} onPress={() => router.back()} size="lg" />
      </ScrollView>
    );
  }

  // ── بخش ۲: کاربرد واقعی ─────────────────────────────────────────
  if (part === 2) {
    const questions = lesson.part2?.questions ?? [];
    const q = questions[itemIndex];
    return (
      <LessonShell
        title={lesson.title}
        part={2}
        index={itemIndex}
        total={questions.length}
        onExit={confirmExit}
      >
        {q ? (
          <View style={{ gap: 16 }}>
            <Card style={{ gap: 8 }}>
              <AppText variant="caption" tone="textHint">
                {lesson.part2.scenario}
              </AppText>
              <AppText variant="bodyLg" weight="600">
                {q.prompt}
              </AppText>
            </Card>

            <View style={{ gap: 10 }}>
              {q.options.map((opt, i) => (
                <OptionButton
                  key={i}
                  label={opt}
                  active={selected === i}
                  state={
                    checked
                      ? i === q.correctIndex
                        ? 'correct'
                        : selected === i
                          ? 'wrong'
                          : 'idle'
                      : 'idle'
                  }
                  onPress={() => {
                    if (checked) return;
                    setSelected(i);
                  }}
                />
              ))}
            </View>

            {checked && q.explanation ? (
              <Card style={{ backgroundColor: colors.bgSecondary }}>
                <AppText variant="small" tone="textHint">
                  {q.explanation}
                </AppText>
              </Card>
            ) : null}

            <Button
              label={checked ? t('mobile.lesson.next') : t('mobile.lesson.check')}
              onPress={() => {
                if (checked) {
                  if (itemIndex + 1 < questions.length) {
                    setItemIndex(itemIndex + 1);
                    setSelected(null);
                    setChecked(false);
                  } else if (lesson.part3?.questions?.length) {
                    setPart(3);
                    setItemIndex(0);
                    setSelected(null);
                    setChecked(false);
                  } else {
                    void finish();
                  }
                  return;
                }
                if (selected === null) return;
                const ok = selected === q.correctIndex;
                setChecked(true);
                record(ok, q.linkedTerm ?? q.id);
              }}
              disabled={selected === null && !checked}
              size="lg"
            />
          </View>
        ) : (
          <EmptyState icon="document-outline" title="—" action={t('mobile.lesson.finish')} onAction={goNext} />
        )}
      </LessonShell>
    );
  }

  // ── بخش ۳: داستان ───────────────────────────────────────────────
  if (part === 3) {
    const story = lesson.part3!;
    const questions = story.questions ?? [];
    const q = questions[itemIndex];

    return (
      <LessonShell
        title={story.title}
        part={3}
        index={itemIndex}
        total={Math.max(1, questions.length)}
        onExit={confirmExit}
      >
        <View style={{ gap: 16 }}>
          <Card style={{ gap: 10 }}>
            <AppText variant="caption" tone="textHint">
              {t('mobile.lesson.readStory')}
            </AppText>
            {story.lines.map((line, i) => (
              <View key={i} style={{ gap: 2 }}>
                {line.speaker ? (
                  <AppText variant="tiny" tone="textHint">
                    {line.speaker}
                  </AppText>
                ) : null}
                <Pressable onPress={() => speak(line.text, 'en')}>
                  <AppText variant="body" style={{ lineHeight: 26 }}>
                    {line.text}
                  </AppText>
                </Pressable>
              </View>
            ))}
          </Card>

          {q ? (
            <View style={{ gap: 12 }}>
              <AppText variant="bodyLg" weight="600">
                {q.prompt}
              </AppText>
              {q.options.map((opt, i) => (
                <OptionButton
                  key={i}
                  label={opt}
                  active={selected === i}
                  state={
                    checked
                      ? i === q.correctIndex
                        ? 'correct'
                        : selected === i
                          ? 'wrong'
                          : 'idle'
                      : 'idle'
                  }
                  onPress={() => {
                    if (checked) return;
                    setSelected(i);
                  }}
                />
              ))}
              <Button
                label={checked ? t('mobile.lesson.next') : t('mobile.lesson.check')}
                onPress={() => {
                  if (checked) {
                    if (itemIndex + 1 < questions.length) {
                      setItemIndex(itemIndex + 1);
                      setSelected(null);
                      setChecked(false);
                    } else {
                      void finish();
                    }
                    return;
                  }
                  if (selected === null) return;
                  setChecked(true);
                  record(selected === q.correctIndex, q.linkedTerm ?? q.id);
                }}
                disabled={selected === null && !checked}
                size="lg"
              />
            </View>
          ) : (
            <Button label={t('mobile.lesson.finish')} onPress={finish} loading={submitting} size="lg" />
          )}
        </View>
      </LessonShell>
    );
  }

  // ── بخش ۱: تمرین الگو ───────────────────────────────────────────
  return (
    <LessonShell
      title={lesson.title}
      part={1}
      index={itemIndex}
      total={items.length}
      onExit={confirmExit}
    >
      {!current ? (
        <EmptyState icon="document-outline" title="—" action={t('mobile.lesson.next')} onAction={goNext} />
      ) : (
        <View style={{ gap: 16 }}>
          {/* معنی */}
          {step === 'meaning' && current.meaningOptions ? (
            <ChoiceBlock
              title={t('mobile.lesson.chooseMeaning')}
              term={current.term}
              options={current.meaningOptions.options}
              correctIndex={current.meaningOptions.correctIndex}
              selected={selected}
              checked={checked}
              onSelect={setSelected}
              onSpeak={() => speak(current.speakText ?? current.term, 'en')}
            />
          ) : null}

          {/* مثال */}
          {step === 'example' && current.exampleOptions ? (
            <ChoiceBlock
              title={t('mobile.lesson.chooseMeaning')}
              term={current.example}
              options={current.exampleOptions.options}
              correctIndex={current.exampleOptions.correctIndex}
              selected={selected}
              checked={checked}
              onSelect={setSelected}
              onSpeak={() => speak(current.speakText ?? current.example, 'en')}
            />
          ) : null}

          {/* شنیداری — واژه پنهان است */}
          {step === 'listen' && current.listeningOptions ? (
            <View style={{ gap: 16 }}>
              <AppText variant="bodyLg" weight="600">
                {t('mobile.lesson.chooseWord')}
              </AppText>
              <Pressable
                onPress={() => speak(current.speakText ?? current.term, 'en')}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 30,
                  borderRadius: 18,
                  backgroundColor: colors.accentSoft,
                  gap: 8,
                }}
              >
                <Ionicons name="volume-high" size={34} color={colors.accent} />
                <AppText variant="small" style={{ color: colors.accent }}>
                  {t('mobile.lesson.playAudio')}
                </AppText>
              </Pressable>
              <View style={{ gap: 10 }}>
                {current.listeningOptions.options.map((opt, i) => (
                  <OptionButton
                    key={i}
                    label={opt}
                    active={selected === i}
                    state={
                      checked
                        ? i === current.listeningOptions!.correctIndex
                          ? 'correct'
                          : selected === i
                            ? 'wrong'
                            : 'idle'
                        : 'idle'
                    }
                    onPress={() => {
                      if (checked) return;
                      setSelected(i);
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* نمایش واژه */}
          {step === 'reveal' ? (
            <View style={{ gap: 14 }}>
              <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 26 }}>
                <Pressable onPress={() => speak(current.speakText ?? current.term, 'en')} style={{ alignItems: 'center', gap: 6 }}>
                  <AppText variant="h1" weight="800" align="center">
                    {current.term}
                  </AppText>
                  {current.pronunciation ? (
                    <AppText variant="small" tone="textHint">
                      {current.pronunciation}
                    </AppText>
                  ) : null}
                  <Ionicons name="volume-medium" size={20} color={colors.accent} />
                </Pressable>
                <AppText variant="bodyLg" weight="600" align="center">
                  {current.meaning}
                </AppText>
              </Card>

              <Card style={{ gap: 6 }}>
                <AppText variant="body">{current.example}</AppText>
                {current.exampleTranslation ? (
                  <AppText variant="small" tone="textHint">
                    {current.exampleTranslation}
                  </AppText>
                ) : null}
              </Card>

              {current.collocations?.length ? (
                <Card style={{ gap: 8 }}>
                  <AppText variant="caption" tone="textHint">
                    collocations
                  </AppText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {current.collocations.map((c, i) => (
                      <View
                        key={i}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          backgroundColor: colors.bgSecondary,
                        }}
                      >
                        <AppText variant="small">{c}</AppText>
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}
            </View>
          ) : null}

          {/* الگوی جایگزینی */}
          {step === 'pattern' && current.substitution ? (
            <View style={{ gap: 14 }}>
              <AppText variant="bodyLg" weight="600">
                {current.substitution.base}
              </AppText>
              <View style={{ gap: 10 }}>
                {current.substitution.slots.map((slot, i) => (
                  <OptionButton
                    key={i}
                    label={slot}
                    active={selected === i}
                    state={
                      checked
                        ? i === (current.substitution!.correctIndex ?? 0)
                          ? 'correct'
                          : selected === i
                            ? 'wrong'
                            : 'idle'
                        : 'idle'
                    }
                    onPress={() => {
                      if (checked) return;
                      setSelected(i);
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* ساخت جمله با کاشی واژه */}
          {step === 'write' && current.wordOrder ? (
            <View style={{ gap: 14 }}>
              <AppText variant="bodyLg" weight="600">
                {t('mobile.lesson.buildSentence')}
              </AppText>

              <View
                style={{
                  minHeight: 62,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: buildResult === null ? colors.border : buildResult ? colors.success : colors.danger,
                  backgroundColor: colors.bgSecondary,
                  padding: 10,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                {builtIdx.length === 0 ? (
                  <AppText variant="small" tone="textMuted">
                    …
                  </AppText>
                ) : (
                  builtIdx.map((wi, pos) => (
                    <Pressable
                      key={`${wi}-${pos}`}
                      disabled={buildResult !== null}
                      onPress={() => setBuiltIdx(builtIdx.filter((_, k) => k !== pos))}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <AppText variant="small" weight="600">
                        {current.wordOrder!.words[wi]}
                      </AppText>
                    </Pressable>
                  ))
                )}
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {current.wordOrder.words.map((w, wi) =>
                  builtIdx.includes(wi) ? null : (
                    <Pressable
                      key={wi}
                      disabled={buildResult !== null}
                      onPress={() => setBuiltIdx([...builtIdx, wi])}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 10,
                        backgroundColor: colors.bgSecondary,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <AppText variant="small" weight="600">
                        {w}
                      </AppText>
                    </Pressable>
                  )
                )}
              </View>

              {buildResult !== null ? (
                <AppText
                  variant="small"
                  weight="700"
                  style={{ color: buildResult ? colors.success : colors.danger }}
                >
                  {buildResult ? t('mobile.lesson.correct') : t('mobile.lesson.wrong')}
                </AppText>
              ) : null}
            </View>
          ) : null}

          {/* نوشتاری آزاد — بدون ارزیابی AI */}
          {step === 'write' && !current.wordOrder && current.freeWrite ? (
            <Card style={{ gap: 10 }}>
              <AppText variant="bodyLg" weight="600">
                {current.freeWrite.prompt}
              </AppText>
              <AppText variant="small" tone="textHint">
                {current.freeWrite.mustUse} · ≥ {current.freeWrite.minWords}
              </AppText>
              {current.freeWrite.sampleAnswer ? (
                <Card style={{ backgroundColor: colors.bgSecondary }}>
                  <AppText variant="small" tone="textHint">
                    {current.freeWrite.sampleAnswer}
                  </AppText>
                </Card>
              ) : null}
            </Card>
          ) : null}

          {/* اکشن */}
          {step !== 'reveal' && step !== 'write' ? (
            <Button
              label={checked ? t('mobile.lesson.next') : t('mobile.lesson.check')}
              onPress={() => {
                if (checked) {
                  goNext();
                  return;
                }
                if (step === 'listen' || step === 'meaning' || step === 'example') {
                  checkChoice();
                  return;
                }
                if (step === 'pattern') {
                  if (selected === null) return;
                  const ok = selected === (current.substitution?.correctIndex ?? 0);
                  setChecked(true);
                  record(ok);
                }
              }}
              disabled={selected === null && !checked}
              size="lg"
            />
          ) : null}

          {step === 'reveal' ? (
            <Button label={t('mobile.lesson.next')} onPress={goNext} size="lg" />
          ) : null}

          {step === 'write' ? (
            <Button
              label={buildResult !== null || !current.wordOrder ? t('mobile.lesson.next') : t('mobile.lesson.check')}
              onPress={() => {
                if (buildResult !== null || !current.wordOrder) {
                  goNext();
                  return;
                }
                checkBuild();
              }}
              disabled={current.wordOrder ? builtIdx.length !== current.wordOrder.words.length : false}
              size="lg"
            />
          ) : null}
        </View>
      )}
    </LessonShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// اجزای کمکی
// ─────────────────────────────────────────────────────────────────────

function LessonShell({
  title,
  part,
  index,
  total,
  onExit,
  children,
}: {
  title: string;
  part: number;
  index: number;
  total: number;
  onExit: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = total ? Math.min(1, (index + 1) / total) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 20, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={onExit} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.textHint} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" tone="textHint" numberOfLines={1}>
              {t('mobile.lesson.part')} {part} · {index + 1}/{total}
            </AppText>
            <AppText variant="small" weight="600" numberOfLines={1}>
              {title}
            </AppText>
          </View>
        </View>
        <ProgressBar value={progress} height={6} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function ChoiceBlock({
  title,
  term,
  options,
  correctIndex,
  selected,
  checked,
  onSelect,
  onSpeak,
}: {
  title: string;
  term: string;
  options: string[];
  correctIndex: number;
  selected: number | null;
  checked: boolean;
  onSelect: (i: number) => void;
  onSpeak: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <AppText variant="bodyLg" weight="600">
        {title}
      </AppText>
      <Pressable onPress={onSpeak} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText variant="h2" weight="800">
          {term}
        </AppText>
        <Ionicons name="volume-medium" size={20} color={colors.accent} />
      </Pressable>
      <View style={{ gap: 10 }}>
        {options.map((opt, i) => (
          <OptionButton
            key={i}
            label={opt}
            active={selected === i}
            state={
              checked
                ? i === correctIndex
                  ? 'correct'
                  : selected === i
                    ? 'wrong'
                    : 'idle'
                : 'idle'
            }
            onPress={() => {
              if (checked) return;
              onSelect(i);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function OptionButton({
  label,
  active,
  state,
  onPress,
}: {
  label: string;
  active?: boolean;
  state: 'idle' | 'correct' | 'wrong';
  onPress: () => void;
}) {
  const { colors } = useTheme();

  // ⚠️ متن گزینه‌ها همیشه تیره/روشنِ خوانا است — روی تینت سبز/قرمز هم.
  const bg =
    state === 'correct'
      ? colors.successSoft
      : state === 'wrong'
        ? colors.dangerSoft
        : active
          ? colors.accentSoft
          : colors.bgSecondary;

  const border =
    state === 'correct'
      ? colors.success
      : state === 'wrong'
        ? colors.danger
        : active
          ? colors.accentRing
          : colors.border;

  const textColor =
    state === 'correct' ? colors.successText : state === 'wrong' ? colors.dangerText : colors.text;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 15,
        borderRadius: 14,
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor: border,
        opacity: pressed ? 0.85 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      })}
    >
      <AppText variant="body" weight={active || state !== 'idle' ? '700' : '500'} style={{ color: textColor, flex: 1 }}>
        {label}
      </AppText>
      {state === 'correct' ? <Ionicons name="checkmark-circle" size={19} color={colors.success} /> : null}
      {state === 'wrong' ? <Ionicons name="close-circle" size={19} color={colors.danger} /> : null}
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bgSecondary,
        borderRadius: 14,
        padding: 12,
        alignItems: 'center',
        gap: 2,
      }}
    >
      <AppText variant="title" weight="800">
        {value}
      </AppText>
      <AppText variant="tiny" tone="textHint">
        {label}
      </AppText>
    </View>
  );
}
