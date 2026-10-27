import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import EdlPanel from '../EdlPanel'

const EDL = {
  id: 9,
  scheduled_at: '2026-10-20T10:00:00Z',
  intervenant: 'M. Expert',
  schedule_note: null,
  done_at: '2026-10-21T10:00:00Z',
  done_note: null,
  finalized_at: null,
  actions: [
    { id: 1, description: 'Volet cassé', responsable: null, status: 'ouverte' },
    { id: 2, description: 'Robinet', responsable: 'Plombier', status: 'faite' },
  ],
}

function mockFetch() {
  const fetchMock = vi.fn((url, options = {}) => {
    const isEdl = String(url).endsWith('/api/lots/5/edl') && !options.method
    const body = isEdl ? EDL : { message: 'ok' }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function callTo(fetchMock, method, pathEnd) {
  return fetchMock.mock.calls.find(
    ([url, options]) => String(url).endsWith(pathEnd) && options?.method === method
  )
}

function renderPanel(status = 'edl_realise') {
  const onOpenCountChange = vi.fn()
  renderWithProviders(<EdlPanel lot={{ id: 5, status }} onOpenCountChange={onOpenCountChange} />, {
    user: { id: 1, role: 'manager' },
  })
  return onOpenCountChange
}

describe('EdlPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the number of open actions', async () => {
    mockFetch()
    const onOpenCountChange = renderPanel()

    await waitFor(() => expect(onOpenCountChange).toHaveBeenCalledWith(1))
  })

  it('ticks an open action as done', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderPanel()

    await user.click(await screen.findByLabelText('Marquer « Volet cassé » comme faite'))

    await waitFor(() => expect(callTo(fetchMock, 'PUT', '/api/lots/5/edl/actions/1')).toBeDefined())
    expect(JSON.parse(callTo(fetchMock, 'PUT', '/api/lots/5/edl/actions/1')[1].body)).toEqual({ status: 'faite' })
  })

  it('adds an action', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderPanel()

    await user.type(await screen.findByLabelText("Description de l'action"), ' Peinture ')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(callTo(fetchMock, 'POST', '/api/lots/5/edl/actions')).toBeDefined())
    expect(JSON.parse(callTo(fetchMock, 'POST', '/api/lots/5/edl/actions')[1].body)).toEqual({
      description: 'Peinture',
      responsable: null,
    })
  })

  it('deletes an action', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderPanel()

    await user.click(await screen.findByLabelText('Supprimer « Robinet »'))

    await waitFor(() => expect(callTo(fetchMock, 'DELETE', '/api/lots/5/edl/actions/2')).toBeDefined())
  })

  it('is read-only outside "EDL réalisé"', async () => {
    mockFetch()
    renderPanel('edl_finalise')

    expect(await screen.findByText('Volet cassé')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument()
  })
})
