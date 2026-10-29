import { buildEngagePayload, engagementAmountsErrors, gapAmount, refundFields } from '../engagePayload'

describe('gapAmount', () => {
  it('is the agreed total price minus the deed price (reference example)', () => {
    expect(gapAmount(500000, 450000)).toBe(50000)
  })

  it('is computed in cents and never negative', () => {
    expect(gapAmount(100000.3, 100000.1)).toBe(0.2)
    expect(gapAmount(450000, 500000)).toBe(0)
  })

  it('is 0 when a price is missing or empty', () => {
    expect(gapAmount('', 450000)).toBe(0)
    expect(gapAmount(500000, undefined)).toBe(0)
    expect(gapAmount('500000', '450000')).toBe(50000)
  })
})

describe('engagementAmountsErrors', () => {
  const VALID = { agreedTotalPrice: '500000', salePrice: '450000', gapDueTiming: 'fin', gapDueDate: '', firstPayment: '100000' }

  it('accepts the reference example', () => {
    expect(engagementAmountsErrors(VALID)).toEqual({})
  })

  it('refuses a deed price above the agreed total price', () => {
    expect(engagementAmountsErrors({ ...VALID, salePrice: '550000' })).toEqual({
      salePrice: "Le prix figurant sur l'acte ne peut pas dépasser le prix total convenu.",
    })
  })

  it('asks for the gap date when the gap is due at a date', () => {
    expect(engagementAmountsErrors({ ...VALID, gapDueTiming: 'date' })).toEqual({
      gapDueDate: "Indiquez la date de l'écart.",
    })
    expect(engagementAmountsErrors({ ...VALID, gapDueTiming: 'date', gapDueDate: '2027-06-30' })).toEqual({})
  })

  it('ignores the gap date when there is no gap', () => {
    expect(engagementAmountsErrors({ ...VALID, salePrice: '500000', gapDueTiming: 'date' })).toEqual({})
  })

  it('requires an agreed total price and a deed price', () => {
    expect(engagementAmountsErrors({ ...VALID, agreedTotalPrice: '' })).toMatchObject({
      agreedTotalPrice: 'Indiquez le prix total convenu.',
    })
    expect(engagementAmountsErrors({ ...VALID, salePrice: '' })).toMatchObject({
      salePrice: "Indiquez le prix figurant sur l'acte.",
    })
  })

  it('refuses a first payment above the agreed total price', () => {
    expect(engagementAmountsErrors({ ...VALID, firstPayment: '600000' })).toEqual({
      firstPayment: 'Le premier acompte reçu ne peut pas dépasser le prix total convenu.',
    })
  })

  it('checks a read-only first payment passed as a number', () => {
    expect(engagementAmountsErrors({ ...VALID, firstPayment: '' }, { firstPayment: 600000 })).toEqual({
      firstPayment: 'Le premier acompte reçu ne peut pas dépasser le prix total convenu.',
    })
  })
})

describe('buildEngagePayload', () => {
  const plan = { deposit_pct: 50 }
  const AMOUNTS = { agreedTotalPrice: '500000', salePrice: '450000', gapDueTiming: 'fin', gapDueDate: '', firstPayment: '100000' }

  it('adds the agreed price, deed price, gap timing and plan to the transition fields', () => {
    expect(
      buildEngagePayload({
        amounts: AMOUNTS,
        paymentPlan: plan,
        guarantee_amount: 100000,
        payment_type: 'cash',
      })
    ).toEqual({
      guarantee_amount: 100000,
      payment_type: 'cash',
      agreed_total_price: 500000,
      sale_price: 450000,
      gap_due_timing: 'fin',
      gap_due_date: undefined,
      payment_plan: plan,
    })
  })

  it('sends the gap date only when the gap is due at a date', () => {
    expect(buildEngagePayload({ amounts: { ...AMOUNTS, gapDueTiming: 'date', gapDueDate: '2027-06-30' } }))
      .toMatchObject({ gap_due_timing: 'date', gap_due_date: '2027-06-30' })
    expect(buildEngagePayload({ amounts: { ...AMOUNTS, gapDueTiming: 'debut', gapDueDate: '2027-06-30' } }))
      .toMatchObject({ gap_due_timing: 'debut', gap_due_date: undefined })
  })

  it('sends no gap timing without a gap', () => {
    const payload = buildEngagePayload({ amounts: { ...AMOUNTS, salePrice: '500000', gapDueTiming: 'date' } })
    expect(payload.gap_due_timing).toBeUndefined()
    expect(payload.gap_due_date).toBeUndefined()
  })

  it('never sends a promotion field', () => {
    const payload = buildEngagePayload({ amounts: AMOUNTS, paymentPlan: plan })
    expect(Object.keys(payload).filter((key) => key.startsWith('promotion'))).toEqual([])
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
