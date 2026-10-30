import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LotsMatrix from '../LotsMatrix'
import { EMPTY_FILTERS, NO_TYPE } from '../lotsFilters'

const MATRIX = {
  statuses: ['creation', 'available', 'option'],
  rows: [
    { type_lot: 'Villa', counts: { creation: 0, available: 2, option: 1 }, total: 3 },
    { type_lot: null, counts: { creation: 0, available: 1, option: 0 }, total: 1 },
  ],
  totals: { creation: 0, available: 3, option: 1 },
  grand_total: 4,
}

function renderMatrix(filters = EMPTY_FILTERS) {
  const onSelect = vi.fn()
  const view = render(<LotsMatrix matrix={MATRIX} filters={filters} onSelect={onSelect} />)
  return { onSelect, ...view }
}

describe('LotsMatrix', () => {
  it('shows status headers, the « Non renseigné » row and the totals', () => {
    renderMatrix()

    const table = screen.getByRole('table', { name: 'Lots par type et statut' })
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['Type de lot', 'En création', 'Disponible', 'Option', 'Total'])
    expect(within(table).getByRole('rowheader', { name: 'Villa' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'Non renseigné' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Villa — Total : 3 lots' })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: 'Non renseigné — Total : 1 lot' })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Total — Disponible : 3 lots' })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: 'Total — Option : 1 lot' })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Total général : 4 lots' })).toHaveTextContent('4')
  })

  it('selects type and status from a cell', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderMatrix()

    await user.click(screen.getByRole('button', { name: 'Villa — Disponible : 2 lots' }))
    expect(onSelect).toHaveBeenLastCalledWith({ statuses: ['available'], typeLot: 'Villa', search: '' })

    await user.click(screen.getByRole('button', { name: 'Non renseigné — Disponible : 1 lot' }))
    expect(onSelect).toHaveBeenLastCalledWith({ statuses: ['available'], typeLot: NO_TYPE, search: '' })
  })

  it('selects a status from a column total and a type from a row total', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderMatrix()

    await user.click(screen.getByRole('button', { name: 'Total — Option : 1 lot' }))
    expect(onSelect).toHaveBeenLastCalledWith({ statuses: ['option'], typeLot: null, search: '' })

    await user.click(screen.getByRole('button', { name: 'Villa — Total : 3 lots' }))
    expect(onSelect).toHaveBeenLastCalledWith({ statuses: [], typeLot: 'Villa', search: '' })
  })

  it('keeps the search except on the grand total, which resets everything', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderMatrix({ statuses: ['option'], typeLot: 'Villa', search: '12' })

    await user.click(screen.getByRole('button', { name: 'Villa — Disponible : 2 lots' }))
    expect(onSelect).toHaveBeenLastCalledWith({ statuses: ['available'], typeLot: 'Villa', search: '12' })

    await user.click(screen.getByRole('button', { name: 'Total général : 4 lots' }))
    expect(onSelect).toHaveBeenLastCalledWith(EMPTY_FILTERS)
  })

  it('does not make zero counts clickable', () => {
    renderMatrix()

    expect(screen.queryByRole('button', { name: /En création/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Non renseigné — Option/ })).not.toBeInTheDocument()
  })

  it('highlights the selected cell', () => {
    renderMatrix({ statuses: ['available'], typeLot: 'Villa', search: '' })

    expect(screen.getByRole('button', { name: 'Villa — Disponible : 2 lots' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Total — Disponible : 3 lots' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('wraps the table in a horizontal scroll container', () => {
    const { container } = renderMatrix()

    const scroll = container.querySelector('.lots-matrix-scroll')
    expect(scroll).not.toBeNull()
    expect(scroll).toContainElement(screen.getByRole('table'))
  })
})
