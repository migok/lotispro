import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import LotsTab from '../LotsTab'

vi.mock('../../LotDetailModal', () => ({
  default: ({ lot, onClose, onRefresh }) => (
    <div role="dialog">
      <p>Lot {lot.numero}</p>
      <button type="button" onClick={onRefresh}>refresh</button>
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}))

const feature = (db_id, lot_id, status, type_lot) => ({
  type: 'Feature',
  geometry: null,
  properties: { db_id, lot_id, status, type_lot, Shape_Area: 100, price: 300000 },
})

const MATRIX = {
  statuses: ['available', 'option', 'blocked'],
  rows: [
    { type_lot: 'Villa', counts: { available: 2, option: 1, blocked: 0 }, total: 3 },
    { type_lot: null, counts: { available: 1, option: 0, blocked: 0 }, total: 1 },
  ],
  totals: { available: 3, option: 1, blocked: 0 },
  grand_total: 4,
}

const GEOJSON = {
  type: 'FeatureCollection',
  features: [
    feature(1, 'LOT-1', 'available', 'Villa'),
    feature(2, 'LOT-2', 'available', ' Villa '),
    feature(3, 'LOT-10', 'option', 'Villa'),
    feature(4, 'LOT-3', 'available', null),
  ],
}

// LOT-2 moved to « option » after a transition made from the modal.
const MATRIX_AFTER = {
  ...MATRIX,
  rows: [
    { type_lot: 'Villa', counts: { available: 1, option: 2, blocked: 0 }, total: 3 },
    MATRIX.rows[1],
  ],
  totals: { available: 2, option: 2, blocked: 0 },
}
const GEOJSON_AFTER = {
  ...GEOJSON,
  features: GEOJSON.features.map((f) => (f.properties.db_id === 2 ? feature(2, 'LOT-2', 'option', ' Villa ') : f)),
}

const respond = ({ status = 200, body }) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })

function mockApi(state) {
  const fetchMock = vi.fn((url) => {
    if (String(url).includes('/lots-matrix')) return respond(state.matrix)
    if (String(url).includes('/lots.geojson')) return respond(state.lots)
    return respond({ status: 404, body: { message: 'Not found' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const renderTab = (projectId = 7, props = {}) =>
  renderWithProviders(<LotsTab projectId={projectId} enabledOptional={['option']} {...props} />, { user: { id: 1, role: 'manager' } })

const listedNumbers = () => {
  const list = screen.getByRole('table', { name: 'Liste des lots' })
  return within(list).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)
}

describe('LotsTab', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the grid and all lots', async () => {
    const fetchMock = mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    renderTab()

    expect(await screen.findByRole('table', { name: 'Lots par type et statut' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tous les lots — 4 lots' })).toBeInTheDocument()
    expect(listedNumbers()).toEqual(['LOT-1', 'LOT-2', 'LOT-3', 'LOT-10'])
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.some((u) => /\/api\/projects\/7\/lots-matrix$/.test(u))).toBe(true)
    expect(urls.some((u) => /\/api\/projects\/7\/lots\.geojson$/.test(u))).toBe(true)
  })

  it('filters the list when a cell is clicked', async () => {
    mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    const user = userEvent.setup()
    renderTab()

    await user.click(await screen.findByRole('button', { name: 'Villa — Disponible : 2 lots' }))

    expect(screen.getByRole('heading', { name: 'Villa · Disponible — 2 lots' })).toBeInTheDocument()
    expect(listedNumbers()).toEqual(['LOT-1', 'LOT-2'])
  })

  it('opens the lot detail and returns to the same filtered list', async () => {
    mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    const user = userEvent.setup()
    renderTab()

    await user.click(await screen.findByRole('button', { name: 'Villa — Disponible : 2 lots' }))
    await user.click(screen.getByText('LOT-2'))

    expect(within(screen.getByRole('dialog')).getByText('Lot LOT-2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Villa · Disponible — 2 lots' })).toBeInTheDocument()
    expect(listedNumbers()).toEqual(['LOT-1', 'LOT-2'])
  })

  it('opens the lot detail from the keyboard', async () => {
    mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    const user = userEvent.setup()
    renderTab()

    const row = (await screen.findByText('LOT-3')).closest('tr')
    row.focus()
    await user.keyboard('{Enter}')

    expect(within(screen.getByRole('dialog')).getByText('Lot LOT-3')).toBeInTheDocument()
  })

  it('refreshes grid and list after a transition and keeps the filter', async () => {
    const state = { matrix: { body: MATRIX }, lots: { body: GEOJSON } }
    mockApi(state)
    const user = userEvent.setup()
    renderTab()

    await user.click(await screen.findByRole('button', { name: 'Villa — Disponible : 2 lots' }))
    await user.click(screen.getByText('LOT-2'))

    state.matrix = { body: MATRIX_AFTER }
    state.lots = { body: GEOJSON_AFTER }
    await user.click(screen.getByRole('button', { name: 'refresh' }))

    expect(await screen.findByRole('button', { name: 'Villa — Disponible : 1 lot' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Villa · Disponible — 1 lot' })).toBeInTheDocument()
    expect(listedNumbers()).toEqual(['LOT-1'])

    await user.click(screen.getByRole('button', { name: 'close' }))
    expect(screen.getByRole('button', { name: 'Villa — Disponible : 1 lot' })).toHaveAttribute('aria-pressed', 'true')
    expect(listedNumbers()).toEqual(['LOT-1'])
  })

  it('tells the parent when a transition changed the lots', async () => {
    const state = { matrix: { body: MATRIX }, lots: { body: GEOJSON } }
    mockApi(state)
    const onLotsChanged = vi.fn()
    const user = userEvent.setup()
    renderTab(7, { onLotsChanged })

    await user.click(await screen.findByText('LOT-2'))
    expect(onLotsChanged).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'refresh' }))

    expect(onLotsChanged).toHaveBeenCalledTimes(1)
  })

  it('refreshes without an onLotsChanged callback', async () => {
    const state = { matrix: { body: MATRIX }, lots: { body: GEOJSON } }
    mockApi(state)
    const user = userEvent.setup()
    renderTab()

    await user.click(await screen.findByText('LOT-2'))
    state.matrix = { body: MATRIX_AFTER }
    await user.click(screen.getByRole('button', { name: 'refresh' }))

    expect(await screen.findByRole('button', { name: 'Villa — Disponible : 1 lot' })).toBeInTheDocument()
  })

  it('shows an error when the matrix fails to load', async () => {
    mockApi({
      matrix: { status: 403, body: { message: "Vous n'avez pas accès à ce projet." } },
      lots: { body: GEOJSON },
    })
    renderTab()

    expect(await screen.findByRole('alert')).toHaveTextContent("Vous n'avez pas accès à ce projet.")
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows a generic error when the API gives no message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error(''))))
    renderTab()

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les lots du projet.')
  })

  it('shows an error when the lots fail to load', async () => {
    mockApi({
      matrix: { body: MATRIX },
      lots: { status: 403, body: { message: "Vous n'avez pas accès à ce projet." } },
    })
    renderTab()

    expect(await screen.findByRole('alert')).toHaveTextContent("Vous n'avez pas accès à ce projet.")
  })

  it('says when the project has no lot', async () => {
    mockApi({
      matrix: { body: { statuses: ['available'], rows: [], totals: { available: 0 }, grand_total: 0 } },
      lots: { body: { type: 'FeatureCollection', features: [] } },
    })
    renderTab()

    expect(await screen.findByText('Aucun lot dans ce projet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says when no lot matches the filters', async () => {
    // Grid and list disagree (lot deleted between the two requests): the list must not look broken.
    mockApi({ matrix: { body: MATRIX }, lots: { body: { ...GEOJSON, features: [] } } })
    const user = userEvent.setup()
    renderTab()

    await user.click(await screen.findByRole('button', { name: 'Total — Option : 1 lot' }))

    expect(screen.getByText('Aucun lot ne correspond aux filtres.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Option — 0 lot' })).toBeInTheDocument()
  })
})

describe('LotsTab filters', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const setup = async () => {
    const fetchMock = mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    const user = userEvent.setup()
    const view = renderTab()
    await screen.findByRole('table', { name: 'Lots par type et statut' })
    return { fetchMock, user, view }
  }

  const badge = () => screen.queryByText(/^\d+ filtres?$/)

  it('shows the bar with no active filter', async () => {
    await setup()

    expect(screen.getByRole('checkbox', { name: 'Disponible' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Option' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Bloqué' })).not.toBeChecked()
    const select = screen.getByRole('combobox', { name: 'Type de lot' })
    expect(select).toHaveValue('')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tous les types', 'Villa', 'Non renseigné'])
    expect(screen.getByRole('searchbox', { name: 'Rechercher un numéro' })).toHaveValue('')
    expect(badge()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled()
  })

  it('combines several statuses and a type', async () => {
    const { user } = await setup()

    await user.click(screen.getByRole('checkbox', { name: 'Disponible' }))
    await user.click(screen.getByRole('checkbox', { name: 'Option' }))

    expect(listedNumbers()).toEqual(['LOT-1', 'LOT-2', 'LOT-3', 'LOT-10'])
    expect(screen.getByText('1 filtre')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Type de lot' }), 'Villa')

    expect(listedNumbers()).toEqual(['LOT-1', 'LOT-2', 'LOT-10'])
    expect(screen.getByText('2 filtres')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Disponible' }))
    expect(listedNumbers()).toEqual(['LOT-10'])
  })

  it('filters on the « Non renseigné » type', async () => {
    const { user } = await setup()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Type de lot' }), 'Non renseigné')

    expect(listedNumbers()).toEqual(['LOT-3'])
    expect(screen.getByRole('heading', { name: 'Non renseigné — 1 lot' })).toBeInTheDocument()
  })

  it('filters by number instantly without any request', async () => {
    const { fetchMock, user } = await setup()
    const callsBefore = fetchMock.mock.calls.length

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un numéro' }), '1')

    expect(listedNumbers()).toEqual(['LOT-1', 'LOT-10'])
    expect(screen.getByText('1 filtre')).toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsBefore)
  })

  it('resets every filter', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('checkbox', { name: 'Option' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Type de lot' }), 'Villa')
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un numéro' }), '1')
    expect(screen.getByText('3 filtres')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))

    expect(listedNumbers()).toEqual(['LOT-1', 'LOT-2', 'LOT-3', 'LOT-10'])
    expect(badge()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Option' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Type de lot' })).toHaveValue('')
    expect(screen.getByRole('searchbox', { name: 'Rechercher un numéro' })).toHaveValue('')
  })

  it('reflects a grid cell click in the bar', async () => {
    const { user } = await setup()

    await user.click(screen.getByRole('button', { name: 'Villa — Disponible : 2 lots' }))

    expect(screen.getByRole('checkbox', { name: 'Disponible' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Option' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Type de lot' })).toHaveValue('Villa')
    expect(screen.getByText('2 filtres')).toBeInTheDocument()
  })

  it('keeps the search when a grid cell is clicked', async () => {
    const { user } = await setup()
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un numéro' }), '2')

    await user.click(screen.getByRole('button', { name: 'Villa — Disponible : 2 lots' }))

    expect(screen.getByRole('searchbox', { name: 'Rechercher un numéro' })).toHaveValue('2')
    expect(listedNumbers()).toEqual(['LOT-2'])
  })

  it('ignores corrupt or unknown persisted filters', async () => {
    sessionStorage.setItem('lotsFilters:7', JSON.stringify({ statuses: ['nope'], typeLot: 3, search: 12 }))
    mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    renderTab()

    expect(await screen.findByRole('heading', { name: 'Tous les lots — 4 lots' })).toBeInTheDocument()
    expect(badge()).not.toBeInTheDocument()
  })

  it('keeps « Non renseigné » selected when the grid has no untyped row', async () => {
    sessionStorage.setItem('lotsFilters:7', JSON.stringify({ statuses: [], typeLot: '__none__', search: '' }))
    const matrix = { ...MATRIX, rows: [MATRIX.rows[0]], grand_total: 3 }
    mockApi({ matrix: { body: matrix }, lots: { body: GEOJSON } })
    renderTab()

    await screen.findByRole('table', { name: 'Lots par type et statut' })
    expect(screen.getByRole('combobox', { name: /type/i })).toHaveDisplayValue('Non renseigné')
  })

  it('ignores unparsable persisted filters', async () => {
    sessionStorage.setItem('lotsFilters:7', '{oops')
    mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    renderTab()

    expect(await screen.findByRole('heading', { name: 'Tous les lots — 4 lots' })).toBeInTheDocument()
  })

  it('restores the filters of a project after a remount', async () => {
    mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    const user = userEvent.setup()
    const first = renderTab(7)
    await user.click(await screen.findByRole('checkbox', { name: 'Option' }))
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un numéro' }), '1')
    first.unmount()

    renderTab(7)
    expect(await screen.findByRole('checkbox', { name: 'Option' })).toBeChecked()
    expect(screen.getByRole('searchbox', { name: 'Rechercher un numéro' })).toHaveValue('1')
    expect(listedNumbers()).toEqual(['LOT-10'])
    expect(screen.getByText('2 filtres')).toBeInTheDocument()
  })

  it('starts another project without filter', async () => {
    sessionStorage.setItem('lotsFilters:7', JSON.stringify({ statuses: ['option'], typeLot: null, search: '' }))
    mockApi({ matrix: { body: MATRIX }, lots: { body: GEOJSON } })
    renderTab(8)

    expect(await screen.findByRole('heading', { name: 'Tous les lots — 4 lots' })).toBeInTheDocument()
    expect(badge()).not.toBeInTheDocument()
  })

  it('keeps working when the storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const { user } = await setup()

    await user.click(screen.getByRole('checkbox', { name: 'Option' }))

    expect(listedNumbers()).toEqual(['LOT-10'])
  })
})
