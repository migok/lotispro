import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import WorkflowSettings from '../WorkflowSettings'

const PROJECT = { id: 7, name: 'Les Jardins', enabled_optional_statuses: ['option', 'reservation_a_finaliser'] }

function mockFetch(response) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: response.status < 400,
      status: response.status,
      json: () => Promise.resolve(response.body),
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('WorkflowSettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reflects the project settings', () => {
    mockFetch({ status: 200, body: PROJECT })
    renderWithProviders(<WorkflowSettings project={PROJECT} onUpdate={() => {}} />, { user: { id: 1, role: 'manager' } })

    expect(screen.getByRole('checkbox', { name: /Option/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Réservation à finaliser/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /États des lieux/ })).not.toBeChecked()
  })

  it('saves the checked steps with PUT /workflow', async () => {
    const fetchMock = mockFetch({ status: 200, body: { ...PROJECT, enabled_optional_statuses: ['option', 'edl'] } })
    const onUpdate = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<WorkflowSettings project={PROJECT} onUpdate={onUpdate} />, { user: { id: 1, role: 'manager' } })

    await user.click(screen.getByRole('checkbox', { name: /Réservation à finaliser/ }))
    await user.click(screen.getByRole('checkbox', { name: /États des lieux/ }))
    await user.click(screen.getByRole('button', { name: /Enregistrer les étapes/ }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/projects\/7\/workflow$/)
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ enabled_optional_statuses: ['option', 'edl'] })
    expect(await screen.findByText('Étapes du workflow mises à jour')).toBeInTheDocument()
  })

  it('shows the refusal message listing the lots concerned', async () => {
    const message = 'Impossible de désactiver « Option » : lots concernés : A1, A2.'
    mockFetch({ status: 400, body: { message, details: [{ rule: 'status_in_use' }] } })
    const onUpdate = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<WorkflowSettings project={PROJECT} onUpdate={onUpdate} />, { user: { id: 1, role: 'manager' } })

    await user.click(screen.getByRole('checkbox', { name: /Option/ }))
    await user.click(screen.getByRole('button', { name: /Enregistrer les étapes/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
