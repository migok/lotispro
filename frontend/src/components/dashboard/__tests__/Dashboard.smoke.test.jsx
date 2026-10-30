import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { apiGet } from '../../../utils/api'
import Dashboard from '../../Dashboard'

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))

const STATS = {
  counts: { total: 10, available: 6, en_cours: 3 },
  percentages: { available: 60, en_cours: 30 },
  ca_realise: 500000,
  ca_potentiel: 200000,
  ca_total: 2000000,
  taux_vente: 10,
  taux_transformation: 20,
  period: { date_from: '2026-10-01', date_to: '2026-10-31' },
  flow: { lots_vendus: 2, ca: 300000, reservations_creees: 4, taux_conversion: 25, encaissements: 1000 },
  variations: { lots_vendus: null, ca: null, reservations_creees: null, taux_conversion: null, encaissements: null },
  state: { available: 6, option: 1 },
  state_kpis_available: true,
  flow_kpis_available: true,
  history_start: null,
}

const LOTS = [
  { id: 1, numero: 'A1', status: 'available', price: 100000, surface: 100, zone: 'A', type_lot: 'Résidentiel' },
  { id: 2, numero: 'A2', status: 'option', price: 120000, surface: 110, zone: 'A', type_lot: 'Commercial' },
]

const OPTIONS = [
  {
    lot_id: 2,
    lot_numero: 'A2',
    project_name: 'Projet X',
    client_name: 'Client Option',
    client_phone: '0600000000',
    reserved_by_name: 'Com One',
    lot_status: 'option',
    reservation_date: '2026-10-20T10:00:00',
    expiration_date: '2026-11-05T10:00:00',
    days_remaining: 6,
    is_expired: false,
  },
]

function routeApi() {
  apiGet.mockImplementation(async (url) => {
    if (url.startsWith('/api/dashboard/stats')) return STATS
    if (url.startsWith('/api/dashboard/performance')) return { series: [] }
    if (url.startsWith('/api/dashboard/lots')) return LOTS
    if (url.startsWith('/api/dashboard/alerts')) return { reservations: [], summary: {} }
    if (url.startsWith('/api/dashboard/clients-pipeline')) return []
    if (url.startsWith('/api/dashboard/late-payments')) return []
    if (url.startsWith('/api/dashboard/notaire-alerts')) return []
    if (url.startsWith('/api/dashboard/options-tracking')) return OPTIONS
    if (url.startsWith('/api/projects/7/kpis')) return { ca_realise: 500000, ca_potentiel: 200000 }
    if (url.startsWith('/api/users')) return []
    return []
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 10, 0))
  routeApi()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  apiGet.mockReset()
  sessionStorage.clear()
})

describe('Dashboard — sections', () => {
  it('renders the period, cumulative, stock and category sections for a manager', async () => {
    renderWithProviders(<Dashboard projectId={7} />, { user: { id: 1, role: 'manager' } })

    expect(await screen.findByText('Lots vendus')).toBeInTheDocument()
    expect(screen.getByText('Indicateurs clés — à ce jour')).toBeInTheDocument()
    expect(screen.getByText('Stock de Lots')).toBeInTheDocument()
    expect(screen.getByText('Répartition par catégorie')).toBeInTheDocument()
  })

  it('shows the options list when switching to the options tab', async () => {
    renderWithProviders(<Dashboard projectId={7} />, { user: { id: 1, role: 'manager' } })
    await screen.findByText('Stock de Lots')

    await userEvent.click(screen.getByRole('button', { name: /Suivi des options/ }))

    await waitFor(() => expect(screen.getByText('Client Option')).toBeInTheDocument())
    expect(screen.getByText('#A2')).toBeInTheDocument()
    expect(screen.getByText('Options actives')).toBeInTheDocument()
  })
})
