import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import ClientForm from '../ClientForm'
import { apiGet } from '../../../utils/api'

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn() }))

const fill = async (user, label, value) => {
  await user.clear(screen.getByLabelText(label))
  await user.type(screen.getByLabelText(label), value)
}

const fillRequired = async (user) => {
  await fill(user, 'Nom *', 'Benali')
  await fill(user, 'Prénom *', 'Fatima')
  await fill(user, 'Téléphone *', '0612345678')
  await user.selectOptions(screen.getByLabelText("Canal d'acquisition *"), 'smap')
}

describe('ClientForm', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiGet.mockResolvedValue([])
  })

  it('renders fields in spec order', () => {
    renderWithProviders(<ClientForm onSubmit={vi.fn()} />)
    const labels = [
      'Nom *', 'Nom de jeune fille', 'Prénom *', 'CIN', 'Téléphone *',
      'WhatsApp', 'Email', 'Adresse Maroc', 'Adresse étranger',
    ]
    // « WhatsApp » existe aussi comme canal de notification (plus bas) : on prend le 1er.
    const elements = labels.map((l) => screen.getAllByLabelText(l)[0])
    elements.slice(1).forEach((el, i) => {
      expect(
        elements[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })
  })

  it('shows referrer for recommandation and referrer+date for samsar', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ClientForm onSubmit={vi.fn()} />)
    const channel = screen.getByLabelText("Canal d'acquisition *")

    expect(screen.queryByLabelText(/Recommandé par/)).not.toBeInTheDocument()
    await user.selectOptions(channel, 'recommandation')
    expect(screen.getByLabelText('Recommandé par *')).toBeInTheDocument()
    expect(screen.queryByLabelText("Date d'acquisition *")).not.toBeInTheDocument()

    await user.selectOptions(channel, 'samsar')
    expect(screen.getByLabelText('Nom du samsar *')).toBeInTheDocument()
    expect(screen.getByLabelText("Date d'acquisition *")).toBeInTheDocument()
  })

  it('asks acte address only when both addresses are filled', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ClientForm onSubmit={vi.fn()} />)

    await fill(user, 'Adresse Maroc', '12 rue X, Casablanca')
    expect(screen.queryByText(/Adresse utilisée pour les actes/)).not.toBeInTheDocument()
    await fill(user, 'Adresse étranger', '5 rue Y, Paris')
    expect(screen.getByText(/Adresse utilisée pour les actes/)).toBeInTheDocument()
  })

  it('prefills whatsapp from phone', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue({})
    renderWithProviders(<ClientForm onSubmit={onSubmit} />)

    const same = screen.getByLabelText('Même numéro que le téléphone')
    expect(same).toBeChecked()
    await fillRequired(user)
    expect(screen.getAllByLabelText('WhatsApp')[0]).toHaveValue('0612345678')

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].whatsapp).toBe('0612345678')
  })

  it('blocks submit and shows required errors', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithProviders(<ClientForm onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getAllByText('Champ obligatoire')).toHaveLength(4)
  })

  it('maps server field errors under fields', async () => {
    const user = userEvent.setup()
    const error = Object.assign(new Error('Request validation failed'), {
      status: 422,
      details: [{ field: 'body.cin', message: 'Format CIN invalide (ex. AB123456)' }],
    })
    const onSubmit = vi.fn().mockRejectedValue(error)
    renderWithProviders(<ClientForm onSubmit={onSubmit} />)

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Format CIN invalide (ex. AB123456)')).toBeInTheDocument()
  })

  it('shows non-blocking duplicate warning with link', async () => {
    const user = userEvent.setup()
    apiGet.mockResolvedValue([{ id: 7, name: 'Fatima Benali' }])
    renderWithProviders(<ClientForm onSubmit={vi.fn()} excludeId={3} />)

    await user.type(screen.getByLabelText('CIN'), 'ab 123456')
    await user.tab()

    const link = await screen.findByRole('link', { name: 'Fatima Benali' })
    expect(link).toHaveAttribute('href', '/app/clients/7')
    expect(apiGet).toHaveBeenCalledWith(
      '/api/clients/duplicates?cin=AB123456&exclude_id=3'
    )
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  })

  it('legacy client opens in edit form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithProviders(
      <ClientForm initialValues={{ name: 'Benali', last_name: 'Benali', phone: '+212612345678' }} onSubmit={onSubmit} />
    )

    expect(screen.getByLabelText('Nom *')).toHaveValue('Benali')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getAllByText('Champ obligatoire')).toHaveLength(2) // Prénom + Canal
  })
})
