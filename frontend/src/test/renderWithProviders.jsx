import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../contexts/ToastContext'
import { AuthContext } from '../contexts/authHooks'

/**
 * Renders `ui` inside MemoryRouter + ToastProvider + a simulated AuthContext.
 *
 * `user` (e.g. `{ id: 1, role: 'manager' }`) drives the role helpers exactly
 * like AuthProvider does; `user = null` means an unauthenticated session.
 */
export function renderWithProviders(ui, { route = '/', user = null } = {}) {
  const auth = {
    user,
    token: user ? 'test-token' : null,
    loading: false,
    login: async () => ({ success: false, error: 'login is not mocked' }),
    logout: () => {},
    isAuthenticated: () => !!user,
    hasRole: (role) => user?.role === role,
    hasAnyRole: (roles) => roles.includes(user?.role),
    isManager: () => user?.role === 'manager',
    isCommercial: () => user?.role === 'commercial',
    isClient: () => user?.role === 'client',
  }

  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={auth}>
        <ToastProvider>{ui}</ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  )
}
