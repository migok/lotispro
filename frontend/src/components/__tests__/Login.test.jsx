import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import Login from '../Login'

describe('Login', () => {
  it('renders email and password fields and submit button', () => {
    renderWithProviders(<Login />)

    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument()
  })
})
