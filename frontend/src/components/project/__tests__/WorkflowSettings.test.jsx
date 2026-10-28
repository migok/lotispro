import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import WorkflowSettings from '../WorkflowSettings'

const PROJECT = { id: 7, name: 'Les Jardins', enabled_optional_statuses: ['option', 'reservation_a_finaliser'], acte_min_paid_pct: 10 }

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
    expect(JSON.parse(options.body)).toEqual({ enabled_optional_statuses: ['option', 'edl'], acte_min_paid_pct: 10 })
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

  it("shows the project's deed threshold", () => {
    mockFetch({ status: 200, body: PROJECT })
    renderWithProviders(<WorkflowSettings project={PROJECT} onUpdate={() => {}} />, { user: { id: 1, role: 'manager' } })

    expect(screen.getByLabelText("Seuil d'émission de l'acte (%)")).toHaveValue(10)
  })

  it('sends the deed threshold with PUT /workflow', async () => {
    const fetchMock = mockFetch({ status: 200, body: { ...PROJECT, acte_min_paid_pct: 12.5 } })
    const onUpdate = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<WorkflowSettings project={PROJECT} onUpdate={onUpdate} />, { user: { id: 1, role: 'manager' } })

    const threshold = screen.getByLabelText("Seuil d'émission de l'acte (%)")
    await user.clear(threshold)
    await user.type(threshold, '12.5')
    await user.click(screen.getByRole('button', { name: /Enregistrer les étapes/ }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      enabled_optional_statuses: ['option', 'reservation_a_finaliser'],
      acte_min_paid_pct: 12.5,
    })
  })

  it.each([['101'], ['-1'], ['']])('refuses the threshold %j without calling the API', async (typed) => {
    const fetchMock = mockFetch({ status: 200, body: PROJECT })
    const onUpdate = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<WorkflowSettings project={PROJECT} onUpdate={onUpdate} />, { user: { id: 1, role: 'manager' } })

    const threshold = screen.getByLabelText("Seuil d'émission de l'acte (%)")
    await user.clear(threshold)
    if (typed) await user.type(threshold, typed)
    await user.click(screen.getByRole('button', { name: /Enregistrer les étapes/ }))

    expect(screen.getByRole('alert')).toHaveTextContent("Le seuil d'émission de l'acte doit être compris entre 0 et 100 %.")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('defaults the threshold to 10 % for a project without one', () => {
    mockFetch({ status: 200, body: PROJECT })
    const { acte_min_paid_pct: _omit, ...legacy } = PROJECT
    renderWithProviders(<WorkflowSettings project={legacy} onUpdate={() => {}} />, { user: { id: 1, role: 'manager' } })

    expect(screen.getByLabelText("Seuil d'émission de l'acte (%)")).toHaveValue(10)
  })
})
