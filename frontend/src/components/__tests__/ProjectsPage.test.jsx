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
})
