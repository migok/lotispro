import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/renderWithProviders'
import { apiGet } from '../../utils/api'
import { PERIOD_STORAGE_KEY } from '../dashboard/period'
import Dashboard from '../Dashboard'

vi.mock('../../utils/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))

const BASE_STATS = {
  counts: { total: 10, available: 6 },
  percentages: {},
  ca_realise: 500000,
  ca_potentiel: 200000,
  ca_total: 2000000,
  taux_vente: 10,
  taux_transformation: 20,
}

const periodStats = (dateTo, lotsVendus) => ({
  ...BASE_STATS,
  period: { date_from: '2026-10-01', date_to: dateTo },
  flow: { lots_vendus: lotsVendus, ca: 300000, reservations_creees: 4, taux_conversion: 25, encaissements: 1000 },
  variations: { lots_vendus: null, ca: null, reservations_creees: null, taux_conversion: null, encaissements: null },
  state: { available: 6, option: 1 },
  state_kpis_available: true,
  flow_kpis_available: true,
  history_start: null,
})

function routeApi() {
  apiGet.mockImplementation(async (url) => {
    if (url.startsWith('/api/dashboard/stats?date_from=')) {
      return periodStats(new URLSearchParams(url.split('?')[1]).get('date_to'), url.includes('2026-12-31') ? 9 : 2)
    }
    if (url.startsWith('/api/dashboard/stats')) return BASE_STATS
    if (url.startsWith('/api/dashboard/performance')) {
      return { series: [{ key: '2026-10', lots_vendus: 2, ca: 300000, reservations_creees: 4, encaissements: 0 }] }
    }
    if (url.startsWith('/api/dashboard/alerts')) return { reservations: [], summary: {} }
    if (url.startsWith('/api/projects/7/kpis')) return { ca_realise: 500000, ca_potentiel: 200000 }
    return []
  })
}

const lotsVendusCard = () => screen.getByText('Lots vendus').closest('.period-kpi-card')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 10, 0))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  routeApi()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  apiGet.mockReset()
  sessionStorage.clear()
})

describe('Dashboard — period', () => {
  it('shows the period picker, the period KPIs and the cumulative sections « à ce jour »', async () => {
    renderWithProviders(<Dashboard projectId={7} />, { user: { id: 1, role: 'manager' } })

    expect(await screen.findByText('Période : du 01/10/2026 au 31/10/2026')).toBeInTheDocument()
    expect(await screen.findByText('Indicateurs clés — à ce jour')).toBeInTheDocument()
    await waitFor(() => expect(within(lotsVendusCard()).getByText('2')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: /Évolution sur la période/ })).toBeInTheDocument()
    expect(screen.queryByText(/Ventes ce Mois/)).toBeNull()
    expect(screen.queryByText(/CA ce Mois/)).toBeNull()

    const urls = apiGet.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/dashboard/stats?date_from=2026-10-01&date_to=2026-10-31&project_id=7')
    expect(urls).toContain('/api/dashboard/performance?date_from=2026-10-01&date_to=2026-10-31&project_id=7')
    expect(urls.some((url) => url.includes('/monthly-breakdown'))).toBe(false)
    expect(urls.filter((url) => url.startsWith('/api/dashboard/performance'))).toHaveLength(1)
  })

  it('reloads only the period data, without the full-page spinner, and keeps the period', async () => {
    const { container } = renderWithProviders(<Dashboard projectId={7} />, { user: { id: 1, role: 'manager' } })
    await waitFor(() => expect(within(lotsVendusCard()).getByText('2')).toBeInTheDocument())
    const dashboardCalls = apiGet.mock.calls.filter(([url]) => url.startsWith('/api/dashboard/lots')).length

    await userEvent.click(screen.getByRole('button', { name: 'Ce trimestre' }))

    expect(container.querySelector('.loading-container')).toBeNull()
    expect(screen.getByText('Période : du 01/10/2026 au 31/12/2026')).toBeInTheDocument()
    await waitFor(() => expect(within(lotsVendusCard()).getByText('9')).toBeInTheDocument())
    expect(apiGet.mock.calls.filter(([url]) => url.startsWith('/api/dashboard/lots'))).toHaveLength(dashboardCalls)
    expect(JSON.parse(sessionStorage.getItem(PERIOD_STORAGE_KEY))).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-12-31' })
  })

  it('filters a commercial on their own id and labels their cumulative section « à ce jour »', async () => {
    renderWithProviders(<Dashboard />, { user: { id: 5, role: 'commercial' } })

    expect(await screen.findByText('Ma performance — à ce jour')).toBeInTheDocument()
    await waitFor(() => {
      const urls = apiGet.mock.calls.map(([url]) => url)
      expect(urls).toContain('/api/dashboard/stats?date_from=2026-10-01&date_to=2026-10-31&user_id=5')
    })
  })

  it('restores the period kept in the session', async () => {
    sessionStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify({ dateFrom: '2026-07-01', dateTo: '2026-09-30' }))
    renderWithProviders(<Dashboard projectId={7} />, { user: { id: 1, role: 'manager' } })
    expect(await screen.findByText('Période : du 01/07/2026 au 30/09/2026')).toBeInTheDocument()
  })
})
