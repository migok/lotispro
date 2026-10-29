import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/renderWithProviders'
import CommercialsPage from '../CommercialsPage'
import { loadInternationalPhoneInput } from '../clients/lazyInternationalPhoneInput'

const COMMERCIAL = { id: 5, name: 'Karim Alaoui', email: 'karim@exemple.ma', role: 'commercial', phone: '+212612345678', created_at: '2026-01-02T10:00:00' }

function mockFetch(patchResponse) {
  const fetchMock = vi.fn((url, options) => {
    const path = String(url)
    let body = []
    if (options?.method === 'PATCH') body = patchResponse
    else if (path.includes('/api/users?role=commercial')) body = [COMMERCIAL]
    else if (path.includes('/api/dashboard/commercial-stats')) body = {}
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('CommercialsPage - téléphone', () => {
  beforeAll(async () => {
    await loadInternationalPhoneInput()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets a manager edit the phone and shows the saved value', async () => {
    mockFetch({ ...COMMERCIAL, phone: '+212698765432' })
    const user = userEvent.setup()
    renderWithProviders(<CommercialsPage />, { user: { id: 1, role: 'manager' } })

    expect(await screen.findByText('+212612345678')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Modifier le téléphone' }))
    await user.clear(screen.getByLabelText('Téléphone'))
    await user.type(screen.getByLabelText('Téléphone'), '+212698765432')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('+212698765432')).toBeInTheDocument()
  })

  it('shows the phone read-only for a non-manager', async () => {
    mockFetch({})
    renderWithProviders(<CommercialsPage />, { user: { id: 2, role: 'commercial' } })

    expect(await screen.findByText('+212612345678')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier le téléphone' })).not.toBeInTheDocument()
  })
})
