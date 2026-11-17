/**
 * Primitives — بلوک‌های سازندهٔ رابط کاربری.
 *
 * چرا یک فایل؟
 * ─────────────
 * در وب از کلاس‌های Tailwind استفاده می‌کردیم که هر جا تکرار می‌شدند. در
 * React Native استایل آبجکت است و تکرارش هم کد را شلوغ می‌کند هم تم
 * تاریک/روشن را ناهماهنگ. پس همهٔ بلوک‌های پایه یک‌جا و از روی توکن‌ها
 * ساخته شده‌اند.
 *
 * ⚠️ قانون: در صفحات هرگز رنگ هارد‌کد نکن — از `useTheme()` استفاده کن.
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/ThemeProvider';

// ─────────────────────────────────────────────────────────────────────
// Text
// ─────────────────────────────────────────────────────────────────────

type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'title'
  | 'bodyLg'
  | 'body'
  | 'small'
  | 'caption'
  | 'tiny';

const VARIANT_SIZE: Record<TextVariant, number> = {
  display: 40,
  h1: 30,
  h2: 24,
  title: 20,
  bodyLg: 17,
  body: 15,
  small: 13,
  caption: 12,
  tiny: 11,
};

const VARIANT_WEIGHT: Record<TextVariant, TextStyle['fontWeight']> = {
  display: '800',
  h1: '800',
  h2: '700',
  title: '700',
  bodyLg: '600',
  body: '400',
  small: '400',
  caption: '400',
  tiny: '600',
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  /** نام رنگ در تم — مثلاً 'textHint' یا 'danger' */
  tone?: keyof Theme['colors'];
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

export function AppText({
  variant = 'body',
  tone = 'text',
  weight,
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: VARIANT_SIZE[variant],
          fontWeight: weight ?? VARIANT_WEIGHT[variant],
          color: colors[tone],
          textAlign: align,
          // ارتفاع خط کمی بیشتر از فونت تا متن فارسی/لاتین نفس بکشد
          lineHeight: Math.round(VARIANT_SIZE[variant] * 1.45),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────

export interface ScreenProps {
  children: React.ReactNode;
  /** اگر true، محتوا داخل ScrollView می‌رود */
  scroll?: boolean;
  /** پدینگ افقی پیش‌فرض ۲۰ */
  padded?: boolean;
  /** فضای اضافی پایین (برای تب‌بار) */
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  bottomInset = 0,
  style,
  contentStyle,
  refreshControl,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = {
    paddingHorizontal: padded ? 20 : 0,
    paddingBottom: insets.bottom + 24 + bottomInset,
  };

  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: colors.bg }, style]}
      contentContainerStyle={[pad, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  padded = true,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
}) {
  const { colors, radius, shadow } = useTheme();
  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: padded ? 16 : 0,
    },
    shadow,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [base, pressed && { opacity: 0.75 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

// ─────────────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  fullWidth = true,
  size = 'md',
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary'
      ? colors.accent
      : variant === 'danger'
        ? colors.dangerSoft
        : variant === 'secondary'
          ? colors.bgSecondary
          : 'transparent';

  const fg =
    variant === 'primary'
      ? colors.accentText
      : variant === 'danger'
        ? colors.dangerText
        : variant === 'secondary'
          ? colors.text
          : colors.accent;

  const heights = { sm: 38, md: 48, lg: 54 };
  const fontSize = { sm: 14, md: 16, lg: 17 };

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled) }}
      style={({ pressed }) => [
        {
          height: heights[size],
          borderRadius: radius.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 18,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          borderWidth: variant === 'ghost' ? 0 : 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: fontSize[size], fontWeight: '700' }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Chip
// ─────────────────────────────────────────────────────────────────────

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.accentSoft : colors.bgSecondary,
        borderWidth: 1,
        borderColor: selected ? colors.accentRing : colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={selected ? colors.accent : colors.textHint} />
      ) : null}
      <Text
        style={{
          fontSize: 13,
          fontWeight: selected ? '700' : '500',
          color: selected ? colors.accent : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ProgressBar
// ─────────────────────────────────────────────────────────────────────

export function ProgressBar({
  value,
  height = 8,
  tone = 'accent',
}: {
  /** بین ۰ و ۱ */
  value: number;
  height?: number;
  tone?: 'accent' | 'success' | 'warning';
}) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fill = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.accent;
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: colors.bgSecondary,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: fill,
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Divider / SectionTitle / EmptyState
// ─────────────────────────────────────────────────────────────────────

export function Divider({ vertical = 0 }: { vertical?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: vertical,
      }}
    />
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}
    >
      <AppText variant="title" weight="700">
        {title}
      </AppText>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  action,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.bgSecondary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={26} color={colors.textHint} />
      </View>
      <AppText variant="bodyLg" weight="700" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="small" tone="textHint" align="center" style={{ maxWidth: 300 }}>
          {body}
        </AppText>
      ) : null}
      {action && onAction ? (
        <Button label={action} onPress={onAction} variant="secondary" size="sm" fullWidth={false} style={{ marginTop: 6 }} />
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sheet — پایین‌کش استاندارد
// ─────────────────────────────────────────────────────────────────────

/**
 * ⚠️ درس‌آموختهٔ وب: هر bottom-sheet باید `flex-col` + سقف ارتفاع داشته باشد،
 * هدر `shrink-0` و لیست `flex-1` با اسکرول. وگرنه فقط چند ردیف اول دیده
 * می‌شود. اینجا همان ساختار با Modal رعایت شده.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        {/* کلیک داخل شیت نباید آن را ببندد */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            maxHeight: '85%',
            paddingBottom: insets.bottom + 12,
          }}
        >
          {title ? (
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <AppText variant="title" weight="700">
                {title}
              </AppText>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textHint} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StatTile
// ─────────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  icon,
  tone = 'accent',
}: {
  label: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}) {
  const { colors } = useTheme();
  const colorMap = {
    accent: colors.accent,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  };
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: colors.bgSecondary,
        borderRadius: 14,
        padding: 12,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon ? <Ionicons name={icon} size={13} color={colorMap[tone]} /> : null}
        <AppText variant="tiny" tone="textHint" numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText variant="title" weight="800" style={{ color: colorMap[tone] }}>
        {value}
      </AppText>
    </View>
  );
}
