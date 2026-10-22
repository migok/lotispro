import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import LotDetailModal from '../LotDetailModal'

describe('LotDetailModal', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('displays the "Disponible" status label for an available lot', async () => {
    const lot = { id: 1, numero: 'A1', status: 'available', price: 500000, surface: 200 }

    renderWithProviders(
      <LotDetailModal lot={lot} onClose={() => {}} onRefresh={() => {}} />,
      { user: { id: 1, role: 'manager' } }
    )

    expect((await screen.findAllByText('Disponible')).length).toBeGreaterThan(0)
  })
})
