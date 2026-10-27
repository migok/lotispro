import { screen, waitFor } from '@testing-library/react'
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
    expect(postedBody(fetchMock, '/api/lots/8/transitions/direct-engage')).toMatchObject({
      client_id: 7,
      guarantee_amount: 30000,
      payment_type: 'transfer',
      sale_price: 500000,
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
    const SCHEDULE = { '/api/payments/schedules/reservation/11': { installments: [] } }
    const RESERVATION = { id: 11, sale_price: 500000, promotion_amount: 0, promotion_received: false }

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

    it('does not alert while the promotion is pending (no deed is expected yet)', async () => {
      const fetchMock = mockFetch({
        ...SCHEDULE,
        '/api/reservations/11': { ...RESERVATION, sale_price: 450000, promotion_amount: 50000 },
        '/api/lots/5/documents': [],
      })
      renderModal(ENGAGED)

      expect(await screen.findByText('Non reçue')).toBeInTheDocument()
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/lots/5/documents'))).toBe(true))
      expect(screen.queryByText("L'acte n'a pas été généré.")).not.toBeInTheDocument()
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
})
