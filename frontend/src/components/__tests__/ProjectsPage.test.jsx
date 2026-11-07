import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import ProjectsPage from '../ProjectsPage'

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the empty state when the API returns no projects', async () => {
    renderWithProviders(<ProjectsPage />, { user: { id: 1, role: 'manager' } })

    expect(await screen.findByText('Aucun projet enregistré.')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects'),
      expect.anything()
    )
  })

  it('shows the available, in-progress and sold counts sent by the API', async () => {
    const project = {
      id: 3, name: 'Les Oliviers', description: null, visibility: 'private',
      total_lots: 10, available_lots: 3, reserved_lots: 4, sold_lots: 1, ca_objectif: 0,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([project]) }))
    )

    renderWithProviders(<ProjectsPage />, { user: { id: 1, role: 'manager' } })

    // Blocked lots and lots in creation are neither available, in progress nor sold
    expect((await screen.findByText('dispos')).previousElementSibling).toHaveTextContent('3')
    expect(screen.getByText('en cours').previousElementSibling).toHaveTextContent('4')
    expect(screen.getByText('vendus').previousElementSibling).toHaveTextContent('1')
  })
})
