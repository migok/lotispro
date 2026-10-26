import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/renderWithProviders'
import LotDetailModal from '../LotDetailModal'

const MANAGER = { id: 1, role: 'manager' }

/**
 * Stubs fetch: `routes` maps a path (without query string) to a JSON body;
 * unknown paths answer `[]`.
 */
function mockFetch(routes = {}) {
  const fetchMock = vi.fn((url) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const body = Object.hasOwn(routes, path) ? routes[path] : []
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderModal(lot, enabledOptionalStatuses) {
  return renderWithProviders(
    <LotDetailModal
      lot={lot}
      onClose={() => {}}
      onRefresh={() => {}}
      enabledOptionalStatuses={enabledOptionalStatuses}
    />,
    { user: MANAGER }
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
    expect(screen.getByRole('button', { name: /Finaliser/ })).toBeDisabled()
    expect(screen.getByText('1 action ouverte')).toBeInTheDocument()
  })
})
