import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SKILL_LEVELS, LEARNING_GOALS, TARGET_LANGUAGES } from '@llwa/shared/constants';
import { api } from '../src/api';
import { useAuth } from '../src/auth/AuthProvider';
import { useTheme } from '../src/theme/ThemeProvider';
import { AppText, Button, Card, ProgressBar } from '../src/ui';
import { LanguagePicker, type LanguageOption } from '../src/components/LanguagePicker';
import i18n from '../src/i18n';

/**
 * آنبوردینگ — ۵ قدم کوتاه.
 *
 * چرا چندقدمی و نه یک فرم؟
 * ─────────────────────────
 * هر قدم فقط یک تصمیم می‌خواهد. این هم نرخ تکمیل را بالا می‌برد و هم
 * می‌توانیم در قدم آخر بودجهٔ زمانی را متناسب با سطح پیشنهاد بدهیم.
 */

const UI_LANGS: { code: 'fa' | 'en' | 'ar' | 'tr' | 'ru'; label: string }[] = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ru', label: 'Русский' },
];

const MINUTE_OPTIONS = [10, 15, 20, 30, 45, 60];

type Step = 'ui' | 'target' | 'dialect' | 'level' | 'goal' | 'minutes';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setUser, user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('ui');
  const [uiLanguage, setUiLanguage] = useState<'fa' | 'en' | 'ar' | 'tr' | 'ru'>(
    (user?.uiLanguage as 'fa') ?? 'fa'
  );
  const [targetLanguage, setTargetLanguage] = useState<string | null>(null);
  const [dialect, setDialect] = useState<string | null>(null);
  const [skillLevel, setSkillLevel] = useState<string | null>(null);
  const [learningGoal, setLearningGoal] = useState<string | null>(null);
  const [dailyMinutes, setDailyMinutes] = useState<number>(15);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedLanguage = useMemo<LanguageOption | null>(() => {
    if (!targetLanguage) return null;
    const catalog = TARGET_LANGUAGES as unknown as LanguageOption[];
    return catalog.find((l) => l.code === targetLanguage) ?? null;
  }, [targetLanguage]);

  const hasDialects = Boolean(selectedLanguage?.dialects?.length);

  const steps: Step[] = ['ui', 'target', ...(hasDialects ? (['dialect'] as Step[]) : []), 'level', 'goal', 'minutes'];
  const stepIndex = steps.indexOf(step);
  const progress = (stepIndex + 1) / steps.length;

  const goNext = () => {
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    const prev = steps[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const submit = async () => {
    if (!targetLanguage || !skillLevel || !learningGoal) return;
    setSaving(true);
    try {
      const res = await api.onboarding({
        uiLanguage,
        targetLanguage,
        skillLevel,
        learningGoal,
        dailyMinutes,
        dialect,
        timezone: safeTimezone(),
      });
      setUser(res.user);
      await i18n.changeLanguage(uiLanguage);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(
        t('mobile.auth.failed'),
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
      {/* نوار پیشرفت */}
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {stepIndex > 0 ? (
            <Pressable onPress={goBack} hitSlop={10}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </Pressable>
          ) : (
            <View style={{ width: 22 }} />
          )}
          <AppText variant="caption" tone="textHint">
            {stepIndex + 1} / {steps.length}
          </AppText>
        </View>
        <ProgressBar value={progress} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 'ui' ? (
          <Section title={t('mobile.settings.language')}>
            <View style={{ gap: 8 }}>
              {UI_LANGS.map((l) => (
                <OptionRow
                  key={l.code}
                  label={l.label}
                  active={uiLanguage === l.code}
                  onPress={() => {
                    setUiLanguage(l.code);
                    i18n.changeLanguage(l.code).catch(() => {});
                    goNext();
                  }}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {step === 'target' ? (
          <Section title={t('mobile.settings.targetLanguage')}>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colors.bgSecondary,
                borderRadius: 12,
                paddingHorizontal: 14,
                height: 52,
              }}
            >
              <AppText variant="body" weight={targetLanguage ? '700' : '400'} tone={targetLanguage ? 'text' : 'textHint'}>
                {selectedLanguage
                  ? `${selectedLanguage.flag ?? ''} ${selectedLanguage.nativeName}`
                  : '—'}
              </AppText>
              <Ionicons name="chevron-down" size={18} color={colors.textHint} />
            </Pressable>
          </Section>
        ) : null}

        {step === 'dialect' && selectedLanguage?.dialects ? (
          <Section title={t('mobile.settings.targetLanguage')}>
            <View style={{ gap: 8 }}>
              {selectedLanguage.dialects.map((d) => (
                <OptionRow
                  key={d.code}
                  label={d.nativeName}
                  hint={d.labelEn}
                  active={dialect === d.code}
                  onPress={() => {
                    setDialect(d.code);
                    goNext();
                  }}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {step === 'level' ? (
          <Section title={t('mobile.progress.skills')}>
            <View style={{ gap: 8 }}>
              {SKILL_LEVELS.map((s) => (
                <OptionRow
                  key={s.code}
                  label={s.labelFa}
                  hint={s.hintFa}
                  active={skillLevel === s.code}
                  onPress={() => {
                    setSkillLevel(s.code);
                    goNext();
                  }}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {step === 'goal' ? (
          <Section title={t('mobile.home.objective')}>
            <View style={{ gap: 8 }}>
              {LEARNING_GOALS.map((g) => (
                <OptionRow
                  key={g.code}
                  label={`${g.icon}  ${g.labelFa}`}
                  active={learningGoal === g.code}
                  onPress={() => {
                    setLearningGoal(g.code);
                    goNext();
                  }}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {step === 'minutes' ? (
          <Section title={t('mobile.settings.dailyMinutes')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {MINUTE_OPTIONS.map((m) => {
                const active = dailyMinutes === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setDailyMinutes(m)}
                    style={{
                      width: '30%',
                      paddingVertical: 18,
                      borderRadius: 14,
                      alignItems: 'center',
                      backgroundColor: active ? colors.accentSoft : colors.bgSecondary,
                      borderWidth: 1,
                      borderColor: active ? colors.accentRing : colors.border,
                    }}
                  >
                    <AppText variant="title" weight="800" tone={active ? 'accent' : 'text'}>
                      {m}
                    </AppText>
                    <AppText variant="caption" tone="textHint">
                      {t('mobile.settings.minutes')}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <Card style={{ marginTop: 16 }}>
              <AppText variant="small" tone="textHint">
                {t('mobile.home.objective')}: {dailyMinutes} {t('mobile.settings.minutes')}
              </AppText>
            </Card>
          </Section>
        ) : null}
      </ScrollView>

      {/* دکمهٔ ادامه — فقط برای قدم‌هایی که انتخاب فوری ندارند */}
      {step === 'target' || step === 'minutes' ? (
        <View
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: insets.bottom + 16,
          }}
        >
          <Button
            label={step === 'minutes' ? t('common.done') : t('common.continue')}
            onPress={step === 'minutes' ? submit : goNext}
            disabled={
              (step === 'target' && !targetLanguage) ||
              (step === 'minutes' && (!skillLevel || !learningGoal))
            }
            loading={saving}
            size="lg"
          />
        </View>
      ) : null}

      <LanguagePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('mobile.settings.targetLanguage')}
        selected={targetLanguage}
        onSelect={(lang) => {
          setTargetLanguage(lang.code);
          // گویش قبلی برای زبان دیگر بی‌معنی است
          setDialect(null);
        }}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 14 }}>
      <AppText variant="h2" weight="800">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function OptionRow({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint?: string;
  active?: boolean;
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
        borderRadius: 14,
        backgroundColor: active ? colors.accentSoft : colors.bgSecondary,
        borderWidth: 1,
        borderColor: active ? colors.accentRing : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="body" weight={active ? '700' : '500'}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="caption" tone="textHint">
            {hint}
          </AppText>
        ) : null}
      </View>
      {active ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

function safeTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tehran';
  } catch {
    return 'Asia/Tehran';
  }
}
