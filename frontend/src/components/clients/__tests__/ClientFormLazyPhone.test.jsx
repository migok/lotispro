import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders'
import ClientForm from '../ClientForm'

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn() }))

describe('ClientForm phone input loading', () => {
  it('shows a plain phone input until the country picker chunk is loaded', async () => {
    renderWithProviders(<ClientForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('Téléphone *')).toHaveAttribute('type', 'tel')
    expect(screen.queryByRole('button', { name: 'Indicatif téléphone' })).not.toBeInTheDocument()

    expect(await screen.findByRole('button', { name: 'Indicatif téléphone' })).toBeInTheDocument()
    expect(screen.getByLabelText('Téléphone *')).toHaveAttribute('type', 'tel')
  })
})
