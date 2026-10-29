import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import PaymentsPanel from '../PaymentsPanel'

/**
 * Fake backend for reservation 11 — reference example of the spec (E4-T5):
 * agreed 500 000, deed 450 000, gap 50 000 at the end, first payment 100 000.
 * Each POST /payments adds its amount to the installment; the summary is recomputed.
 */
function fakeBackend({ acteMinPaidPct = 10 } = {}) {
  const installments = [
    { id: 1, payment_type: 'deposit', installment_number: 1, amount: 150000, due_date: '2026-10-28T00:00:00', received: 0 },
    { id: 2, payment_type: 'balance', installment_number: 1, amount: 100000, due_date: '2026-11-28T00:00:00', received: 0 },
    { id: 3, payment_type: 'balance', installment_number: 2, amount: 100000, due_date: '2026-12-28T00:00:00', received: 0 },
    { id: 4, payment_type: 'gap', installment_number: 1, amount: 50000, due_date: '2026-12-28T00:00:00', received: 0 },
  ]
  const payments = [
    { id: 1, amount: 100000, paid_on: '2026-10-28', method: 'cash', reference: null, installment_id: null, document_id: null, recorded_by_name: 'Test Commercial' },
  ]
  const status = (i) => (i.received <= 0 ? 'pending' : i.received >= i.amount ? 'paid' : 'partial')
  const summary = () => {
    const total = payments.reduce((s, p) => s + p.amount, 0)
    const threshold = (500000 * acteMinPaidPct) / 100
    return {
      catalogue_price: 500000, agreed_total_price: 500000, acte_price: 450000, gap_amount: 50000,
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

function renderPanel(props = {}) {
  return renderWithProviders(<PaymentsPanel reservationId={11} canRecord {...props} />, { user: { id: 1, role: 'manager' } })
}

const row = (name) => within(screen.getByRole('table', { name: 'Échéancier' })).getByRole('row', { name })
const totals = () => screen.getByRole('group', { name: 'Montants' })

async function recordOn(user, rowName) {
  await user.click(within(row(rowName)).getByRole('button', { name: 'Enregistrer un encaissement' }))
  await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))
  await waitFor(() => expect(screen.queryByRole('button', { name: "Enregistrer l'encaissement" })).not.toBeInTheDocument())
}

describe('PaymentsPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the amounts and the schedule with the gap on its own row', async () => {
    fakeBackend()
    renderPanel()

    expect(await within(await screen.findByRole('group', { name: 'Montants' })).findByText('400 000 MAD')).toBeInTheDocument()
    expect(within(totals()).getByText('Prix total convenu').nextSibling).toHaveTextContent('500 000 MAD')
    expect(within(totals()).getByText('Total encaissé').nextSibling).toHaveTextContent('100 000 MAD')
    expect(within(totals()).getByText('Reste à payer').nextSibling).toHaveTextContent('400 000 MAD')
    expect(row(/Acompte 1/)).toHaveTextContent('150 000 MAD')
    expect(row(/Écart à régulariser/)).toHaveTextContent('50 000 MAD')
    expect(row(/Écart à régulariser/)).toHaveClass('pay-row--gap')
    expect(within(row(/Écart à régulariser/)).getByText('À recevoir')).toBeInTheDocument()
  })

  it('follows the reference example: 400 000 → 50 000 → 0', async () => {
    fakeBackend()
    const onPaymentRecorded = vi.fn()
    const user = userEvent.setup()
    renderPanel({ onPaymentRecorded })
    await screen.findByRole('row', { name: /Acompte 1/ })

    await recordOn(user, /Acompte 1/)
    await recordOn(user, /Solde 1/)
    await recordOn(user, /Solde 2/)

    await waitFor(() => expect(within(totals()).getByText('Reste à payer').nextSibling).toHaveTextContent('50 000 MAD'))
    expect(within(totals()).getByText('Total encaissé').nextSibling).toHaveTextContent('450 000 MAD')
    expect(within(row(/Solde 2/)).getByText('Reçu')).toBeInTheDocument()
    expect(within(row(/Écart à régulariser/)).getByText('À recevoir')).toBeInTheDocument()

    await recordOn(user, /Écart à régulariser/)

    await waitFor(() => expect(within(totals()).getByText('Reste à payer').nextSibling).toHaveTextContent('0 MAD'))
    expect(within(row(/Écart à régulariser/)).getByText('Reçu')).toBeInTheDocument()
    expect(onPaymentRecorded).toHaveBeenCalledTimes(4)
  })

  it('shows a partially received installment and disables recording on a received one', async () => {
    fakeBackend()
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('row', { name: /Acompte 1/ })

    await user.click(within(row(/Écart à régulariser/)).getByRole('button', { name: 'Enregistrer un encaissement' }))
    const amount = screen.getByLabelText('Montant')
    expect(amount).toHaveValue(50000)
    await user.clear(amount)
    await user.type(amount, '20000')
    await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))

    await waitFor(() => expect(within(row(/Écart à régulariser/)).getByText('Partiellement reçu')).toBeInTheDocument())
    expect(within(row(/Écart à régulariser/)).getByRole('button', { name: 'Enregistrer un encaissement' })).toBeEnabled()

    await recordOn(user, /Acompte 1/)
    expect(within(row(/Acompte 1/)).getByRole('button', { name: 'Enregistrer un encaissement' })).toBeDisabled()
  })

  it('lists the payments, the first payment included', async () => {
    fakeBackend()
    renderPanel()

    const payments = await screen.findByRole('table', { name: 'Encaissements' })
    const first = within(payments).getAllByRole('row')[1]
    expect(first).toHaveTextContent('Premier acompte')
    expect(first).toHaveTextContent('100 000 MAD')
    expect(first).toHaveTextContent('Espèces')
    expect(first).toHaveTextContent('Test Commercial')
  })

  it('is read-only without the right to record', async () => {
    fakeBackend()
    renderPanel({ canRecord: false })

    await screen.findByRole('row', { name: /Acompte 1/ })
    expect(screen.queryByRole('button', { name: 'Enregistrer un encaissement' })).not.toBeInTheDocument()
  })

  it('tells when the deed is available', async () => {
    fakeBackend()
    renderPanel()

    expect(await screen.findByText('Acte disponible')).toBeInTheDocument()
  })

  it('shows the threshold message while the deed is not available', async () => {
    fakeBackend({ acteMinPaidPct: 30 })
    renderPanel()

    expect(await screen.findByText(
      "L'acte sera disponible quand 30 % du prix total convenu aura été encaissé (100 000 MAD sur 150 000 MAD)."
    )).toBeInTheDocument()
    expect(screen.queryByText('Acte disponible')).not.toBeInTheDocument()
  })

  it('can leave the deed status to its host and reports each summary', async () => {
    fakeBackend()
    const onSummaryChange = vi.fn()
    renderPanel({ showActeStatus: false, onSummaryChange })

    await waitFor(() => expect(onSummaryChange).toHaveBeenCalledWith(expect.objectContaining({ remaining: 400000, acte_available: true })))
    expect(screen.queryByText('Acte disponible')).not.toBeInTheDocument()
  })

  it('shows amounts with cents as the backend does', async () => {
    const summary = {
      catalogue_price: 450000, agreed_total_price: 450000, acte_price: 450000, gap_amount: 0,
      gap_due_timing: 'fin', gap_due_date: null, first_payment: 100000, total_received: 449999.6, remaining: 0.4,
      acte_min_paid_pct: 10, acte_threshold_amount: 45000, acte_available: true,
      installments: [
        { id: 7, payment_type: 'balance', installment_number: 1, amount: 116666.67, due_date: '2030-01-01T00:00:00', received: 116666.27, remaining: 0.4, status: 'partial' },
      ],
      updated_at: '2026-10-28T10:00:00',
    }
    vi.stubGlobal('fetch', vi.fn((url) => {
      const body = String(url).endsWith('/financial-summary') ? summary : []
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    }))
    renderPanel()

    expect(await screen.findByText('116 666,67 MAD')).toBeInTheDocument()
    expect(within(totals()).getByText('Reste à payer').nextSibling).toHaveTextContent('0,40 MAD')
    expect(within(totals()).getByText('Total encaissé').nextSibling).toHaveTextContent('449 999,60 MAD')
  })

  it('says so when the payments cannot be loaded, and still shows the schedule', async () => {
    const fetchMock = fakeBackend()
    const base = fetchMock.getMockImplementation()
    fetchMock.mockImplementation((url, opts) =>
      String(url).endsWith('/api/reservations/11/payments') && !opts?.method
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) })
        : base(url, opts))
    renderPanel()

    expect(await screen.findByText('Impossible de charger les encaissements.')).toBeInTheDocument()
    expect(row(/Acompte 1/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Encaissements' })).not.toBeInTheDocument()
  })

  it('shows a neutral message when the summary cannot be loaded', async () => {
    const onSummaryError = vi.fn()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) })))
    renderPanel({ onSummaryError })

    expect(await screen.findByText('Échéancier indisponible.')).toBeInTheDocument()
    expect(onSummaryError).toHaveBeenCalled()
  })
})
