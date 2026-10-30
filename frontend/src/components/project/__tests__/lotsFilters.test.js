import {
  EMPTY_FILTERS, NO_TYPE, applyLotsFilters, countActiveFilters, filtersStorageKey, loadFilters, normalizeTypeLot, saveFilters,
} from '../lotsFilters'

const lot = (numero, status = 'available', type_lot = null) => ({ numero, status, type_lot })
const numeros = (lots) => lots.map((l) => l.numero)

describe('normalizeTypeLot', () => {
  it('trims and maps blank values to null', () => {
    expect(normalizeTypeLot(' Villa ')).toBe('Villa')
    expect(normalizeTypeLot('   ')).toBeNull()
    expect(normalizeTypeLot('')).toBeNull()
    expect(normalizeTypeLot(null)).toBeNull()
    expect(normalizeTypeLot(undefined)).toBeNull()
  })
})

describe('applyLotsFilters', () => {
  it('keeps every lot with empty filters', () => {
    const lots = [lot('A'), lot('B', 'option')]
    expect(numeros(applyLotsFilters(lots, EMPTY_FILTERS))).toEqual(['A', 'B'])
  })

  it('keeps the lots of any selected status', () => {
    const lots = [lot('A', 'available'), lot('B', 'option'), lot('C', 'blocked')]
    const result = applyLotsFilters(lots, { ...EMPTY_FILTERS, statuses: ['available', 'option'] })
    expect(numeros(result)).toEqual(['A', 'B'])
  })

  it('matches a type after trimming', () => {
    const lots = [lot('A', 'available', 'Villa'), lot('B', 'available', ' Villa '), lot('C', 'available', 'Appartement'), lot('D')]
    const result = applyLotsFilters(lots, { ...EMPTY_FILTERS, typeLot: 'Villa' })
    expect(numeros(result)).toEqual(['A', 'B'])
  })

  it('NO_TYPE keeps the lots without a type', () => {
    const lots = [lot('A', 'available', null), lot('B', 'available', ''), lot('C', 'available', '  '), lot('D', 'available', 'Villa')]
    const result = applyLotsFilters(lots, { ...EMPTY_FILTERS, typeLot: NO_TYPE })
    expect(numeros(result)).toEqual(['A', 'B', 'C'])
  })

  it('searches the number case-insensitively after trimming', () => {
    const lots = [lot('LOT-1'), lot('LOT-10'), lot('LOT-2')]
    const result = applyLotsFilters(lots, { ...EMPTY_FILTERS, search: ' lot-1 ' })
    expect(numeros(result)).toEqual(['LOT-1', 'LOT-10'])
  })

  it('sorts by number in natural order', () => {
    const lots = [lot('LOT-10'), lot('LOT-2'), lot('LOT-1')]
    expect(numeros(applyLotsFilters(lots, EMPTY_FILTERS))).toEqual(['LOT-1', 'LOT-2', 'LOT-10'])
  })

  it('does not mutate the given list', () => {
    const lots = [lot('LOT-10'), lot('LOT-2')]
    applyLotsFilters(lots, EMPTY_FILTERS)
    expect(numeros(lots)).toEqual(['LOT-10', 'LOT-2'])
  })
})

describe('countActiveFilters', () => {
  it('counts the active dimensions', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0)
    expect(countActiveFilters({ statuses: ['a', 'b'], typeLot: 'Villa', search: 'x' })).toBe(3)
    expect(countActiveFilters({ statuses: [], typeLot: NO_TYPE, search: '   ' })).toBe(1)
  })
})

describe('filters persistence', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('uses one storage key per project', () => {
    expect(filtersStorageKey(7)).toBe('lotsFilters:7')
  })

  it('returns empty filters when nothing is stored', () => {
    expect(loadFilters(7)).toEqual(EMPTY_FILTERS)
  })

  it('round-trips saved filters under the project key', () => {
    const filters = { statuses: ['available', 'option'], typeLot: NO_TYPE, search: '12' }
    saveFilters(7, filters)

    expect(sessionStorage.getItem('lotsFilters:7')).not.toBeNull()
    expect(loadFilters(7)).toEqual(filters)
    expect(loadFilters(8)).toEqual(EMPTY_FILTERS)
  })

  it('returns a fresh object, never the shared EMPTY_FILTERS', () => {
    const loaded = loadFilters(7)
    expect(loaded).not.toBe(EMPTY_FILTERS)
    expect(loaded.statuses).not.toBe(EMPTY_FILTERS.statuses)
  })

  it('ignores invalid JSON', () => {
    sessionStorage.setItem('lotsFilters:7', '{oops')
    expect(loadFilters(7)).toEqual(EMPTY_FILTERS)
  })

  it.each(['null', '3', '"text"', '[]'])('ignores a non-object value (%s)', (raw) => {
    sessionStorage.setItem('lotsFilters:7', raw)
    expect(loadFilters(7)).toEqual(EMPTY_FILTERS)
  })

  it('drops unknown statuses, duplicates and a non-string type', () => {
    sessionStorage.setItem(
      'lotsFilters:7',
      JSON.stringify({ statuses: ['available', 'nope', 'available', 4, 'option'], typeLot: 3 }),
    )
    expect(loadFilters(7)).toEqual({ statuses: ['available', 'option'], typeLot: null, search: '' })
  })

  it('ignores a non-array statuses and a non-string search', () => {
    sessionStorage.setItem('lotsFilters:7', JSON.stringify({ statuses: 'available', typeLot: 'Villa', search: 12 }))
    expect(loadFilters(7)).toEqual({ statuses: [], typeLot: 'Villa', search: '' })
  })

  it('keeps the « no type » marker', () => {
    sessionStorage.setItem('lotsFilters:7', JSON.stringify({ statuses: [], typeLot: NO_TYPE, search: 'a' }))
    expect(loadFilters(7)).toEqual({ statuses: [], typeLot: NO_TYPE, search: 'a' })
  })

  it('returns empty filters when the storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadFilters(7)).toEqual(EMPTY_FILTERS)
  })

  it('swallows storage errors on save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => saveFilters(7, EMPTY_FILTERS)).not.toThrow()
  })
})
