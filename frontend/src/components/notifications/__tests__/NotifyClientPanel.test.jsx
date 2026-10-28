import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import NotifyClientPanel from '../NotifyClientPanel'

const USER = { id: 1, role: 'commercial' }
const CLIENT = { id: 7, name: 'Fatima Benali', notification_channels: ['email', 'sms'] }

function row(channel, status, error = null) {
  return { id: 1, channel, status, error, kind: 'option_confirmee' }
}

/** Stubs fetch; the notify POST answers `rows` (or fails with 500 when `rows` is null). */
function mockNotify(rows) {
  const fetchMock = vi.fn(() =>
    rows
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) })
      : Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'Erreur serveur' }) })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPanel(props = {}) {
  const onClose = vi.fn()
  renderWithProviders(
    <NotifyClientPanel
      reservationId={41}
      kind="option_confirmee"
      client={CLIENT}
      onClose={onClose}
      {...props}
    />,
    { user: USER }
  )
  return onClose
}

describe('NotifyClientPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pre-checks the client channels; only email is active, SMS is disabled "bientôt disponible"', () => {
    mockNotify([])
    renderPanel()

    expect(screen.getByRole('checkbox', { name: /Email/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Email/ })).toBeEnabled()
    const sms = screen.getByRole('checkbox', { name: /SMS/ })
    expect(sms).toBeChecked()
    expect(sms).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /WhatsApp/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /WhatsApp/ })).toBeDisabled()
    expect(screen.getAllByText('bientôt disponible')).toHaveLength(2)
  })

  it('sends only the available checked channels with the kind', async () => {
    const fetchMock = mockNotify([row('email', 'sent')])
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/reservations\/41\/notify$/)
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ channels: ['email'], kind: 'option_confirmee' })
  })

  it('disables "Envoyer" when no channel is checked', async () => {
    mockNotify([])
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('checkbox', { name: /Email/ }))

    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('defaults to email when the client has no preference', () => {
    mockNotify([])
    renderPanel({ client: { id: 7, name: 'X', notification_channels: null } })

    expect(screen.getByRole('checkbox', { name: /Email/ })).toBeChecked()
  })

  it('shows one toast per channel (sent, failed, not configured) and closes', async () => {
    mockNotify([row('email', 'sent'), row('sms', 'failed', 'Boîte pleine'), row('whatsapp', 'not_configured')])
    const user = userEvent.setup()
    const onClose = renderPanel()

    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText('Email envoyé')).toBeInTheDocument()
    expect(screen.getByText('Échec : Boîte pleine')).toBeInTheDocument()
    expect(screen.getByText('Canal non configuré')).toBeInTheDocument()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows an error toast and stays open when the request fails', async () => {
    mockNotify(null)
    const user = userEvent.setup()
    const onClose = renderPanel()

    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText('Erreur serveur')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled()
  })

  it('closes without sending anything on "Fermer"', async () => {
    const fetchMock = mockNotify([])
    const user = userEvent.setup()
    const onClose = renderPanel()

    await user.click(screen.getByRole('button', { name: 'Fermer' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
