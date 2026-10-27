/**
 * Bodies of the engagement transitions (direct-engage, engage, option-engage).
 */

/** Promotion = catalogue price − sale price (never negative, 0 if a price is missing). */
export function promotionAmount(lotPrice, salePrice) {
  if (lotPrice == null || salePrice == null) return 0;
  return Math.max(0, lotPrice - salePrice);
}

/**
 * `fields` (guarantee, client, notes, deposit decision…) + sale price,
 * promotion timing and payment plan, shared by every engagement.
 */
export function buildEngagePayload({ lotPrice, salePrice, promotionTiming, paymentPlan, ...fields }) {
  const hasPromotion = promotionAmount(lotPrice, salePrice) > 0;
  return {
    ...fields,
    sale_price: salePrice,
    promotion_paid_timing: hasPromotion ? promotionTiming : undefined,
    promotion_received: hasPromotion ? promotionTiming === 'debut' : false,
    payment_plan: paymentPlan,
  };
}

/** Refund part of a deposit / guarantee decision, from the refund form values. */
export function refundFields(releaseData) {
  return {
    refund_amount: parseFloat(releaseData.deposit_refund_amount),
    refund_date: releaseData.deposit_refund_date,
    refund_payment_type: releaseData.refund_payment_type || undefined,
  };
}
