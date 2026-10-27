import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClientPicker from '../ClientPicker'

const CLIENTS = [
  { id: 1, name: 'Fatima Benali', cin: 'AB123456', phone: '+212612345678' },
  { id: 2, name: 'Karim Alaoui', cin: 'CD987654', phone: '0661000000' },
  { id: 3, name: 'Sans Papiers', cin: null, phone: null },
]

function setup(props = {}) {
  const onChange = vi.fn()
  render(<ClientPicker clients={CLIENTS} value={null} onChange={onChange} {...props} />)
  return { onChange, user: userEvent.setup(), get input() { return screen.getByRole('combobox') } }
}

describe('ClientPicker', () => {
  it('filters by name, ignoring case', async () => {
    const { user, input } = setup()
    await user.type(input, 'karim')

    expect(screen.getByRole('option', { name: /Karim Alaoui/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Fatima/ })).not.toBeInTheDocument()
  })

  it('filters by CIN despite spaces and case', async () => {
    const { user, input } = setup()
    await user.type(input, 'ab 123456')

    expect(screen.getByRole('option', { name: /Fatima Benali/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Karim/ })).not.toBeInTheDocument()
  })

  it('filters by phone, matching 0612… against +212612…', async () => {
    const { user, input } = setup()
    await user.type(input, '0612345678')

    expect(screen.getByRole('option', { name: /Fatima Benali/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Karim/ })).not.toBeInTheDocument()
  })

  it('also matches a +212 query against a local number', async () => {
    const { user, input } = setup()
    await user.type(input, '+212 661-000-000')

    expect(screen.getByRole('option', { name: /Karim Alaoui/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Fatima/ })).not.toBeInTheDocument()
  })

  it('shows an empty message when nothing matches', async () => {
    const { user, input } = setup()
    await user.type(input, 'zzz')

    expect(screen.getByText('Aucun client trouvé')).toBeInTheDocument()
  })

  it('calls onChange with the chosen client', async () => {
    const { user, input, onChange } = setup()
    await user.type(input, 'fatima')
    await user.click(screen.getByRole('option', { name: /Fatima Benali/ }))

    expect(onChange).toHaveBeenCalledWith(CLIENTS[0])
  })

  it('shows the selected client and lets the user change it', async () => {
    const { user, onChange } = setup({ value: CLIENTS[0] })

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText(/Fatima Benali/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Changer' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
