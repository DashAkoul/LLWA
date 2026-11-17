import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '../src/api';
import type { RoleplayResult, RoleplayScenario } from '../src/api';
import { useTheme } from '../src/theme/ThemeProvider';
import { AppText, Button, Card, Screen } from '../src/ui';

/**
 * نقش‌آفرینی — تنها جایی که کاربر تولید آزاد می‌کند و AI ارزیابی می‌کند.
 *
 * ⚠️ چرا فقط اینجا: ارزیابی آزاد گران است. تمرین‌های نوشتاری روزانه با
 * «ساخت جمله» قطعی سنجیده می‌شوند، ولی مهارت مکالمه بدون ارزیابی زبانی
 * قابل سنجش نیست.
 */
export default function RoleplayScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [scenario, setScenario] = useState<RoleplayScenario | null>(null);
  const [transcript, setTranscript] = useState<{ role: 'ai' | 'user'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<RoleplayResult | null>(null);

  const startMut = useMutation({
    mutationFn: () => api.roleplayStart(),
    onSuccess: (s) => {
      setScenario(s);
      setTranscript([{ role: 'ai', text: s.opening }]);
    },
  });

  const turnMut = useMutation({
    mutationFn: (text: string) =>
      api.roleplayTurn({
        scenario: scenario!.scenario,
        goal: scenario!.goal,
        aiRole: scenario!.aiRole,
        userRole: scenario!.userRole,
        transcript: [...transcript, { role: 'user', text }],
      }),
    onSuccess: (res, text) => {
      setTranscript((prev) => [...prev, { role: 'user', text }, { role: 'ai', text: res.reply }]);
    },
  });

  const finishMut = useMutation({
    mutationFn: () =>
      api.roleplayFinish({
        scenario: scenario!.scenario,
        goal: scenario!.goal,
        aiRole: scenario!.aiRole,
        userRole: scenario!.userRole,
        transcript,
      }),
    onSuccess: setResult,
  });

  const send = () => {
    const text = input.trim();
    if (!text || turnMut.isPending) return;
    setInput('');
    turnMut.mutate(text);
  };

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: insets.top + 8, flex: 1, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} onPress={() => router.back()} />
          <AppText variant="h2" weight="800" style={{ flex: 1 }}>
            {t('mobile.roleplay.title')}
          </AppText>
        </View>

        {!scenario ? (
          <Card style={{ gap: 12 }}>
            <AppText variant="body" tone="textHint">
              {t('mobile.roleplay.title')}
            </AppText>
            <Button
              label={t('mobile.roleplay.start')}
              onPress={() => startMut.mutate()}
              loading={startMut.isPending}
              icon="play"
            />
          </Card>
        ) : result ? (
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
            <Card style={{ gap: 8 }}>
              <AppText variant="title" weight="800">
                {result.verdict} · {result.score}
              </AppText>
              <AppText variant="small" tone="textHint">
                {result.summary}
              </AppText>
            </Card>

            {result.strengths?.length ? (
              <Card style={{ gap: 6 }}>
                <AppText variant="small" weight="700">
                  {t('mobile.roleplay.strengths')}
                </AppText>
                {result.strengths.map((s, i) => (
                  <AppText key={i} variant="small" tone="textHint">
                    • {s}
                  </AppText>
                ))}
              </Card>
            ) : null}

            {result.corrections?.length ? (
              <Card style={{ gap: 8 }}>
                <AppText variant="small" weight="700">
                  {t('mobile.roleplay.corrections')}
                </AppText>
                {result.corrections.map((c, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <AppText variant="small" style={{ color: colors.danger }}>
                      {c.original}
                    </AppText>
                    <AppText variant="small" style={{ color: colors.success }}>
                      {c.fixed}
                    </AppText>
                    {c.note ? (
                      <AppText variant="tiny" tone="textHint">
                        {c.note}
                      </AppText>
                    ) : null}
                  </View>
                ))}
              </Card>
            ) : null}

            <Button label={t('common.done')} onPress={() => router.back()} />
          </ScrollView>
        ) : (
          <>
            <Card style={{ gap: 4 }}>
              <AppText variant="caption" tone="textHint">
                {scenario.aiRole} ↔ {scenario.userRole}
              </AppText>
              <AppText variant="small">{scenario.scenario}</AppText>
            </Card>

            <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
              {transcript.map((m, i) => (
                <View
                  key={i}
                  style={{
                    alignSelf: m.role === 'ai' ? 'flex-start' : 'flex-end',
                    maxWidth: '85%',
                    backgroundColor: m.role === 'ai' ? colors.bgSecondary : colors.accentSoft,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <AppText variant="small">{m.text}</AppText>
                </View>
              ))}
              {turnMut.isPending ? <ActivityIndicator color={colors.accent} /> : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={t('mobile.roleplay.placeholder')}
                placeholderTextColor={colors.textMuted}
                style={{
                  flex: 1,
                  backgroundColor: colors.bgSecondary,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  height: 46,
                  color: colors.text,
                }}
                onSubmitEditing={send}
              />
              <Button
                label={t('mobile.roleplay.send')}
                onPress={send}
                fullWidth={false}
                disabled={!input.trim()}
              />
            </View>

            <Button
              label={t('mobile.roleplay.finish')}
              variant="secondary"
              onPress={() => finishMut.mutate()}
              loading={finishMut.isPending}
              disabled={transcript.length < 3}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
