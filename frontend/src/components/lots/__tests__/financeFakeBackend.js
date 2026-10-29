/**
 * Fake backend for reservation 11 — reference example of the spec (E4-T5):
 * agreed 500 000, deed 450 000, gap 50 000 at the end, first payment 100 000.
 * Each POST /payments adds its amount to the installment; the summary is recomputed.
 * `legacy`: reservation engaged before E4-T5 (amounts unknown, stored statuses).
 */
export function fakeFinanceBackend({ acteMinPaidPct = 10, legacy = false } = {}) {
  const installments = [
    { id: 1, payment_type: 'deposit', installment_number: 1, amount: 150000, due_date: '2026-10-28T00:00:00', received: 0 },
    { id: 2, payment_type: 'balance', installment_number: 1, amount: 100000, due_date: '2026-11-28T00:00:00', received: 0 },
    { id: 3, payment_type: 'balance', installment_number: 2, amount: 100000, due_date: '2026-12-28T00:00:00', received: 0 },
    { id: 4, payment_type: 'gap', installment_number: 1, amount: 50000, due_date: '2026-12-28T00:00:00', received: 0 },
  ]
  const payments = legacy ? [] : [
    { id: 1, amount: 100000, paid_on: '2026-10-28', method: 'cash', reference: null, installment_id: null, document_id: null, recorded_by_name: 'Test Commercial' },
  ]
  const status = (i) => (i.received <= 0 ? 'pending' : i.received >= i.amount ? 'paid' : 'partial')
  const summary = () => {
    if (legacy) {
      return {
        legacy: true, catalogue_price: 500000, agreed_total_price: null, acte_price: null, gap_amount: null,
        gap_due_timing: null, gap_due_date: null, first_payment: null, total_received: null, remaining: null,
        acte_min_paid_pct: acteMinPaidPct, acte_threshold_amount: null, acte_available: false,
        installments: installments.map((i) => ({ ...i, remaining: i.amount, status: 'pending' })),
        updated_at: '2026-10-28T10:00:00',
      }
    }
    const total = payments.reduce((s, p) => s + p.amount, 0)
    const threshold = (500000 * acteMinPaidPct) / 100
    return {
      legacy: false, catalogue_price: 500000, agreed_total_price: 500000, acte_price: 450000, gap_amount: 50000,
      gap_due_timing: 'fin', gap_due_date: null, first_payment: 100000,
      total_received: total, remaining: 500000 - total,
      acte_min_paid_pct: acteMinPaidPct, acte_threshold_amount: threshold, acte_available: total > 0 && total >= threshold,
      installments: installments.map((i) => ({ ...i, remaining: i.amount - i.received, status: status(i) })),
      updated_at: '2026-10-28T10:00:00',
    }
  }
  const json = (body, s = 200) => Promise.resolve({ ok: s < 400, status: s, json: () => Promise.resolve(body) })
  const fetchMock = vi.fn((url, options = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    if (path === '/api/reservations/11/financial-summary') return json(summary())
    if (path === '/api/reservations/11/payments' && options.method === 'POST') {
      const body = options.body
      const inst = installments.find((i) => i.id === Number(body.get('installment_id')))
      const amount = Number(body.get('amount'))
      inst.received += amount
      const payment = { id: payments.length + 1, amount, paid_on: body.get('paid_on'), method: body.get('method'), reference: null, installment_id: inst.id, document_id: null, recorded_by_name: 'Test Manager' }
      payments.push(payment)
      return json(payment, 201)
    }
    if (path === '/api/reservations/11/payments') return json(payments)
    return json({ detail: 'Not Found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
