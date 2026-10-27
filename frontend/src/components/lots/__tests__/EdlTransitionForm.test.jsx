import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import EdlTransitionForm from '../EdlTransitionForm'

const EDL = {
  id: 9,
  scheduled_at: '2026-11-03T09:30:00Z',
  intervenant: 'M. Expert',
  schedule_note: 'Clés chez le gardien',
  actions: [],
}

function mockFetch() {
  const fetchMock = vi.fn((url) => {
    const body = String(url).endsWith('/api/lots/5/edl') ? EDL : { id: 5 }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sent(fetchMock, method, pathEnd) {
  const call = fetchMock.mock.calls.find(
    ([url, options]) => String(url).endsWith(pathEnd) && options?.method === method
  )
  return call ? JSON.parse(call[1].body) : undefined
}

function renderForm(mode, lot = { id: 5, status: 'reservation_soldee' }) {
  const onDone = vi.fn()
  renderWithProviders(<EdlTransitionForm mode={mode} lot={lot} onCancel={() => {}} onDone={onDone} />, {
    user: { id: 1, role: 'manager' },
  })
  return onDone
}

describe('EdlTransitionForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('schedules the EDL with the local date-time sent as ISO', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    const onDone = renderForm('edl_schedule')

    fireEvent.change(screen.getByLabelText(/Date et heure/), { target: { value: '2026-11-03T10:30' } })
    await user.type(screen.getByLabelText(/Intervenant/), '  M. Expert ')
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(sent(fetchMock, 'POST', '/api/lots/5/transitions/edl-schedule')).toEqual({
      scheduled_at: new Date('2026-11-03T10:30').toISOString(),
      intervenant: 'M. Expert',
      note: null,
    })
  })

  it('reschedules from the current EDL with PUT', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    const onDone = renderForm('edl_reschedule', { id: 5, status: 'edl_programme' })

    await waitFor(() => expect(screen.getByLabelText(/Intervenant/)).toHaveValue('M. Expert'))
    await user.clear(screen.getByLabelText(/Intervenant/))
    await user.type(screen.getByLabelText(/Intervenant/), 'Mme Dupont')
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(sent(fetchMock, 'PUT', '/api/lots/5/transitions/edl-schedule')).toEqual({
      scheduled_at: new Date(EDL.scheduled_at).toISOString(),
      intervenant: 'Mme Dupont',
      note: 'Clés chez le gardien',
    })
  })

  it('records the visit with the non-empty actions', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    const onDone = renderForm('edl_done', { id: 5, status: 'edl_programme' })

    fireEvent.change(screen.getByLabelText(/Date de la visite/), { target: { value: '2026-11-04T14:00' } })
    await user.click(screen.getByRole('button', { name: /Ajouter une action/ }))
    await user.click(screen.getByRole('button', { name: /Ajouter une action/ }))
    await user.type(screen.getByLabelText("Description de l'action 1"), 'Volet cassé')
    await user.type(screen.getByLabelText("Responsable de l'action 1"), 'Menuisier')
    await user.type(screen.getByLabelText(/Compte rendu/), 'RAS sinon')
    await user.click(screen.getByRole('button', { name: /Enregistrer la visite/ }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(sent(fetchMock, 'POST', '/api/lots/5/transitions/edl-done')).toEqual({
      done_at: new Date('2026-11-04T14:00').toISOString(),
      note: 'RAS sinon',
      actions: [{ description: 'Volet cassé', responsable: 'Menuisier' }],
    })
  })
})
