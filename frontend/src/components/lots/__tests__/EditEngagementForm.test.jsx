import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import EditEngagementForm from '../EditEngagementForm'

const CONFLICT = 'La réservation a été modifiée entre-temps. Rechargez la fiche.'

/**
 * Reference example (spec E4-T5) after some payments: agreed 500 000, deed 450 000,
 * gap 50 000 at the end, first payment 100 000 → the schedule covers 400 000.
 * Acompte 1 is fully received (read-only), Solde 1 partly received, Solde 2 pending.
 */
const SUMMARY = {
  catalogue_price: 500000, agreed_total_price: 500000, acte_price: 450000, gap_amount: 50000,
  gap_due_timing: 'fin', gap_due_date: null, first_payment: 100000, total_received: 270000, remaining: 230000,
  acte_min_paid_pct: 10, acte_threshold_amount: 50000, acte_available: true,
  installments: [
    { id: 1, payment_type: 'deposit', installment_number: 1, amount: 150000, due_date: '2026-10-28T00:00:00', received: 150000, remaining: 0, status: 'paid' },
    { id: 2, payment_type: 'balance', installment_number: 1, amount: 100000, due_date: '2026-11-28T00:00:00', received: 20000, remaining: 80000, status: 'partial' },
    { id: 3, payment_type: 'balance', installment_number: 2, amount: 100000, due_date: '2026-12-28T00:00:00', received: 0, remaining: 100000, status: 'pending' },
    { id: 4, payment_type: 'gap', installment_number: 1, amount: 50000, due_date: '2026-12-28T00:00:00', received: 0, remaining: 50000, status: 'pending' },
  ],
  updated_at: '2026-10-28T21:50:12.123456',
}

const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })

/** Stubs fetch: `handler(path, options)` returns a response promise, or undefined for 404. */
function stubFetch(handler = () => undefined) {
  const fetchMock = vi.fn((url, options = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    return handler(path, options) ?? json({ detail: 'Not Found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const putCalls = (fetchMock) => fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT')

function renderForm(props = {}) {
  const handlers = { onSaved: vi.fn(), onCancel: vi.fn(), onReloaded: vi.fn() }
  renderWithProviders(
    <EditEngagementForm reservationId={11} summary={SUMMARY} notes="Client fidèle" {...handlers} {...props} />,
    { user: { id: 2, role: 'commercial' } }
  )
  return handlers
}

const schedule = () => screen.getByRole('table', { name: 'Échéances' })
const row = (name) => within(schedule()).getByRole('row', { name })
const saveButton = () => screen.getByRole('button', { name: 'Enregistrer' })

async function retype(user, element, value) {
  await user.clear(element)
  await user.type(element, value)
}

describe('EditEngagementForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is prefilled from the summary and the reservation notes', () => {
    stubFetch()
    renderForm()

    expect(screen.getByLabelText('Prix total convenu')).toHaveValue(500000)
    expect(screen.getByLabelText("Prix figurant sur l'acte")).toHaveValue(450000)
    expect(screen.getByLabelText("Écart à régulariser")).toHaveTextContent('50 000 MAD')
    expect(screen.getByRole('button', { name: /^À la fin/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Notes')).toHaveValue('Client fidèle')
    expect(screen.getByLabelText('Montant (Solde 1)')).toHaveValue(100000)
    expect(screen.getByLabelText("Date d'échéance (Solde 1)")).toHaveValue('2026-11-28')
    expect(screen.getByLabelText('Montant (Solde 2)')).toHaveValue(100000)
    expect(screen.getByLabelText("Date d'échéance (Solde 2)")).toHaveValue('2026-12-28')
    expect(screen.getByLabelText('Motif de la modification')).toHaveValue('')
    expect(screen.getByText('Total des échéances : 400 000 MAD / attendu 400 000 MAD')).toBeInTheDocument()
    // reason required
    expect(saveButton()).toBeDisabled()
  })

  it('keeps the first payment, the received installments and the gap row read-only', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderForm()

    // « Premier acompte reçu » is shown, never typed
    expect(screen.getByLabelText('Premier acompte reçu')).toHaveTextContent('100 000 MAD')
    expect(screen.queryByPlaceholderText('Montant reçu')).not.toBeInTheDocument()
    // fully received installment: no input, status « Reçu »
    expect(within(row(/Acompte 1/)).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(within(row(/Acompte 1/)).queryByLabelText(/Date d'échéance/)).not.toBeInTheDocument()
    expect(row(/Acompte 1/)).toHaveTextContent('150 000 MAD')
    expect(row(/Acompte 1/)).toHaveTextContent('Reçu')
    // partly received: editable, with what it already received
    expect(row(/Solde 1/)).toHaveTextContent('déjà reçu 20 000 MAD')
    // gap row: never typed, follows the recomputed gap live
    expect(within(row(/Écart à régulariser/)).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(row(/Écart à régulariser/)).toHaveTextContent('50 000 MAD')
    await retype(user, screen.getByLabelText("Prix figurant sur l'acte"), '440000')
    expect(row(/Écart à régulariser/)).toHaveTextContent('60 000 MAD')
  })

  it('shows the live total against the expected amount and enables saving only when they match and a reason is given', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Motif de la modification'), 'Remise')
    expect(saveButton()).toBeEnabled()

    // agreed +20 000 → gap +20 000 and expected +20 000: still balanced
    await retype(user, screen.getByLabelText('Prix total convenu'), '520000')
    expect(screen.getByText('Total des échéances : 420 000 MAD / attendu 420 000 MAD')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()

    // deed +10 000 → gap −10 000: unbalanced
    await retype(user, screen.getByLabelText("Prix figurant sur l'acte"), '460000')
    expect(screen.getByText('Total des échéances : 410 000 MAD / attendu 420 000 MAD')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    // off by one cent: still unbalanced
    await retype(user, screen.getByLabelText('Montant (Solde 2)'), '109999.99')
    expect(screen.getByText('Total des échéances : 419 999,99 MAD / attendu 420 000 MAD')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    await retype(user, screen.getByLabelText('Montant (Solde 2)'), '110000')
    expect(saveButton()).toBeEnabled()

    // a blank reason disables again
    await user.clear(screen.getByLabelText('Motif de la modification'))
    await user.type(screen.getByLabelText('Motif de la modification'), '   ')
    expect(saveButton()).toBeDisabled()
  })

  it('sends the exact body with expected_updated_at and reports the saved summary', async () => {
    const saved = { ...SUMMARY, agreed_total_price: 520000, updated_at: '2026-10-28T22:00:00.000001', acte_status: null }
    const fetchMock = stubFetch((path, options) =>
      path === '/api/reservations/11/engagement' && options.method === 'PUT' ? json(saved) : undefined
    )
    const user = userEvent.setup()
    const { onSaved } = renderForm()

    await retype(user, screen.getByLabelText('Prix total convenu'), '520000')
    await retype(user, screen.getByLabelText("Prix figurant sur l'acte"), '460000')
    await retype(user, screen.getByLabelText('Montant (Solde 2)'), '110000')
    fireEvent.change(screen.getByLabelText("Date d'échéance (Solde 2)"), { target: { value: '2027-01-27' } })
    await retype(user, screen.getByLabelText('Notes'), 'Client très fidèle')
    await user.type(screen.getByLabelText('Motif de la modification'), '  Remise accordée par la direction ')
    await user.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(putCalls(fetchMock)).toHaveLength(1)
    const [url, options] = putCalls(fetchMock)[0]
    expect(String(url)).toMatch(/\/api\/reservations\/11\/engagement$/)
    expect(JSON.parse(options.body)).toEqual({
      agreed_total_price: 520000,
      sale_price: 460000,
      gap_due_timing: 'fin',
      gap_due_date: null,
      notes: 'Client très fidèle',
      installments: [
        { id: 2, amount: 100000, due_date: '2026-11-28' },
        { id: 3, amount: 110000, due_date: '2027-01-27' },
      ],
      reason: 'Remise accordée par la direction',
      expected_updated_at: '2026-10-28T21:50:12.123456',
    })
    expect(await screen.findByText('Réservation modifiée')).toBeInTheDocument()
  })

  it('sends the gap date only for a gap due on a date, and clears empty notes', async () => {
    const fetchMock = stubFetch((path, options) =>
      options.method === 'PUT' ? json({ ...SUMMARY, acte_status: null }) : undefined
    )
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /^À une date/ }))
    expect(saveButton()).toBeDisabled() // date missing
    fireEvent.change(screen.getByLabelText("Date de l'écart"), { target: { value: '2027-06-30' } })
    await user.clear(screen.getByLabelText('Notes'))
    await user.type(screen.getByLabelText('Motif de la modification'), 'Écart à date fixe')
    await user.click(saveButton())

    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1))
    expect(JSON.parse(putCalls(fetchMock)[0][1].body)).toMatchObject({
      gap_due_timing: 'date', gap_due_date: '2027-06-30', notes: null,
    })
  })

  it.each([
    ['stored', "Nouvelle version de l'acte générée."],
    ['failed', "La réservation est enregistrée, mais l'acte n'a pas pu être régénéré."],
  ])('tells the user about the deed when acte_status is %s', async (acteStatus, message) => {
    stubFetch((path, options) => (options.method === 'PUT' ? json({ ...SUMMARY, acte_status: acteStatus }) : undefined))
    const user = userEvent.setup()
    const { onSaved } = renderForm()

    await user.type(screen.getByLabelText('Motif de la modification'), 'Correction')
    await user.click(saveButton())

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalled()
  })

  it('says nothing more about the deed when it was not regenerated', async () => {
    stubFetch((path, options) => (options.method === 'PUT' ? json({ ...SUMMARY, acte_status: 'not_ready' }) : undefined))
    const user = userEvent.setup()
    const { onSaved } = renderForm()

    await user.type(screen.getByLabelText('Motif de la modification'), 'Correction')
    await user.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(await screen.findByText('Réservation modifiée')).toBeInTheDocument()
    expect(screen.queryByText("Nouvelle version de l'acte générée.")).not.toBeInTheDocument()
    expect(screen.queryByText(/l'acte n'a pas pu être régénéré/)).not.toBeInTheDocument()
  })

  it('cancels without any request', async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    const { onCancel, onSaved } = renderForm()

    await retype(user, screen.getByLabelText('Prix total convenu'), '520000')
    await user.type(screen.getByLabelText('Motif de la modification'), 'Remise')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a business-rule refusal and keeps the form open', async () => {
    stubFetch((path, options) => (options.method === 'PUT'
      ? json({
        error: 'BUSINESS_RULE_VIOLATION',
        message: 'Le prix total convenu ne peut pas être inférieur au total déjà encaissé (270 000 MAD).',
        details: [{ rule: 'agreed_below_received' }],
      }, 400)
      : undefined))
    const user = userEvent.setup()
    const { onSaved } = renderForm()

    await user.type(screen.getByLabelText('Motif de la modification'), 'Remise')
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le prix total convenu ne peut pas être inférieur au total déjà encaissé (270 000 MAD).'
    )
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Motif de la modification')).toHaveValue('Remise')
    expect(screen.queryByRole('button', { name: 'Recharger' })).not.toBeInTheDocument()
  })

  it('shows the field messages of a validation error', async () => {
    stubFetch((path, options) => (options.method === 'PUT'
      ? json({
        error: 'VALIDATION_ERROR',
        message: 'Données invalides',
        details: [{ field: 'installments.0.amount', message: "Le montant doit être d'au moins 0,01 MAD." }],
      }, 422)
      : undefined))
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Motif de la modification'), 'Remise')
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent("Le montant doit être d'au moins 0,01 MAD.")
  })

  it('on a conflict, shows the spec message and reloads the form with the fresh updated_at', async () => {
    const fresh = { ...SUMMARY, agreed_total_price: 510000, gap_amount: 60000, updated_at: '2026-10-28T22:30:00.5' }
    let puts = 0
    const fetchMock = stubFetch((path, options) => {
      if (path === '/api/reservations/11/engagement' && options.method === 'PUT') {
        puts += 1
        return puts === 1
          ? json({ error: 'CONFLICT', message: CONFLICT }, 409)
          : json({ ...fresh, acte_status: null })
      }
      if (path === '/api/reservations/11/financial-summary') return json(fresh)
      if (path === '/api/reservations/11') return json({ id: 11, notes: 'Notes à jour' })
      return undefined
    })
    const user = userEvent.setup()
    const { onReloaded, onSaved } = renderForm()

    await user.type(screen.getByLabelText('Motif de la modification'), 'Remise')
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT)
    await user.click(screen.getByRole('button', { name: 'Recharger' }))

    await waitFor(() => expect(screen.getByLabelText('Prix total convenu')).toHaveValue(510000))
    expect(screen.getByLabelText('Notes')).toHaveValue('Notes à jour')
    expect(screen.getByLabelText('Motif de la modification')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onReloaded).toHaveBeenCalledTimes(1)

    await user.type(screen.getByLabelText('Motif de la modification'), 'Remise')
    await user.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(JSON.parse(putCalls(fetchMock)[1][1].body)).toMatchObject({
      agreed_total_price: 510000,
      notes: 'Notes à jour',
      expected_updated_at: '2026-10-28T22:30:00.5',
    })
  })
})
