import { buildEngagePayload, promotionAmount, refundFields } from '../engagePayload'

describe('promotionAmount', () => {
  it('is the catalogue price minus the sale price, never negative', () => {
    expect(promotionAmount(500000, 450000)).toBe(50000)
    expect(promotionAmount(500000, 550000)).toBe(0)
  })

  it('is 0 when a price is missing', () => {
    expect(promotionAmount(null, 450000)).toBe(0)
    expect(promotionAmount(500000, undefined)).toBe(0)
  })
})

describe('buildEngagePayload', () => {
  const plan = { deposit_pct: 50 }

  it('adds sale price, promotion and plan to the transition fields', () => {
    expect(
      buildEngagePayload({
        lotPrice: 500000,
        salePrice: 450000,
        promotionTiming: 'fin',
        paymentPlan: plan,
        guarantee_amount: 20000,
        payment_type: 'cash',
      })
    ).toEqual({
      guarantee_amount: 20000,
      payment_type: 'cash',
      sale_price: 450000,
      promotion_paid_timing: 'fin',
      promotion_received: false,
      payment_plan: plan,
    })
  })

  it('marks an upfront promotion as received', () => {
    const payload = buildEngagePayload({ lotPrice: 500000, salePrice: 450000, promotionTiming: 'debut' })
    expect(payload).toMatchObject({ promotion_paid_timing: 'debut', promotion_received: true })
  })

  it('sends no promotion timing without promotion', () => {
    const payload = buildEngagePayload({ lotPrice: 500000, salePrice: 500000, promotionTiming: 'debut' })
    expect(payload.promotion_paid_timing).toBeUndefined()
    expect(payload.promotion_received).toBe(false)
  })
})

describe('refundFields', () => {
  it('parses the amount and keeps date and payment type', () => {
    expect(
      refundFields({ deposit_refund_amount: '5000', deposit_refund_date: '2026-10-26', refund_payment_type: 'check' })
    ).toEqual({ refund_amount: 5000, refund_date: '2026-10-26', refund_payment_type: 'check' })
  })

  it('omits an empty payment type', () => {
    expect(refundFields({ deposit_refund_amount: '0', deposit_refund_date: '2026-10-26' }).refund_payment_type)
      .toBeUndefined()
  })
})
