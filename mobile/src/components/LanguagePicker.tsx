import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TARGET_LANGUAGES } from '@llwa/shared/constants';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, Sheet } from '../ui';

export interface LanguageOption {
  code: string;
  nativeName: string;
  labelEn: string;
  flag?: string;
  uiTranslated?: boolean;
  dialects?: { code: string; nativeName: string; labelEn: string }[];
}

/**
 * انتخابگر زبان با جست‌وجو.
 *
 * ⚠️ درس‌آموختهٔ وب: لیست باید داخل FlatList باشد نه داخل ScrollView تودرتو،
 * وگرنه اسکرول در شیت کار نمی‌کند و فقط چند ردیف اول دیده می‌شود
 * (باگ معروف «فقط ۷ زبان نمایش داده می‌شد»).
 */
export function LanguagePicker({
  visible,
  onClose,
  onSelect,
  selected,
  title,
  languages = TARGET_LANGUAGES as unknown as LanguageOption[],
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (lang: LanguageOption) => void;
  selected?: string | null;
  title: string;
  languages?: LanguageOption[];
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return languages;
    return languages.filter(
      (l) =>
        l.nativeName.toLowerCase().includes(needle) ||
        l.labelEn.toLowerCase().includes(needle) ||
        l.code.toLowerCase().includes(needle)
    );
  }, [languages, q]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {/* جست‌وجو */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.bgSecondary,
          borderRadius: 12,
          paddingHorizontal: 12,
          height: 44,
          marginBottom: 12,
        }}
      >
        <Ionicons name="search" size={17} color={colors.textHint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="…"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* ارتفاع ثابت تا FlatList اسکرول شود */}
      <View style={{ height: 420 }}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={14}
          windowSize={7}
          renderItem={({ item }) => {
            const active = selected === item.code;
            return (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  setQ('');
                  onClose();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: active ? colors.accentSoft : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <AppText style={{ fontSize: 20 }}>{item.flag ?? '🌐'}</AppText>
                <View style={{ flex: 1 }}>
                  <AppText variant="body" weight={active ? '700' : '500'}>
                    {item.nativeName}
                  </AppText>
                  <AppText variant="caption" tone="textHint">
                    {item.labelEn}
                  </AppText>
                </View>
                {active ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <AppText variant="small" tone="textHint" align="center" style={{ marginTop: 24 }}>
              —
            </AppText>
          }
        />
      </View>
    </Sheet>
  );
}
