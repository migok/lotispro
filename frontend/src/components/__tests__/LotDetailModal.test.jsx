import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/renderWithProviders'
import LotDetailModal from '../LotDetailModal'

const MANAGER = { id: 1, role: 'manager' }
const COMMERCIAL = { id: 2, role: 'commercial' }
const PENDING = Symbol('pending')

/**
 * Stubs fetch: `routes` maps a path (without query string) to a JSON body
 * (`PENDING`: the request never answers); unknown paths answer `[]`.
 */
function mockFetch(routes = {}) {
  const fetchMock = vi.fn((url) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const body = Object.hasOwn(routes, path) ? routes[path] : []
    if (body === PENDING) return new Promise(() => {})
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderModal(lot, enabledOptionalStatuses, user = MANAGER) {
  return renderWithProviders(
    <LotDetailModal
      lot={lot}
      onClose={() => {}}
      onRefresh={() => {}}
      enabledOptionalStatuses={enabledOptionalStatuses}
    />,
    { user }
  )
}

/** Keys of a request body that still talk about the removed « promotion ». */
const promotionKeys = (body) => Object.keys(body).filter((key) => key.startsWith('promotion'))

function postedBody(fetchMock, pathEnd) {
  const call = fetchMock.mock.calls.find(
    ([url, options]) => String(url).endsWith(pathEnd) && options?.method === 'POST'
  )
  return call ? JSON.parse(call[1].body) : undefined
}

describe('LotDetailModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('displays the "Disponible" status label for an available lot', async () => {
    mockFetch()
    const lot = { id: 1, numero: 'A1', status: 'available', price: 500000, surface: 200 }

    renderModal(lot)

    expect((await screen.findAllByText('Disponible')).length).toBeGreaterThan(0)
  })

  it('offers the option on an available lot with the default settings', () => {
    mockFetch()
    renderModal({ id: 1, numero: 'A1', status: 'available', price: 500000 })

    expect(screen.getByRole('button', { name: 'Option' })).toBeInTheDocument()
  })

  it('hides the option on an available lot when the project disabled it', () => {
    mockFetch()
    renderModal({ id: 1, numero: 'A1', status: 'available', price: 500000 }, ['reservation_a_finaliser'])

    expect(screen.queryByRole('button', { name: 'Option' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Résa\. à finaliser/ })).toBeInTheDocument()
  })

  it('engages an option directly when "réservation à finaliser" is disabled', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderModal(
      { id: 3, numero: 'C3', status: 'option', price: 500000, client_name: 'Fatima Benali', deposit: 5000 },
      ['option']
    )

    expect(screen.queryByRole('button', { name: /Passer à réservation à finaliser/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Engager/ }))

    expect(screen.queryByText('Sélectionner un client')).not.toBeInTheDocument()
    expect(screen.getAllByText('Fatima Benali').length).toBeGreaterThan(0)
    await user.type(screen.getByPlaceholderText('Montant reçu'), '20000')
    await user.click(screen.getByRole('button', { name: /Déduire l'acompte/ }))
    await user.click(screen.getByRole('button', { name: /Engager la réservation/ }))

    await waitFor(() => expect(postedBody(fetchMock, '/api/lots/3/transitions/option-engage')).toBeDefined())
    const body = postedBody(fetchMock, '/api/lots/3/transitions/option-engage')
    expect(body).toMatchObject({ guarantee_amount: 20000, deposit_action: 'deduct' })
    expect(body).not.toHaveProperty('client_id')
  })

  it('schedules the EDL instead of the notary on a sold lot when the EDL is enabled', () => {
    mockFetch()
    renderModal({ id: 4, numero: 'D4', status: 'reservation_soldee', price: 500000 }, ['option', 'edl'])

    expect(screen.getByRole('button', { name: /Programmer l'EDL/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chez le notaire/ })).not.toBeInTheDocument()
  })

  it('disables "Finaliser" while an EDL action is open', async () => {
    mockFetch({
      '/api/lots/5/edl': {
        id: 9,
        lot_id: 5,
        reservation_id: 2,
        scheduled_at: '2026-10-20T10:00:00Z',
        intervenant: 'M. Expert',
        schedule_note: null,
        done_at: '2026-10-21T10:00:00Z',
        done_note: 'RAS',
        finalized_at: null,
        actions: [
          { id: 1, etat_des_lieux_id: 9, description: 'Volet cassé', responsable: null, status: 'ouverte', done_at: null },
          { id: 2, etat_des_lieux_id: 9, description: 'Robinet', responsable: 'Plombier', status: 'faite', done_at: '2026-10-22T10:00:00Z' },
        ],
      },
    })
    renderModal(
      { id: 5, numero: 'E5', status: 'edl_realise', price: 500000, edl_open_actions_count: 1 },
      ['option', 'edl']
    )

    expect(await screen.findByText('Volet cassé')).toBeInTheDocument()
    expect(await screen.findByText('1 action ouverte')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Finaliser/ })).toBeDisabled()
  })

  it('enables "Finaliser" once every EDL action is done', async () => {
    mockFetch({
      '/api/lots/7/edl': {
        id: 10, scheduled_at: '2026-10-20T10:00:00Z', intervenant: 'M. Expert',
        actions: [{ id: 3, description: 'Robinet', responsable: null, status: 'faite' }],
      },
    })
    renderModal({ id: 7, numero: 'G7', status: 'edl_realise', price: 500000 }, ['option', 'edl'])

    await waitFor(() => expect(screen.getByRole('button', { name: /Finaliser/ })).toBeEnabled())
  })

  it('keeps "Finaliser" disabled until the EDL actions are known', () => {
    mockFetch({ '/api/lots/6/edl': PENDING })
    renderModal({ id: 6, numero: 'E6', status: 'edl_realise', price: 500000 }, ['option', 'edl'])

    expect(screen.getByRole('button', { name: /Finaliser/ })).toBeDisabled()
  })

  it('sends the first payment and its payment type on a direct engagement', async () => {
    const fetchMock = mockFetch({ '/api/clients': [{ id: 7, name: 'Fatima Benali' }] })
    const user = userEvent.setup()
    renderModal({ id: 8, numero: 'H8', status: 'available', price: 500000 })

    await user.click(screen.getByRole('button', { name: /Résa\. engagée/ }))
    await user.type(await screen.findByPlaceholderText(/Rechercher par nom, CIN/), 'fatima')
    await user.click(await screen.findByRole('option', { name: /Fatima Benali/ }))
    await user.type(screen.getByPlaceholderText('Montant reçu'), '30000')
    await user.selectOptions(screen.getByDisplayValue('Espèces'), 'transfer')
    await user.click(screen.getByRole('button', { name: /Engager la réservation/ }))

    await waitFor(() => expect(postedBody(fetchMock, '/api/lots/8/transitions/direct-engage')).toBeDefined())
    const body = postedBody(fetchMock, '/api/lots/8/transitions/direct-engage')
    expect(body).toMatchObject({
      client_id: 7,
      guarantee_amount: 30000,
      payment_type: 'transfer',
      agreed_total_price: 500000,
      sale_price: 500000,
    })
    expect(promotionKeys(body)).toEqual([])
  })

  describe('engagement amounts (E4-T5)', () => {
    it('sends the agreed price, the deed price and the gap date on a direct engagement', async () => {
      const fetchMock = mockFetch({ '/api/clients': [{ id: 7, name: 'Fatima Benali' }] })
      const user = userEvent.setup()
      renderModal({ id: 8, numero: 'H8', status: 'available', price: 500000 })

      await user.click(screen.getByRole('button', { name: /Résa\. engagée/ }))
      await user.type(await screen.findByPlaceholderText(/Rechercher par nom, CIN/), 'fatima')
      await user.click(await screen.findByRole('option', { name: /Fatima Benali/ }))
      expect(screen.getByLabelText('Prix total convenu')).toHaveValue(500000)
      await user.clear(screen.getByLabelText("Prix figurant sur l'acte"))
      await user.type(screen.getByLabelText("Prix figurant sur l'acte"), '450000')
      expect(screen.getByLabelText('Écart à régulariser')).toHaveTextContent('50 000 MAD')
      await user.click(screen.getByRole('button', { name: /^À une date/ }))
      await user.type(screen.getByLabelText("Date de l'écart"), '2027-06-30')
      await user.type(screen.getByLabelText('Premier acompte reçu'), '100000')
      await user.click(screen.getByRole('button', { name: /Engager la réservation/ }))

      await waitFor(() => expect(postedBody(fetchMock, '/api/lots/8/transitions/direct-engage')).toBeDefined())
      const body = postedBody(fetchMock, '/api/lots/8/transitions/direct-engage')
      expect(body).toMatchObject({
        guarantee_amount: 100000,
        agreed_total_price: 500000,
        sale_price: 450000,
        gap_due_timing: 'date',
        gap_due_date: '2027-06-30',
      })
      expect(promotionKeys(body)).toEqual([])
    })

    it('sends the amounts on an option engagement', async () => {
      const fetchMock = mockFetch()
      const user = userEvent.setup()
      renderModal({ id: 3, numero: 'C3', status: 'option', price: 500000, client_name: 'Fatima Benali' }, ['option'])

      await user.click(screen.getByRole('button', { name: /Engager/ }))
      await user.clear(screen.getByLabelText('Prix total convenu'))
      await user.type(screen.getByLabelText('Prix total convenu'), '520000')
      await user.type(screen.getByLabelText('Premier acompte reçu'), '20000')
      await user.click(screen.getByRole('button', { name: /Engager la réservation/ }))

      await waitFor(() => expect(postedBody(fetchMock, '/api/lots/3/transitions/option-engage')).toBeDefined())
      const body = postedBody(fetchMock, '/api/lots/3/transitions/option-engage')
      expect(body).toMatchObject({ guarantee_amount: 20000, agreed_total_price: 520000, sale_price: 500000, gap_due_timing: 'fin' })
      expect(body.gap_due_date).toBeUndefined()
      expect(promotionKeys(body)).toEqual([])
    })

    it('sends the amounts when engaging a reservation to finalise, the kept guarantee as first payment', async () => {
      const fetchMock = mockFetch()
      const user = userEvent.setup()
      renderModal(
        { id: 6, numero: 'F6', status: 'reservation_a_finaliser', price: 500000, reservation_id: 41, client_name: 'Fatima Benali', guarantee_amount: 20000 },
        ['option', 'reservation_a_finaliser']
      )

      await user.click(screen.getByRole('button', { name: /Valider/ }))
      await user.click(screen.getByRole('button', { name: /Déduire la garantie/ }))
      expect(screen.getByLabelText('Premier acompte reçu')).toHaveTextContent('20 000 MAD')
      await user.clear(screen.getByLabelText("Prix figurant sur l'acte"))
      await user.type(screen.getByLabelText("Prix figurant sur l'acte"), '480000')
      await user.click(screen.getByRole('button', { name: /^Au début/ }))
      await user.click(screen.getByRole('button', { name: /Confirmer l'engagement/ }))

      await waitFor(() => expect(postedBody(fetchMock, '/api/lots/6/transitions/engage')).toBeDefined())
      const body = postedBody(fetchMock, '/api/lots/6/transitions/engage')
      expect(body).toMatchObject({ guarantee_action: 'deduct', agreed_total_price: 500000, sale_price: 480000, gap_due_timing: 'debut' })
      expect(promotionKeys(body)).toEqual([])
    })

    it('blocks the engagement while the deed price is above the agreed total price', async () => {
      const fetchMock = mockFetch()
      const user = userEvent.setup()
      renderModal({ id: 3, numero: 'C3', status: 'option', price: 500000, client_name: 'Fatima Benali' }, ['option'])

      await user.click(screen.getByRole('button', { name: /Engager/ }))
      await user.clear(screen.getByLabelText("Prix figurant sur l'acte"))
      await user.type(screen.getByLabelText("Prix figurant sur l'acte"), '550000')
      await user.type(screen.getByLabelText('Premier acompte reçu'), '20000')
      await user.click(screen.getByRole('button', { name: /Engager la réservation/ }))

      expect(screen.getAllByText("Le prix figurant sur l'acte ne peut pas dépasser le prix total convenu.").length).toBeGreaterThan(0)
      expect(postedBody(fetchMock, '/api/lots/3/transitions/option-engage')).toBeUndefined()
    })

    it.each([
      ['direct', { id: 8, numero: 'H8', status: 'available', price: 500000 }, /Résa\. engagée/, undefined],
      ['option', { id: 3, numero: 'C3', status: 'option', price: 500000, client_name: 'Fatima Benali' }, /Engager/, ['option']],
      ['finalise', { id: 6, numero: 'F6', status: 'reservation_a_finaliser', price: 500000, reservation_id: 41, client_name: 'F B', guarantee_amount: 20000 }, /Valider/, ['option', 'reservation_a_finaliser']],
    ])('no longer shows any promotion field in the %s engagement form', async (_name, lot, open, enabled) => {
      mockFetch()
      const user = userEvent.setup()
      renderModal(lot, enabled)

      await user.click(screen.getByRole('button', { name: open }))
      await user.clear(screen.getByLabelText("Prix figurant sur l'acte"))
      await user.type(screen.getByLabelText("Prix figurant sur l'acte"), '450000')

      expect(screen.queryByText(/promotion/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Premier acompte \(ND\)/)).not.toBeInTheDocument()
      expect(screen.getByText('Prix catalogue', { selector: '.msr-label' })).toBeInTheDocument()
    })
  })

  describe('client selection in the reservation flows', () => {
    const FLOWS = [
      ['option', /^Option$/, /Confirmer l'option/],
      ['résa à finaliser', /Résa\. à finaliser/, /Créer la réservation/],
      ['résa engagée', /Résa\. engagée/, /Engager la réservation/],
    ]

    it.each(FLOWS)('disables the submit button of the %s flow until a client is chosen', async (_name, open, submit) => {
      mockFetch({ '/api/clients': [{ id: 7, name: 'Fatima Benali', cin: 'AB123456', phone: '+212612345678' }] })
      const user = userEvent.setup()
      renderModal({ id: 8, numero: 'H8', status: 'available', price: 500000 })

      await user.click(screen.getByRole('button', { name: open }))
      const button = screen.getByRole('button', { name: submit })
      expect(button).toBeDisabled()

      await user.type(await screen.findByPlaceholderText(/Rechercher par nom, CIN/), '0612345678')
      await user.click(await screen.findByRole('option', { name: /Fatima Benali/ }))

      expect(screen.getByRole('button', { name: submit })).toBeEnabled()
    })
  })

  describe('archived reservation deed', () => {
    const ENGAGED = { id: 5, numero: 'E5', status: 'reservation_engagee', price: 500000, reservation_id: 11, client_name: 'Fatima Benali' }
    const ACTE = { id: 1, lot_id: 5, reservation_id: 11, filename: 'acte_reservation_11_lotE5.pdf', category: 'acte_reservation' }
    const RESERVATION = { id: 11, sale_price: 450000, agreed_total_price: 500000, gap_amount: 50000, gap_due_timing: 'fin', first_payment: 100000 }
    const SUMMARY = {
      catalogue_price: 500000, agreed_total_price: 500000, acte_price: 450000, gap_amount: 50000,
      gap_due_timing: 'fin', gap_due_date: null, first_payment: 100000, total_received: 100000, remaining: 400000,
      acte_min_paid_pct: 10, acte_threshold_amount: 50000, acte_available: true,
      installments: [
        { id: 1, payment_type: 'deposit', installment_number: 1, amount: 150000, due_date: '2030-01-01T00:00:00', received: 0, remaining: 150000, status: 'pending' },
        { id: 4, payment_type: 'gap', installment_number: 1, amount: 50000, due_date: '2030-06-01T00:00:00', received: 0, remaining: 50000, status: 'pending' },
      ],
      updated_at: '2026-10-28T10:00:00',
    }
    const BELOW_THRESHOLD = { ...SUMMARY, acte_min_paid_pct: 30, acte_threshold_amount: 150000, acte_available: false }
    const SCHEDULE = { '/api/reservations/11/financial-summary': SUMMARY }

    it('shows the "Acte de réservation" badge when a deed is archived', async () => {
      mockFetch({ ...SCHEDULE, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [ACTE] })
      renderModal(ENGAGED)

      expect(await screen.findByText('Acte de réservation')).toBeInTheDocument()
      expect(screen.queryByText("L'acte n'a pas été généré.")).not.toBeInTheDocument()
    })

    it('alerts when no deed is archived and regenerates it on demand', async () => {
      const fetchMock = mockFetch({ ...SCHEDULE, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      const user = userEvent.setup()
      renderModal(ENGAGED)

      expect(await screen.findByText("L'acte n'a pas été généré.")).toBeInTheDocument()
      const documentLoads = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/lots/5/documents')).length
      const before = documentLoads()
      await user.click(screen.getByRole('button', { name: 'Régénérer' }))

      await waitFor(() => expect(postedBody(fetchMock, '/api/reservations/11/acte')).toBeDefined())
      await waitFor(() => expect(documentLoads()).toBeGreaterThan(before))
    })

    it('shows the threshold message, not the regenerate alert, while the deed threshold is not reached', async () => {
      mockFetch({
        '/api/reservations/11/financial-summary': BELOW_THRESHOLD,
        '/api/reservations/11': RESERVATION,
        '/api/lots/5/documents': [],
      })
      renderModal(ENGAGED)

      expect(await screen.findByText(
        "L'acte sera disponible quand 30 % du prix total convenu aura été encaissé (100 000 MAD sur 150 000 MAD)."
      )).toBeInTheDocument()
      expect(screen.queryByText("L'acte n'a pas été généré.")).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Régénérer' })).not.toBeInTheDocument()
    })

    it('waits for the financial summary before offering to regenerate', async () => {
      mockFetch({ '/api/reservations/11/financial-summary': PENDING, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      renderModal(ENGAGED)

      await screen.findByText("Chargement de l'échéancier…")
      expect(screen.queryByText("L'acte n'a pas été généré.")).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Régénérer' })).not.toBeInTheDocument()
    })

    it('shows the engaged amounts with the spec labels, without any promotion', async () => {
      mockFetch({ ...SCHEDULE, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      renderModal(ENGAGED)

      const acte = await screen.findByText("Prix figurant sur l'acte")
      expect(acte.nextSibling).toHaveTextContent('450 000 MAD')
      expect(screen.getByText('Écart à régulariser', { selector: '.ldm-ri-key' }).nextSibling).toHaveTextContent('50 000 MAD — à la fin')
      expect(screen.getByText('Premier acompte reçu').nextSibling).toHaveTextContent('100 000 MAD')
      expect(screen.queryByText(/promotion/i)).not.toBeInTheDocument()
    })

    it('records a payment on an installment instead of marking it paid', async () => {
      const fetchMock = mockFetch({
        ...SCHEDULE,
        '/api/reservations/11/financial-summary': {
          ...SUMMARY,
          installments: [{ ...SUMMARY.installments[0], due_date: '2020-01-01T00:00:00' }, SUMMARY.installments[1]],
        },
        '/api/reservations/11': RESERVATION,
        '/api/lots/5/documents': [],
      })
      const user = userEvent.setup()
      renderModal(ENGAGED)

      expect(await screen.findByText('Premier versement en retard')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Confirmer le paiement/ })).not.toBeInTheDocument()
      const schedule = await screen.findByRole('table', { name: 'Échéancier' })
      await user.click(within(within(schedule).getByRole('row', { name: /Acompte 1/ })).getByRole('button', { name: 'Enregistrer un encaissement' }))
      await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))

      await waitFor(() => expect(fetchMock.mock.calls.some(
        ([url, options]) => String(url).endsWith('/api/reservations/11/payments') && options?.method === 'POST'
      )).toBe(true))
      const [, options] = fetchMock.mock.calls.find(
        ([url, opts]) => String(url).endsWith('/api/reservations/11/payments') && opts?.method === 'POST'
      )
      expect(options.body.get('installment_id')).toBe('1')
      expect(options.body.get('amount')).toBe('150000')
      expect(fetchMock.mock.calls.some(([url, opts]) => String(url).includes('/api/payments/installments/') && opts?.method === 'PATCH')).toBe(false)
    })

    it('offers the deed once available and the receipt otherwise', async () => {
      mockFetch({ ...SCHEDULE, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      renderModal(ENGAGED)

      expect(await screen.findByRole('button', { name: /^Acte de réservation$/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Reçu de paiement/ })).not.toBeInTheDocument()
    })

    it('offers the receipt while the deed threshold is not reached', async () => {
      mockFetch({ '/api/reservations/11/financial-summary': BELOW_THRESHOLD, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      renderModal(ENGAGED)

      expect(await screen.findByRole('button', { name: /Reçu de paiement/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Acte de réservation$/ })).not.toBeInTheDocument()
    })

    it('shows the API message when the deed download is refused (400 message)', async () => {
      const message = "L'acte sera disponible quand 10 % du prix total convenu aura été encaissé (0 MAD sur 50 000 MAD)."
      const fetchMock = mockFetch({ ...SCHEDULE, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      const base = fetchMock.getMockImplementation()
      fetchMock.mockImplementation((url, opts) =>
        String(url).endsWith('/api/reservations/11/certificate')
          ? Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'BUSINESS_RULE_VIOLATION', message }) })
          : base(url, opts))
      const user = userEvent.setup()
      renderModal(ENGAGED)

      await user.click(await screen.findByRole('button', { name: /^Acte de réservation$/ }))

      expect(await screen.findByText(message)).toBeInTheDocument()
    })

    it('only lets the lot be marked sold once nothing is left to pay', async () => {
      mockFetch({ ...SCHEDULE, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      renderModal(ENGAGED)

      await screen.findByRole('table', { name: 'Échéancier' })
      expect(screen.getByRole('button', { name: /Marquer soldé/ })).toBeDisabled()
    })

    it('explains the refusal with the exact amount left, cents included', async () => {
      mockFetch({
        '/api/reservations/11/financial-summary': { ...SUMMARY, total_received: 499999.6, remaining: 0.4 },
        '/api/reservations/11': RESERVATION,
        '/api/lots/5/documents': [],
      })
      renderModal(ENGAGED)

      await screen.findByRole('table', { name: 'Échéancier' })
      await waitFor(() => expect(screen.getByRole('button', { name: /Marquer soldé/ }))
        .toHaveAttribute('title', 'Reste à payer : 0,40 MAD — la réservation ne peut pas être soldée.'))
      expect(screen.getByRole('button', { name: /Marquer soldé/ })).toBeDisabled()
    })

    it('says the schedule is unavailable on « Marquer soldé » when the summary fails', async () => {
      const fetchMock = mockFetch({ '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      const base = fetchMock.getMockImplementation()
      fetchMock.mockImplementation((url, opts) =>
        String(url).endsWith('/api/reservations/11/financial-summary')
          ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) })
          : base(url, opts))
      renderModal(ENGAGED)

      expect(await screen.findByText('Échéancier indisponible.', { selector: '.ldm-documents-empty' })).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('button', { name: /Marquer soldé/ })).toHaveAttribute('title', 'Échéancier indisponible.'))
      expect(screen.getByRole('button', { name: /Marquer soldé/ })).toBeDisabled()
    })

    it('sells at the agreed total price without asking for a price', async () => {
      const paid = { ...SUMMARY, total_received: 500000, remaining: 0, installments: SUMMARY.installments.map((i) => ({ ...i, received: i.amount, remaining: 0, status: 'paid' })) }
      const fetchMock = mockFetch({ '/api/reservations/11/financial-summary': paid, '/api/reservations/11': RESERVATION, '/api/lots/5/documents': [] })
      const user = userEvent.setup()
      renderModal(ENGAGED)

      await screen.findByRole('table', { name: 'Échéancier' })
      await waitFor(() => expect(screen.getByRole('button', { name: /Marquer soldé/ })).toBeEnabled())
      await user.click(screen.getByRole('button', { name: /Marquer soldé/ }))
      expect(screen.queryByText(/Prix final de vente/)).not.toBeInTheDocument()
      expect(screen.getByText('Prix total convenu', { selector: '.msr-label' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Confirmer la vente/ }))

      await waitFor(() => expect(postedBody(fetchMock, '/api/lots/5/transitions/solde')).toBeDefined())
      expect(postedBody(fetchMock, '/api/lots/5/transitions/solde')).not.toHaveProperty('price')
    })

    it('downloads the latest archived deed from the badge', async () => {
      const routes = {
        ...SCHEDULE,
        '/api/reservations/11': RESERVATION,
        '/api/lots/5/documents': [
          { ...ACTE, id: 1, created_at: '2026-10-01T10:00:00' },
          { ...ACTE, id: 2, created_at: '2026-10-02T10:00:00' },
        ],
      }
      const fetchMock = mockFetch(routes)
      const base = fetchMock.getMockImplementation()
      fetchMock.mockImplementation((url, opts) =>
        String(url).endsWith('/api/lots/5/documents/2')
          ? Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF'])) })
          : base(url, opts))
      URL.createObjectURL = vi.fn(() => 'blob:x')
      URL.revokeObjectURL = vi.fn()
      const user = userEvent.setup()
      renderModal(ENGAGED)

      await user.click(await screen.findByRole('button', { name: 'Télécharger' }))

      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/lots/5/documents/2'))).toBe(true))
    })

    it('shows a neutral message, not the "not generated" alert, when documents fail to load', async () => {
      const fetchMock = mockFetch({ ...SCHEDULE, '/api/reservations/11': RESERVATION })
      const base = fetchMock.getMockImplementation()
      fetchMock.mockImplementation((url, opts) =>
        String(url).endsWith('/api/lots/5/documents') ? Promise.reject(new Error('réseau')) : base(url, opts))
      renderModal(ENGAGED)

      expect(await screen.findByText('Documents indisponibles.')).toBeInTheDocument()
      expect(screen.queryByText("L'acte n'a pas été généré.")).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Régénérer' })).not.toBeInTheDocument()
    })
  })

  describe('archived deed at the notary stage', () => {
    const NOTARY = { id: 6, numero: 'N6', status: 'chez_notaire', price: 500000, reservation_id: 12, client_name: 'Fatima Benali' }
    const DEED = { id: 1, lot_id: 6, reservation_id: 12, filename: 'acte_reservation_12_lotN6.pdf', category: 'acte_reservation' }

    it('lists the deed without a delete button', async () => {
      mockFetch({ '/api/lots/6/documents': [DEED] })
      renderModal(NOTARY)

      expect(await screen.findByText(DEED.filename)).toBeInTheDocument()
      expect(screen.queryByTitle('Supprimer')).not.toBeInTheDocument()
    })

    it('still warns "Aucun document joint" when only the deed is attached', async () => {
      mockFetch({ '/api/lots/6/documents': [DEED] })
      const user = userEvent.setup()
      renderModal(NOTARY)
      await screen.findByText(DEED.filename)

      await user.click(screen.getByRole('button', { name: /Confirmer acte/ }))

      expect(screen.getByText(/Aucun document joint/)).toBeInTheDocument()
    })
  })

  describe('manager-only and owner-only actions', () => {
    it('hides "Libérer" on a blocked lot from a commercial', () => {
      mockFetch()
      renderModal({ id: 9, numero: 'I9', status: 'blocked' }, undefined, COMMERCIAL)

      expect(screen.queryByRole('button', { name: /Libérer/ })).not.toBeInTheDocument()
    })

    it('shows "Libérer" on a blocked lot to a manager', () => {
      mockFetch()
      renderModal({ id: 9, numero: 'I9', status: 'blocked' })

      expect(screen.getByRole('button', { name: /Libérer/ })).toBeInTheDocument()
    })

    it('hides "Confirmer acte" from a commercial', () => {
      mockFetch()
      renderModal({ id: 10, numero: 'J10', status: 'chez_notaire' }, undefined, COMMERCIAL)

      expect(screen.queryByRole('button', { name: /Confirmer acte/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Modifier notaire/ })).toBeInTheDocument()
    })

    it('shows "Confirmer acte" to a manager', () => {
      mockFetch()
      renderModal({ id: 10, numero: 'J10', status: 'chez_notaire' })

      expect(screen.getByRole('button', { name: /Confirmer acte/ })).toBeInTheDocument()
    })

    const othersOption = { id: 11, numero: 'K11', status: 'option', price: 500000, reserved_by_user_id: 99 }

    it("disables \"Engager\" on another commercial's option", () => {
      mockFetch()
      renderModal(othersOption, ['option'], COMMERCIAL)

      expect(screen.getByRole('button', { name: /Engager/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Annuler option/ })).toBeDisabled()
    })

    it('lets the owner commercial engage the option', () => {
      mockFetch()
      renderModal({ ...othersOption, reserved_by_user_id: COMMERCIAL.id }, ['option'], COMMERCIAL)

      expect(screen.getByRole('button', { name: /Engager/ })).toBeEnabled()
    })

    it("lets a manager engage another commercial's option", () => {
      mockFetch()
      renderModal(othersOption, ['option'])

      expect(screen.getByRole('button', { name: /Engager/ })).toBeEnabled()
    })
  })

  describe('notification panel after a reservation step', () => {
    const CLIENT = { id: 7, name: 'Fatima Benali', notification_channels: ['email'] }
    const NOTIFY_ROWS = [{ id: 1, channel: 'email', status: 'sent', error: null }]

    /** Mounts the modal with spies and the client / notify routes; `routes` adds the transition answer. */
    function setup(lot, routes, enabled) {
      const onClose = vi.fn()
      const onRefresh = vi.fn()
      const fetchMock = mockFetch({
        '/api/clients': [CLIENT],
        '/api/clients/7': CLIENT,
        '/api/reservations/41/notify': NOTIFY_ROWS,
        ...routes,
      })
      renderWithProviders(
        <LotDetailModal lot={lot} onClose={onClose} onRefresh={onRefresh} enabledOptionalStatuses={enabled} />,
        { user: MANAGER }
      )
      return { fetchMock, onClose, onRefresh, user: userEvent.setup() }
    }

    async function pickClient(user) {
      await user.type(await screen.findByPlaceholderText(/Rechercher par nom, CIN/), 'fatima')
      await user.click(await screen.findByRole('option', { name: /Fatima Benali/ }))
    }

    /** The panel is open with `label`; sending posts the notification of `kind` and closes the modal. */
    async function expectPanelAndSend({ fetchMock, onClose, onRefresh, user }, label, kind) {
      const panel = await screen.findByRole('dialog', { name: 'Notifier le client' })
      expect(within(panel).getByText(new RegExp(label))).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
      expect(onRefresh).toHaveBeenCalled()
      await user.click(within(panel).getByRole('button', { name: 'Envoyer' }))
      await waitFor(() => expect(postedBody(fetchMock, '/api/reservations/41/notify')).toEqual({
        channels: ['email'],
        kind,
      }))
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    }

    it('opens after start-option with kind option_confirmee', async () => {
      const ctx = setup(
        { id: 1, numero: 'A1', status: 'available', price: 500000 },
        { '/api/lots/1/transitions/start-option': { id: 41, client_id: 7 } }
      )
      await ctx.user.click(screen.getByRole('button', { name: /^Option$/ }))
      await pickClient(ctx.user)
      await ctx.user.click(screen.getByRole('button', { name: /Confirmer l'option/ }))

      await expectPanelAndSend(ctx, 'Option confirmée', 'option_confirmee')
    })

    it('opens after direct-reservation with kind reservation_a_finaliser', async () => {
      const ctx = setup(
        { id: 2, numero: 'B2', status: 'available', price: 500000 },
        { '/api/lots/2/transitions/direct-reservation': { id: 41, client_id: 7 } }
      )
      await ctx.user.click(screen.getByRole('button', { name: /Résa\. à finaliser/ }))
      await pickClient(ctx.user)
      await ctx.user.type(screen.getByPlaceholderText('Montant reçu'), '20000')
      await ctx.user.type(document.querySelector('input[type="date"]'), '2030-01-15')
      await ctx.user.click(screen.getByRole('button', { name: /Créer la réservation/ }))

      await expectPanelAndSend(ctx, 'Réservation à finaliser', 'reservation_a_finaliser')
    })

    it('opens after to-reservation with kind reservation_a_finaliser', async () => {
      const ctx = setup(
        { id: 3, numero: 'C3', status: 'option', price: 500000, client_id: 7, client_name: 'Fatima Benali' },
        { '/api/lots/3/transitions/to-reservation': { id: 41, client_id: 7 } },
        ['option', 'reservation_a_finaliser']
      )
      await ctx.user.click(screen.getByRole('button', { name: /Passer à réservation à finaliser/ }))
      await ctx.user.type(screen.getByPlaceholderText('Montant reçu'), '20000')
      await ctx.user.type(document.querySelector('input[type="date"]'), '2030-01-15')
      await ctx.user.click(screen.getByRole('button', { name: /Confirmer la réservation/ }))

      await expectPanelAndSend(ctx, 'Réservation à finaliser', 'reservation_a_finaliser')
    })

    it('opens after direct-engage with kind reservation_engagee', async () => {
      const ctx = setup(
        { id: 4, numero: 'D4', status: 'available', price: 500000 },
        { '/api/lots/4/transitions/direct-engage': { id: 41, client_id: 7 } }
      )
      await ctx.user.click(screen.getByRole('button', { name: /Résa\. engagée/ }))
      await pickClient(ctx.user)
      await ctx.user.type(screen.getByPlaceholderText('Montant reçu'), '30000')
      await ctx.user.click(screen.getByRole('button', { name: /Engager la réservation/ }))

      await expectPanelAndSend(ctx, 'Réservation engagée', 'reservation_engagee')
    })

    it('opens after option-engage with kind reservation_engagee', async () => {
      const ctx = setup(
        { id: 5, numero: 'E5', status: 'option', price: 500000, client_id: 7, client_name: 'Fatima Benali', deposit: 5000 },
        { '/api/lots/5/transitions/option-engage': { id: 41, client_id: 7 } },
        ['option']
      )
      await ctx.user.click(screen.getByRole('button', { name: /Engager/ }))
      await ctx.user.type(screen.getByPlaceholderText('Montant reçu'), '20000')
      await ctx.user.click(screen.getByRole('button', { name: /Déduire l'acompte/ }))
      await ctx.user.click(screen.getByRole('button', { name: /Engager la réservation/ }))

      await expectPanelAndSend(ctx, 'Réservation engagée', 'reservation_engagee')
    })

    it('opens after engage of a reservation to finalise, using the lot reservation', async () => {
      const ctx = setup(
        {
          id: 6, numero: 'F6', status: 'reservation_a_finaliser', price: 500000,
          reservation_id: 41, client_id: 7, client_name: 'Fatima Benali', guarantee_amount: 20000,
        },
        { '/api/lots/6/transitions/engage': { id: 6, current_reservation_id: 41 } },
        ['option', 'reservation_a_finaliser']
      )
      await ctx.user.click(screen.getByRole('button', { name: /Valider/ }))
      await ctx.user.click(screen.getByRole('button', { name: /Déduire la garantie/ }))
      await ctx.user.click(screen.getByRole('button', { name: /Confirmer l'engagement/ }))

      await expectPanelAndSend(ctx, 'Réservation engagée', 'reservation_engagee')
    })

    it('closes the modal without sending anything when the panel is dismissed', async () => {
      const ctx = setup(
        { id: 1, numero: 'A1', status: 'available', price: 500000 },
        { '/api/lots/1/transitions/start-option': { id: 41, client_id: 7 } }
      )
      await ctx.user.click(screen.getByRole('button', { name: /^Option$/ }))
      await pickClient(ctx.user)
      await ctx.user.click(screen.getByRole('button', { name: /Confirmer l'option/ }))

      const panel = await screen.findByRole('dialog', { name: 'Notifier le client' })
      await ctx.user.click(within(panel).getByRole('button', { name: 'Fermer' }))

      expect(ctx.onClose).toHaveBeenCalledTimes(1)
      expect(postedBody(ctx.fetchMock, '/api/reservations/41/notify')).toBeUndefined()
    })

    it('still opens (email by default) when the client cannot be loaded', async () => {
      const ctx = setup(
        { id: 1, numero: 'A1', status: 'available', price: 500000 },
        { '/api/lots/1/transitions/start-option': { id: 41, client_id: 7 } }
      )
      const base = ctx.fetchMock.getMockImplementation()
      ctx.fetchMock.mockImplementation((url, opts) =>
        String(url).endsWith('/api/clients/7')
          ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) })
          : base(url, opts))
      await ctx.user.click(screen.getByRole('button', { name: /^Option$/ }))
      await pickClient(ctx.user)
      await ctx.user.click(screen.getByRole('button', { name: /Confirmer l'option/ }))

      const panel = await screen.findByRole('dialog', { name: 'Notifier le client' })
      expect(within(panel).getByRole('checkbox', { name: /Email/ })).toBeChecked()
    })

    it('shows the notification history of the lot', async () => {
      const fetchMock = mockFetch({
        '/api/notifications': [
          { id: 1, kind: 'option_confirmee', channel: 'email', recipient: 'client', status: 'sent', error: null, sent_at: '2026-10-28T09:12:00Z', sent_by_user_id: 2 },
        ],
      })
      renderModal({ id: 9, numero: 'I9', status: 'available', price: 500000 })

      expect(await screen.findByText('Option confirmée')).toBeInTheDocument()
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/notifications?lot_id=9'))).toBe(true)
    })
  })
})
