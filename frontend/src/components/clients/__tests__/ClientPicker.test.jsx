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

const MANY = Array.from({ length: 60 }, (_, i) => ({ id: 100 + i, name: `Client ${String(i).padStart(2, '0')}`, cin: null, phone: null }))

describe('ClientPicker', () => {
  it('keeps the list hidden initially', () => {
    const { input } = setup()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens on focus', async () => {
    const { user, input } = setup()
    await user.click(input)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens on typing', async () => {
    const { user, input } = setup()
    input.focus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.type(input, 'k')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('toggles with the chevron button', async () => {
    const { user, input } = setup()
    const chevron = screen.getByRole('button', { name: 'Afficher les clients' })
    await user.click(chevron)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await user.click(chevron)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape', async () => {
    const { user, input } = setup()
    await user.click(input)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on outside click', async () => {
    const { user, input } = setup()
    await user.click(input)
    await user.click(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes after selection', async () => {
    const { user, input } = setup({ value: null })
    await user.type(input, 'fatima')
    await user.click(screen.getByRole('option', { name: /Fatima Benali/ }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('selects with ArrowDown and Enter', async () => {
    const { user, input, onChange } = setup()
    await user.click(input)
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(CLIENTS[1])
  })

  it('opens with ArrowDown when closed and moves back with ArrowUp', async () => {
    const { user, input, onChange } = setup()
    await user.click(input)
    await user.keyboard('{Escape}')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    expect(onChange).toHaveBeenCalledWith(CLIENTS[0])
  })

  it('exposes the active option through aria-activedescendant', async () => {
    const { user, input } = setup()
    await user.click(input)
    await user.keyboard('{ArrowDown}')
    const active = screen.getAllByRole('option')[0]
    expect(input).toHaveAttribute('aria-activedescendant', active.id)
    expect(active).toHaveAttribute('aria-selected', 'true')
  })

  it('shows name, phone and CIN in an option', async () => {
    const { user, input } = setup()
    await user.click(input)
    const opt = screen.getByRole('option', { name: /Fatima Benali/ })
    expect(opt).toHaveTextContent('Fatima Benali')
    expect(opt).toHaveTextContent('+212612345678 · CIN AB123456')
    expect(screen.getByText('3 clients')).toBeInTheDocument()
  })

  it('caps the list at 50 with a refine note', async () => {
    const { user, input } = setup({ clients: MANY })
    await user.click(input)
    expect(screen.getAllByRole('option')).toHaveLength(50)
    expect(screen.getByText('Affinez la recherche pour voir plus de clients…')).toBeInTheDocument()
  })

  it('keeps the empty message outside the options', async () => {
    const { user, input } = setup()
    await user.type(input, 'zzz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

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
