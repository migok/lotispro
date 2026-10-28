import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../../test/renderWithProviders'
import ClientDetailPage from '../ClientDetailPage'

const CLIENT = {
  id: 7,
  name: 'Fatima Benali',
  first_name: 'Fatima',
  last_name: 'Benali',
  maiden_name: 'Alaoui',
  phone: '+212612345678',
  whatsapp: '+212612345679',
  email: 'fatima@exemple.ma',
  cin: 'AB123456',
  address_morocco: '12 rue des Orangers',
  city_morocco: 'Casablanca',
  address_abroad: '5 avenue de Paris',
  city_abroad: 'Lyon',
  country_abroad: 'France',
  acte_address: 'abroad',
  acquisition_channel: 'samsar',
  acquisition_referrer: 'Karim',
  acquisition_date: '2026-10-01',
  notification_channels: ['email', 'whatsapp'],
  client_type: 'autre',
  created_at: '2026-10-02T10:00:00',
  sales_history: [],
  reservations: [],
}

function mockFetch(client) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const body = String(url).includes('/details') ? client : []
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })
  )
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/app/clients/:clientId" element={<ClientDetailPage />} />
    </Routes>,
    { route: '/app/clients/7', user: { id: 1, role: 'manager' } }
  )
}

describe('ClientDetailPage - fiche client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the acquisition channel with referrer and DD/MM/YYYY date', async () => {
    mockFetch(CLIENT)
    renderPage()

    expect(await screen.findByText('Canal : Samsar — Karim (01/10/2026)')).toBeInTheDocument()
  })

  it('shows both addresses and flags the one used for actes', async () => {
    mockFetch(CLIENT)
    renderPage()

    const morocco = await screen.findByText(/12 rue des Orangers/)
    const abroad = screen.getByText(/5 avenue de Paris/)
    expect(abroad).toHaveTextContent('Étranger : 5 avenue de Paris, Lyon, France')
    expect(morocco).toHaveTextContent('Maroc : 12 rue des Orangers, Casablanca')
    expect(abroad).toHaveTextContent('Actes')
    expect(morocco).not.toHaveTextContent('Actes')
    expect(screen.getByTitle("Adresse utilisée pour les actes")).toBeInTheDocument()
  })

  it('shows the notification history of the client', async () => {
    const fetchMock = vi.fn((url) => {
      const path = String(url)
      const body = path.includes('/details')
        ? CLIENT
        : path.includes('/api/notifications')
          ? [{ id: 1, kind: 'reservation_engagee', channel: 'email', recipient: 'client', status: 'sent', error: null, sent_at: '2026-10-28T09:12:00Z', sent_by_user_id: 2 }]
          : []
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    expect(await screen.findByText('Réservation engagée')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/notifications?client_id=7'))).toBe(true)
  })

  it('shows the legacy address (address_morocco only) in read mode', async () => {
    mockFetch({ ...CLIENT, address_abroad: null, acte_address: null })
    renderPage()

    const line = await screen.findByText(/12 rue des Orangers/)
    expect(line).toHaveTextContent('Actes')
  })

  describe('acte de réservation', () => {
    const WITH_RESERVATION = {
      ...CLIENT,
      reservations_history: [
        { id: 5, status: 'reservation_engagee', lot_numero: 'A1', project_id: 1, project_name: 'Projet', promotion_amount: 0 },
      ],
    }

    function mockDownloads(acteStatus) {
      const fetchMock = vi.fn((url) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, '')
        const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
        if (path.endsWith('/details')) return json(WITH_RESERVATION)
        if (path.includes('/api/payments/schedules/client/')) {
          return json([{ reservation_id: 5, installments: [{ payment_type: 'deposit', installment_number: 1, status: 'paid' }] }])
        }
        if (path.endsWith('/api/reservations/5/acte')) {
          return Promise.resolve({ ok: acteStatus === 200, status: acteStatus, blob: () => Promise.resolve(new Blob(['%PDF'])), json: () => Promise.resolve({}) })
        }
        if (path.endsWith('/api/reservations/5/certificate')) {
          return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF'])) })
        }
        return json([])
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    const calledPaths = (fetchMock) => fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''))

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:acte')
      URL.revokeObjectURL = vi.fn()
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    async function clickDownload() {
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Réservations \(1\)/ }))
      await user.click(await screen.findByRole('button', { name: /Télécharger/ }))
    }

    it('downloads the archived acte first', async () => {
      const fetchMock = mockDownloads(200)
      await clickDownload()

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
      expect(calledPaths(fetchMock)).toContain('/api/reservations/5/acte')
      expect(calledPaths(fetchMock)).not.toContain('/api/reservations/5/certificate')
    })

    it('falls back to on-the-fly generation when no acte is archived (404)', async () => {
      const fetchMock = mockDownloads(404)
      await clickDownload()

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
      expect(calledPaths(fetchMock)).toEqual(expect.arrayContaining(['/api/reservations/5/acte', '/api/reservations/5/certificate']))
    })
  })
})
