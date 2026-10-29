import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import ReservationFinanceView from '../ReservationFinanceView'
import { fakeFinanceBackend } from './financeFakeBackend'

const LEGACY_TEXT = 'Réservation engagée avant la nouvelle gestion des montants : les montants ne peuvent pas être affichés ici.'

function renderView(props = {}) {
  return renderWithProviders(
    <div className="modal modal--3col">
      <ReservationFinanceView reservationId={11} lotNumero="E5" canRecord onClose={() => {}} {...props} />
    </div>,
    { user: { id: 1, role: 'manager' } }
  )
}

const center = () => document.querySelector('.modal-split-right')
const panel = () => document.querySelector('.modal-pay-panel')
const row = (name) => within(within(panel()).getByRole('table', { name: 'Échéancier' })).getByRole('row', { name })
const amount = (label) => within(within(center()).getByRole('group', { name: 'Montants' })).getByText(label).nextSibling

async function recordOn(user, rowName) {
  await user.click(within(row(rowName)).getByRole('button', { name: 'Enregistrer un encaissement' }))
  await user.click(within(center()).getByRole('button', { name: "Enregistrer l'encaissement" }))
  await waitFor(() => expect(screen.queryByRole('button', { name: "Enregistrer l'encaissement" })).not.toBeInTheDocument())
}

describe('ReservationFinanceView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows every amount in the center and the schedule in the right panel', async () => {
    fakeFinanceBackend()
    renderView()

    expect(await within(center()).findByRole('heading', { name: 'Échéancier et encaissements' })).toBeInTheDocument()
    expect(within(center()).getByText('Lot E5')).toBeInTheDocument()
    await within(center()).findByRole('group', { name: 'Montants' })
    expect(amount('Prix catalogue')).toHaveTextContent('500 000 MAD')
    expect(amount('Prix total convenu')).toHaveTextContent('500 000 MAD')
    expect(amount("Prix figurant sur l'acte")).toHaveTextContent('450 000 MAD')
    expect(amount('Écart à régulariser')).toHaveTextContent('50 000 MAD — à la fin')
    expect(amount('Premier acompte reçu')).toHaveTextContent('100 000 MAD')
    expect(amount('Total encaissé')).toHaveTextContent('100 000 MAD')
    expect(amount('Reste à payer')).toHaveTextContent('400 000 MAD')
    expect(within(center()).getByText('Acte disponible')).toBeInTheDocument()

    expect(within(panel()).getByText('Échéancier')).toBeInTheDocument()
    expect(within(panel()).getByText('4 échéances')).toBeInTheDocument()
    expect(panel().querySelector('.mpp-total')).toHaveTextContent('400 000 MAD')
    expect(row(/Acompte 1/)).toHaveTextContent('150 000 MAD')
    expect(row(/Écart à régulariser/)).toHaveTextContent('50 000 MAD')
    expect(row(/Écart à régulariser/)).toHaveClass('pay-row--gap')
    expect(within(row(/Écart à régulariser/)).getByText('À recevoir')).toBeInTheDocument()
  })

  it('records a payment from a schedule row in a form shown in the center', async () => {
    const fetchMock = fakeFinanceBackend()
    const onPaymentRecorded = vi.fn()
    const user = userEvent.setup()
    renderView({ onPaymentRecorded })
    await within(panel()).findByRole('row', { name: /Acompte 1/ })

    await user.click(within(row(/Acompte 1/)).getByRole('button', { name: 'Enregistrer un encaissement' }))

    const form = center().querySelector('.record-payment-form')
    expect(form).not.toBeNull()
    expect(within(form).getByLabelText('Montant')).toHaveValue(150000)
    // one payment at a time
    expect(within(row(/Solde 1/)).getByRole('button', { name: 'Enregistrer un encaissement' })).toBeDisabled()
    await user.click(within(form).getByRole('button', { name: "Enregistrer l'encaissement" }))

    await waitFor(() => expect(within(row(/Acompte 1/)).getByText('Reçu')).toBeInTheDocument())
    const post = fetchMock.mock.calls.find(([url, o]) => String(url).endsWith('/api/reservations/11/payments') && o?.method === 'POST')
    expect(post[1].body.get('installment_id')).toBe('1')
    expect(post[1].body.get('amount')).toBe('150000')
    expect(amount('Reste à payer')).toHaveTextContent('250 000 MAD')
    expect(within(row(/Acompte 1/)).getByRole('button', { name: 'Enregistrer un encaissement' })).toBeDisabled()
    expect(onPaymentRecorded).toHaveBeenCalledTimes(1)
  })

  it('follows the reference example: 400 000 → 50 000 → 0, and reports each summary', async () => {
    fakeFinanceBackend()
    const onSummaryChange = vi.fn()
    const onPaymentRecorded = vi.fn()
    const user = userEvent.setup()
    renderView({ onSummaryChange, onPaymentRecorded })
    await within(panel()).findByRole('row', { name: /Acompte 1/ })

    await recordOn(user, /Acompte 1/)
    await recordOn(user, /Solde 1/)
    await recordOn(user, /Solde 2/)

    await waitFor(() => expect(amount('Reste à payer')).toHaveTextContent('50 000 MAD'))
    expect(amount('Total encaissé')).toHaveTextContent('450 000 MAD')
    expect(within(row(/Écart à régulariser/)).getByText('À recevoir')).toBeInTheDocument()

    await recordOn(user, /Écart à régulariser/)

    await waitFor(() => expect(amount('Reste à payer')).toHaveTextContent('0 MAD'))
    expect(within(row(/Écart à régulariser/)).getByText('Reçu')).toBeInTheDocument()
    expect(onPaymentRecorded).toHaveBeenCalledTimes(4)
    await waitFor(() => expect(onSummaryChange).toHaveBeenLastCalledWith(expect.objectContaining({ remaining: 0 })))
  })

  it('shows the API error in the form and keeps it open', async () => {
    const fetchMock = fakeFinanceBackend()
    const base = fetchMock.getMockImplementation()
    fetchMock.mockImplementation((url, opts) =>
      opts?.method === 'POST'
        ? Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ message: "Réglez d'abord l'acompte précédent." }) })
        : base(url, opts))
    const onPaymentRecorded = vi.fn()
    const user = userEvent.setup()
    renderView({ onPaymentRecorded })
    await within(panel()).findByRole('row', { name: /Solde 1/ })

    await user.click(within(row(/Solde 1/)).getByRole('button', { name: 'Enregistrer un encaissement' }))
    await user.click(within(center()).getByRole('button', { name: "Enregistrer l'encaissement" }))

    expect(await within(center()).findByRole('alert')).toHaveTextContent("Réglez d'abord l'acompte précédent.")
    expect(within(center()).getByRole('button', { name: "Enregistrer l'encaissement" })).toBeInTheDocument()
    expect(onPaymentRecorded).not.toHaveBeenCalled()
  })

  it('lists the payments with their proof in the center', async () => {
    const fetchMock = fakeFinanceBackend()
    const base = fetchMock.getMockImplementation()
    const withProof = { id: 2, amount: 20000, paid_on: '2026-10-29', method: 'check', reference: 'CHQ 12', installment_id: 1, document_id: 9, recorded_by_name: 'Test Manager' }
    fetchMock.mockImplementation((url, opts) =>
      String(url).endsWith('/api/reservations/11/payments') && !opts?.method
        ? base(url, opts).then((r) => r.json()).then((list) => ({ ok: true, status: 200, json: () => Promise.resolve([...list, withProof]) }))
        : base(url, opts))
    const onDownloadProof = vi.fn()
    const user = userEvent.setup()
    renderView({ onDownloadProof })

    const payments = await within(center()).findByRole('table', { name: 'Encaissements' })
    expect(within(payments).getByRole('columnheader', { name: 'Justificatif' })).toBeInTheDocument()
    const [, first, second] = within(payments).getAllByRole('row')
    expect(first).toHaveTextContent('Premier acompte')
    expect(first).toHaveTextContent('100 000 MAD')
    expect(first).toHaveTextContent('Espèces')
    expect(first).toHaveTextContent('Test Commercial')
    expect(within(first).queryByRole('button')).not.toBeInTheDocument()
    expect(second).toHaveTextContent('CHQ 12')
    expect(second).toHaveTextContent('Acompte 1')
    await user.click(within(second).getByRole('button', { name: /Télécharger le justificatif/ }))
    expect(onDownloadProof).toHaveBeenCalledWith(expect.objectContaining({ id: 2, document_id: 9 }))
  })

  it('shows the threshold message while the deed is not available', async () => {
    fakeFinanceBackend({ acteMinPaidPct: 30 })
    renderView()

    expect(await within(center()).findByText(
      "L'acte sera disponible quand 30 % du prix total convenu aura été encaissé (100 000 MAD sur 150 000 MAD)."
    )).toBeInTheDocument()
    expect(screen.queryByText('Acte disponible')).not.toBeInTheDocument()
  })

  it('is read-only without the right to record', async () => {
    fakeFinanceBackend()
    renderView({ canRecord: false })

    await within(panel()).findByRole('row', { name: /Acompte 1/ })
    expect(screen.queryByRole('button', { name: 'Enregistrer un encaissement' })).not.toBeInTheDocument()
  })

  it('closes with « Fermer » and offers « Modifier la réservation » only when allowed', async () => {
    fakeFinanceBackend()
    const onClose = vi.fn()
    const onEdit = vi.fn()
    const user = userEvent.setup()
    const { unmount } = renderView({ onClose, onEdit, canEdit: true })
    await within(panel()).findByRole('row', { name: /Acompte 1/ })

    await user.click(within(center()).getByRole('button', { name: 'Modifier la réservation' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    await user.click(within(center()).getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()

    renderView({ canEdit: false })
    await within(panel()).findByRole('row', { name: /Acompte 1/ })
    expect(screen.queryByRole('button', { name: 'Modifier la réservation' })).not.toBeInTheDocument()
  })

  it('shows the warning and no action on a legacy reservation', async () => {
    fakeFinanceBackend({ legacy: true })
    renderView({ canEdit: true })

    expect(await within(center()).findByText(LEGACY_TEXT)).toBeInTheDocument()
    expect(within(center()).queryByRole('group', { name: 'Montants' })).not.toBeInTheDocument()
    expect(screen.queryByText(/MAD/)).not.toBeInTheDocument()
    expect(panel().querySelector('.mpp-total')).toBeNull()
    expect(row(/Acompte 1/)).toBeInTheDocument()
    expect(within(panel()).queryByRole('columnheader', { name: 'Montant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer un encaissement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier la réservation' })).not.toBeInTheDocument()
    expect(within(center()).getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })

  it('says so when the summary or the payments cannot be loaded', async () => {
    const onSummaryError = vi.fn()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) })))
    renderView({ onSummaryError })

    expect(await within(center()).findByText('Échéancier indisponible.')).toBeInTheDocument()
    expect(onSummaryError).toHaveBeenCalled()
  })

  it('still shows the schedule when only the payments fail', async () => {
    const fetchMock = fakeFinanceBackend()
    const base = fetchMock.getMockImplementation()
    fetchMock.mockImplementation((url, opts) =>
      String(url).endsWith('/api/reservations/11/payments') && !opts?.method
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) })
        : base(url, opts))
    renderView()

    expect(await within(center()).findByText('Impossible de charger les encaissements.')).toBeInTheDocument()
    expect(row(/Acompte 1/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Encaissements' })).not.toBeInTheDocument()
  })
})
