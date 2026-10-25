import { screen } from '@testing-library/react'
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

  it('shows the legacy address (address_morocco only) in read mode', async () => {
    mockFetch({ ...CLIENT, address_abroad: null, acte_address: null })
    renderPage()

    const line = await screen.findByText(/12 rue des Orangers/)
    expect(line).toHaveTextContent('Actes')
  })
})
