import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ParametresTab } from '../ProjectDetailPage'

const PROJECT = { id: 7, name: 'Les Jardins', enabled_optional_statuses: ['option', 'reservation_a_finaliser'] }

describe('ParametresTab — étapes du workflow', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(null) }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the workflow settings to a manager', () => {
    renderWithProviders(<ParametresTab project={PROJECT} onUpdate={() => {}} />, { user: { id: 1, role: 'manager' } })

    expect(screen.getByRole('heading', { name: 'Étapes du workflow' })).toBeInTheDocument()
  })

  it('hides the workflow settings from a commercial', () => {
    renderWithProviders(<ParametresTab project={PROJECT} onUpdate={() => {}} />, { user: { id: 2, role: 'commercial' } })

    expect(screen.getByRole('heading', { name: 'Paramètres du Projet' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Étapes du workflow' })).not.toBeInTheDocument()
  })
})
