import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api';
import { useAuth } from '../src/auth/AuthProvider';
import { useTheme } from '../src/theme/ThemeProvider';
import { AppText, Button, Card, EmptyState, Screen } from '../src/ui';

/**
 * فروشگاه.
 *
 * مدل: فریمیوم. چرخهٔ اول رایگان، بعد اشتراک. سکه‌ها تخفیف می‌دهند
 * (نه خرید کامل). نرخ تخفیف از پنل ادمین تنظیم می‌شود و کلاینت فقط
 * نتیجهٔ محاسبه‌شدهٔ سرور را نشان می‌دهد — نه محاسبهٔ محلی.
 */
export default function StoreScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const plansQuery = useQuery({ queryKey: ['plans'], queryFn: () => api.plans() });

  const plans = plansQuery.data?.plans ?? [];

  const buy = async (planId: string) => {
    try {
      const res = await api.createInvoice(planId, true);
      if (res.paymentUrl || res.invoiceUrl) {
        Alert.alert(t('mobile.store.title'), res.paymentUrl ?? res.invoiceUrl);
      } else {
        Alert.alert(t('mobile.store.paymentSoon'));
      }
    } catch (err) {
      Alert.alert(t('mobile.auth.failed'), err instanceof Error ? err.message : undefined);
    }
  };

  if (plansQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + 8, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <AppText variant="h2" weight="800">
              {t('mobile.store.title')}
            </AppText>
            <AppText variant="small" tone="textHint">
              {t('mobile.store.subtitle')}
            </AppText>
          </View>
        </View>

        {/* موجودی سکه */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="ellipse" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="body" weight="700">
              {user?.starsBalance ?? 0} {t('mobile.home.coins')}
            </AppText>
            <AppText variant="caption" tone="textHint">
              {t('mobile.store.coinHint')}
            </AppText>
          </View>
        </Card>

        {!plans.length ? (
          <EmptyState icon="pricetags-outline" title={t('mobile.store.noPlans')} />
        ) : (
          <View style={{ gap: 12 }}>
            {plans.map((p) => {
              const finalPrice = p.finalPriceIrr ?? p.priceIrr;
              const hasDiscount = finalPrice < p.priceIrr;
              return (
                <Card key={p.id} style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyLg" weight="700">
                        {p.titleFa}
                      </AppText>
                      <AppText variant="caption" tone="textHint">
                        {p.durationDays} {t('mobile.store.days')}
                      </AppText>
                    </View>
                    {p.badge ? (
                      <View
                        style={{
                          paddingHorizontal: 9,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: colors.successSoft,
                        }}
                      >
                        <AppText variant="tiny" style={{ color: colors.successText }}>
                          {p.badge}
                        </AppText>
                      </View>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                    <AppText variant="title" weight="800">
                      {finalPrice.toLocaleString('fa-IR')}
                    </AppText>
                    <AppText variant="caption" tone="textHint" style={{ marginBottom: 4 }}>
                      تومان
                    </AppText>
                    {hasDiscount ? (
                      <AppText
                        variant="caption"
                        tone="textMuted"
                        style={{ marginBottom: 4, textDecorationLine: 'line-through' }}
                      >
                        {p.priceIrr.toLocaleString('fa-IR')}
                      </AppText>
                    ) : null}
                  </View>

                  {hasDiscount ? (
                    <AppText variant="tiny" style={{ color: colors.success }}>
                      {t('mobile.store.withCoins')} −{Math.round(((p.priceIrr - finalPrice) / p.priceIrr) * 100)}%
                    </AppText>
                  ) : null}

                  <Button label={t('mobile.store.buy')} onPress={() => buy(p.id)} icon="card-outline" />
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}
