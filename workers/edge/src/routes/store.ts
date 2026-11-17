import { purchasePlanSchema } from '@llwa/shared';
import type { Plan } from '@llwa/shared';
import type { RequestContext } from '../types';
import { jsonError, jsonSuccess, readJson } from '../lib/response';
import { ContentRepository } from '../services/repository';
import { SupabaseClient } from '../services/supabase';

/**
 * Store & payment.
 *
 * Phase 1 (locked decision): Telegram Stars ONLY.
 * ZarinPal + receipt bot are deferred; the seams are left in place
 * (payment_receipts table, PLAN_DEFINITIONS with priceIrr).
 *
 * Stars flow:
 *   create-invoice  → createInvoiceLink (XTR) → client opens link
 *   Telegram → bot webhook successful_payment → credit subscription
 */

function repo(env: RequestContext['env']): ContentRepository {
  return new ContentRepository(new SupabaseClient(env), env);
}

// ═════════════════════════════════════════════════════════════════════
// GET /gate?action=plans
// ═════════════════════════════════════════════════════════════════════

export async function handlePlans(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;
  const r = repo(env);

  const plans = await r.getPlans();
  const bankInfo = await r.getSetting<Record<string, string>>('bank_info');
  const features = await r.getSetting<Record<string, boolean>>('features');

  return jsonSuccess(
    {
      plans,
      bankInfo: features?.adminBotReceipt ? bankInfo : null,
      paymentMethods: {
        telegramStars: features?.telegramStars !== false,
        zarinpal: features?.zarinpal === true,
        adminReceipt: features?.adminBotReceipt === true,
      },
      starsOnly: features?.zarinpal !== true && features?.adminBotReceipt !== true,
    },
    requestId,
    env
  );
}

// ═════════════════════════════════════════════════════════════════════
// POST /gate?action=create-invoice
//
// Creates a Telegram Stars invoice link. Amount is in Stars (XTR).
// Discount is already folded into `finalPriceStars` by the repository.
// ═════════════════════════════════════════════════════════════════════

export async function handleCreateInvoice(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId, telegramId, userId } = context;

  if (!telegramId || !userId) {
    return jsonError('UNAUTHORIZED', 'No identity', requestId, env, 401);
  }

  const body = await readJson(request);
  const parsed = purchasePlanSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'planId is required', requestId, env, 400);
  }

  const r = repo(env);
  const plans = await r.getPlans();
  const plan = plans.find((p) => p.id === parsed.data.planId);

  if (!plan) {
    return jsonError('NOT_FOUND', `Unknown plan: ${parsed.data.planId}`, requestId, env, 404);
  }

  /**
   * تخفیف با سکه: اگر کاربر بخواهد، از **همهٔ** سکه‌هایش برای تخفیف
   * استفاده می‌شود (بعد از خرید موجودی صفر می‌شود).
   */
  const useCoins = (body as { useCoins?: unknown }).useCoins === true;

  let starsAmount = plan.finalPriceStars;
  let discountPercent = 0;
  let discountIrr = 0;

  if (useCoins) {
    const user = await r.findUserById(userId);
    const coins = user?.stars_balance ?? 0;

    const economy = await r.getEconomySettings();
    const rawCfg = (economy.coinDiscount ?? {}) as Partial<CoinDiscountConfig>;
    const cfg: CoinDiscountConfig = {
      coinsPerStep: Number(rawCfg.coinsPerStep) || DEFAULT_COIN_DISCOUNT.coinsPerStep,
      percentPerStep: Number(rawCfg.percentPerStep) || DEFAULT_COIN_DISCOUNT.percentPerStep,
    };

    // قیمت پلن یک‌ماهه = مرجع تخفیف
    const monthly = plans.find((pl) => pl.planType === '1_MONTH') ?? plan;
    const monthlyFinalIrr = Math.round(
      monthly.priceIrr * (1 - monthly.discountPercent / 100)
    );
    const planFinalIrr = Math.round(plan.priceIrr * (1 - plan.discountPercent / 100));

    const d = coinDiscountFor(coins, planFinalIrr, monthlyFinalIrr, cfg);
    discountPercent = d.percent;
    discountIrr = d.irr;
    starsAmount = Math.max(1, Math.ceil(plan.finalPriceStars * (1 - d.percent / 100)));
  }

  /**
   * ⚠️ درگاه پرداخت هنوز متصل نشده است.
   *
   * قبلاً اینجا فاکتور Telegram Stars ساخته می‌شد. با منسوخ شدن مینی‌اپ
   * آن مسیر حذف شد؛ تا اتصال درگاه ریالی (زرین‌پال / آی‌دی‌پی) این اکشن
   * صریحاً «در دسترس نیست» برمی‌گرداند تا کلاینت پیام روشن نشان دهد و
   * کاربر فکر نکند پرداخت انجام شده است.
   */
  return jsonError(
    'PAYMENT_UNAVAILABLE',
    'Payment gateway is not configured yet',
    requestId,
    env,
    503,
    'errors.payment_unavailable'
  );
}

// ═════════════════════════════════════════════════════════════════════
// Telegram createInvoiceLink
// ═════════════════════════════════════════════════════════════════════

/**
 * تخفیف بر اساس سکه — **نرخ تبدیل به کاربر نشان داده نمی‌شود**.
 *
 * قاعده: هر `coinsPerStep` سکه = `percentPerStep`٪ تخفیف روی پلن **یک‌ماهه**.
 * برای پلن‌های دیگر، همان «مبلغ تخفیف» محاسبه و به درصدِ همان پلن تبدیل
 * می‌شود؛ پس درصد در پلن‌های بلندتر کمتر می‌شود (چون قیمتشان بیشتر است).
 */
export interface CoinDiscountConfig {
  coinsPerStep: number;
  percentPerStep: number;
}

export const DEFAULT_COIN_DISCOUNT: CoinDiscountConfig = {
  coinsPerStep: 1000,
  percentPerStep: 5,
};

/** حداکثر تخفیف مجاز (درصد) — جلوگیری از اشتراک رایگان */
const MAX_COIN_DISCOUNT_PCT = 90;

export function coinDiscountFor(
  coins: number,
  planFinalIrr: number,
  monthlyFinalIrr: number,
  cfg: CoinDiscountConfig
): { percent: number; irr: number; steps: number } {
  const step = Math.max(1, cfg.coinsPerStep);
  const steps = Math.floor(Math.max(0, coins) / step);
  if (steps <= 0 || planFinalIrr <= 0) return { percent: 0, irr: 0, steps: 0 };

  const moneyIrr = steps * monthlyFinalIrr * (cfg.percentPerStep / 100);
  const percent = Math.min(
    MAX_COIN_DISCOUNT_PCT,
    Math.floor((moneyIrr / planFinalIrr) * 100)
  );
  return { percent, irr: Math.round((planFinalIrr * percent) / 100), steps };
}

export interface InvoiceResult {
  ok: boolean;
  invoiceLink?: string;
  error?: string;
}
