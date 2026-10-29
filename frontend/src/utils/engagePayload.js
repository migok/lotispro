/**
 * Bodies and amounts of the engagement transitions (direct-engage, engage, option-engage).
 *
 * Vocabulary (spec E4-T5): « Prix total convenu » (agreed_total_price),
 * « Prix figurant sur l'acte » (sale_price), « Écart à régulariser » = convenu − acte
 * (computed, never typed), « Premier acompte reçu ».
 *
 * `amounts` = { agreedTotalPrice, salePrice, gapDueTiming, gapDueDate, firstPayment }
 * as typed in `EngagementAmountsFields` (strings or numbers).
 */

const toCents = (value) => Math.round(Number(value) * 100);

/** Number from a form value; `null` when empty or not a number. */
export function parseAmount(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Écart à régulariser = convenu − acte, computed in cents (0 if a price is missing, never negative). */
export function gapAmount(agreedTotalPrice, salePrice) {
  const agreed = parseAmount(agreedTotalPrice);
  const acte = parseAmount(salePrice);
  if (agreed == null || acte == null) return 0;
  return Math.max(0, toCents(agreed) - toCents(acte)) / 100;
}

/**
 * Inline errors of the engagement amounts, keyed by field (empty object = valid).
 * `options.firstPayment` (number) replaces `amounts.firstPayment` when the first
 * payment is not typed (deducted guarantee, edit mode).
 */
export function engagementAmountsErrors(amounts, { firstPayment } = {}) {
  const errors = {};
  const agreed = parseAmount(amounts.agreedTotalPrice);
  const acte = parseAmount(amounts.salePrice);
  const received = firstPayment ?? parseAmount(amounts.firstPayment);

  if (agreed == null || agreed <= 0) errors.agreedTotalPrice = 'Indiquez le prix total convenu.';
  if (acte == null || acte < 0) errors.salePrice = "Indiquez le prix figurant sur l'acte.";
  if (agreed != null && acte != null && toCents(acte) > toCents(agreed)) {
    errors.salePrice = "Le prix figurant sur l'acte ne peut pas dépasser le prix total convenu.";
  }
  if (agreed != null && received != null && toCents(received) > toCents(agreed)) {
    errors.firstPayment = 'Le premier acompte reçu ne peut pas dépasser le prix total convenu.';
  }
  if (gapAmount(agreed, acte) > 0 && amounts.gapDueTiming === 'date' && !amounts.gapDueDate) {
    errors.gapDueDate = "Indiquez la date de l'écart.";
  }
  return errors;
}

/** First error message of `engagementAmountsErrors`, or null. */
export function firstAmountsError(amounts, options) {
  return Object.values(engagementAmountsErrors(amounts, options))[0] ?? null;
}

/**
 * `fields` (first payment, client, notes, deposit decision…) + agreed total
 * price, deed price, gap timing and payment plan, shared by every engagement.
 * The gap timing is only sent when there is a gap; its date only for `date`.
 */
export function buildEngagePayload({ amounts, paymentPlan, ...fields }) {
  const hasGap = gapAmount(amounts.agreedTotalPrice, amounts.salePrice) > 0;
  const timing = hasGap ? amounts.gapDueTiming : undefined;
  return {
    ...fields,
    agreed_total_price: parseAmount(amounts.agreedTotalPrice) ?? undefined,
    sale_price: parseAmount(amounts.salePrice) ?? undefined,
    gap_due_timing: timing,
    gap_due_date: timing === 'date' ? amounts.gapDueDate || undefined : undefined,
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
