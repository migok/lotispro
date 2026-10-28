import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders'
import NotificationHistory from '../NotificationHistory'

const USER = { id: 1, role: 'commercial' }

function mockFetch(body) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ROWS = [
  { id: 3, kind: 'option_confirmee', channel: 'email', recipient: 'client', status: 'sent', error: null, sent_at: '2026-10-28T09:12:00Z', sent_by_user_id: 2 },
  { id: 2, kind: 'reservation_a_finaliser', channel: 'sms', recipient: 'client', status: 'not_configured', error: 'x', sent_at: '2026-10-27T09:12:00Z', sent_by_user_id: null },
  { id: 1, kind: 'rappel_expiration', channel: 'whatsapp', recipient: 'commercial', status: 'failed', error: 'Boîte pleine', sent_at: '2026-10-26T09:12:00Z', sent_by_user_id: 2 },
  { id: 0, kind: 'reservation_engagee', channel: 'email', recipient: 'client', status: 'sent', error: null, sent_at: '2026-10-25T09:12:00Z', sent_by_user_id: 2 },
]

describe('NotificationHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders kind, channel, recipient and status labels', async () => {
    mockFetch(ROWS)
    renderWithProviders(<NotificationHistory lotId={5} />, { user: USER })

    expect(await screen.findByText('Option confirmée')).toBeInTheDocument()
    expect(screen.getByText('Réservation à finaliser')).toBeInTheDocument()
    expect(screen.getByText("Rappel d'échéance")).toBeInTheDocument()
    expect(screen.getByText('Réservation engagée')).toBeInTheDocument()
    expect(screen.getAllByText('Envoyé')).toHaveLength(2)
    expect(screen.getByText('Non configuré')).toBeInTheDocument()
    expect(screen.getByText('Échec')).toBeInTheDocument()
    expect(screen.getByText('Boîte pleine')).toBeInTheDocument()
    expect(screen.getByText('WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Commercial')).toBeInTheDocument()
    expect(screen.getByText(/28\/10\/2026/)).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    mockFetch([])
    renderWithProviders(<NotificationHistory clientId={7} />, { user: USER })

    expect(await screen.findByText('Aucune notification')).toBeInTheDocument()
  })

  it('passes the client filter to the API', async () => {
    const fetchMock = mockFetch([])
    renderWithProviders(<NotificationHistory clientId={7} />, { user: USER })

    await screen.findByText('Aucune notification')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/notifications\?client_id=7$/)
  })

  it('passes the lot filter to the API', async () => {
    const fetchMock = mockFetch([])
    renderWithProviders(<NotificationHistory lotId={5} />, { user: USER })

    await screen.findByText('Aucune notification')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/notifications\?lot_id=5$/)
  })

  it('shows an error message when loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) })))
    renderWithProviders(<NotificationHistory lotId={5} />, { user: USER })

    expect(await screen.findByText('Impossible de charger les notifications')).toBeInTheDocument()
  })
})
