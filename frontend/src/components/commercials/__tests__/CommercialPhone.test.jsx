import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import CommercialPhone from '../CommercialPhone'
import { loadInternationalPhoneInput } from '../../clients/lazyInternationalPhoneInput'

const MANAGER = { id: 1, role: 'manager' }

function mockPatch(response, ok = true) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 422, json: () => Promise.resolve(response) })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPhone(props = {}) {
  const onSaved = vi.fn()
  renderWithProviders(
    <CommercialPhone commercial={{ id: 5, phone: '+212612345678' }} canEdit onSaved={onSaved} {...props} />,
    { user: MANAGER }
  )
  return onSaved
}

describe('CommercialPhone', () => {
  // Le champ téléphone est chargé à la demande : on le précharge pour des rendus synchrones.
  beforeAll(async () => {
    await loadInternationalPhoneInput()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the phone read-only when the user cannot edit', () => {
    renderPhone({ canEdit: false })

    expect(screen.getByText('+212612345678')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier le téléphone' })).not.toBeInTheDocument()
  })

  it('shows a placeholder when no phone is set', () => {
    renderPhone({ commercial: { id: 5, phone: null }, canEdit: false })

    expect(screen.getByText('Non renseigné')).toBeInTheDocument()
  })

  it('patches the normalised phone for a manager and reports the saved user', async () => {
    const saved = { id: 5, phone: '+212612345678' }
    const fetchMock = mockPatch(saved)
    const user = userEvent.setup()
    const onSaved = renderPhone({ commercial: { id: 5, phone: null } })

    await user.click(screen.getByRole('button', { name: 'Modifier le téléphone' }))
    await user.type(screen.getByLabelText('Téléphone'), '+212 6 12 34 56 78')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/users\/5$/)
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(options.body)).toEqual({ phone: '+212612345678' })
    expect(screen.queryByLabelText('Téléphone')).not.toBeInTheDocument()
  })

  it('clears the phone when the field is emptied', async () => {
    const fetchMock = mockPatch({ id: 5, phone: null })
    const user = userEvent.setup()
    renderPhone()

    await user.click(screen.getByRole('button', { name: 'Modifier le téléphone' }))
    await user.clear(screen.getByLabelText('Téléphone'))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ phone: null })
  })

  it('rejects an invalid number without calling the API', async () => {
    const fetchMock = mockPatch({})
    const user = userEvent.setup()
    renderPhone()

    await user.click(screen.getByRole('button', { name: 'Modifier le téléphone' }))
    await user.clear(screen.getByLabelText('Téléphone'))
    await user.type(screen.getByLabelText('Téléphone'), '+33612345')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('Numéro incomplet ou invalide pour ce pays')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the API error and stays in edit mode', async () => {
    mockPatch({ message: 'Numéro refusé' }, false)
    const user = userEvent.setup()
    const onSaved = renderPhone()

    await user.click(screen.getByRole('button', { name: 'Modifier le téléphone' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Numéro refusé')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Téléphone')).toBeInTheDocument()
  })

  it('asks for the dial code when a legacy number has none', async () => {
    const fetchMock = mockPatch({})
    const user = userEvent.setup()
    renderPhone({ commercial: { id: 5, phone: '0612345678' } })

    await user.click(screen.getByRole('button', { name: 'Modifier le téléphone' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText("Choisissez l'indicatif du pays")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cancels the edit', async () => {
    const fetchMock = mockPatch({})
    const user = userEvent.setup()
    renderPhone()

    await user.click(screen.getByRole('button', { name: 'Modifier le téléphone' }))
    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByLabelText('Téléphone')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
