import { EMPTY_FILTERS, NO_TYPE, applyLotsFilters, countActiveFilters, normalizeTypeLot } from '../lotsFilters'

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
