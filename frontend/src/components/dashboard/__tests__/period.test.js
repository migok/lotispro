import {
  PERIOD_SHORTCUTS,
  PERIOD_STORAGE_KEY,
  bucketLabel,
  formatIsoDate,
  formatPeriodLabel,
  formatVariation,
  loadPeriod,
  matchingShortcut,
  periodParams,
  savePeriod,
  shortcutRange,
} from '../period'

// Thursday 30 October 2026, local time.
const TODAY = new Date(2026, 9, 30, 15, 45)

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('shortcutRange', () => {
  it.each([
    ['today', '2026-10-30', '2026-10-30'],
    ['week', '2026-10-26', '2026-11-01'],
    ['month', '2026-10-01', '2026-10-31'],
    ['quarter', '2026-10-01', '2026-12-31'],
    ['year', '2026-01-01', '2026-12-31'],
  ])('%s covers the full calendar period', (key, dateFrom, dateTo) => {
    expect(shortcutRange(key, TODAY)).toEqual({ dateFrom, dateTo })
  })

  it('starts the week on Monday when today is a Sunday', () => {
    expect(shortcutRange('week', new Date(2026, 10, 1))).toEqual({ dateFrom: '2026-10-26', dateTo: '2026-11-01' })
  })

  it('handles February of a leap year and the first quarter', () => {
    expect(shortcutRange('month', new Date(2028, 1, 10))).toEqual({ dateFrom: '2028-02-01', dateTo: '2028-02-29' })
    expect(shortcutRange('quarter', new Date(2026, 1, 10))).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-03-31' })
  })

  it('has one shortcut per key, in order', () => {
    expect(PERIOD_SHORTCUTS.map((s) => s.key)).toEqual(['today', 'week', 'month', 'quarter', 'year'])
    expect(PERIOD_SHORTCUTS.map((s) => s.label)).toEqual([
      "Aujourd'hui", 'Cette semaine', 'Ce mois', 'Ce trimestre', 'Cette année',
    ])
  })
})

describe('matchingShortcut', () => {
  it('returns the key of the shortcut equal to the period, else null', () => {
    expect(matchingShortcut({ dateFrom: '2026-10-01', dateTo: '2026-12-31' }, TODAY)).toBe('quarter')
    expect(matchingShortcut({ dateFrom: '2026-10-02', dateTo: '2026-10-31' }, TODAY)).toBeNull()
  })
})

describe('loadPeriod / savePeriod', () => {
  const MONTH = { dateFrom: '2026-10-01', dateTo: '2026-10-31' }

  it('loadPeriod falls back to the current month when nothing is stored', () => {
    expect(loadPeriod(TODAY)).toEqual(MONTH)
  })

  it('loadPeriod falls back to the current month when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadPeriod(TODAY)).toEqual(MONTH)
  })

  it('loadPeriod falls back to the current month when the stored value is not JSON', () => {
    sessionStorage.setItem(PERIOD_STORAGE_KEY, '{')
    expect(loadPeriod(TODAY)).toEqual(MONTH)
  })

  it('loadPeriod falls back to the current month when the stored range is inverted', () => {
    sessionStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify({ dateFrom: '2026-10-31', dateTo: '2026-10-01' }))
    expect(loadPeriod(TODAY)).toEqual(MONTH)
  })

  it('loadPeriod falls back to the current month when a stored date is invalid', () => {
    sessionStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify({ dateFrom: '2026-02-30', dateTo: '2026-03-01' }))
    expect(loadPeriod(TODAY)).toEqual(MONTH)
    sessionStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify(null))
    expect(loadPeriod(TODAY)).toEqual(MONTH)
  })

  it('round-trips a saved period', () => {
    const period = { dateFrom: '2026-07-01', dateTo: '2026-09-30' }
    savePeriod(period)
    expect(loadPeriod(TODAY)).toEqual(period)
  })

  it('savePeriod swallows storage exceptions', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => savePeriod({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })).not.toThrow()
  })
})

describe('formatting', () => {
  it('formats ISO dates as dd/mm/yyyy without time-zone drift', () => {
    expect(formatIsoDate('2026-10-01')).toBe('01/10/2026')
  })

  it('formats the active period label', () => {
    expect(formatPeriodLabel({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })).toBe(
      'Période : du 01/10/2026 au 31/10/2026',
    )
  })

  it('builds the date_from / date_to query params', () => {
    const params = periodParams({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    expect(params.toString()).toBe('date_from=2026-10-01&date_to=2026-10-31')
  })

  it.each([
    [12.5, '▲ 12,5 %', 'up'],
    [100, '▲ 100 %', 'up'],
    [-3, '▼ 3 %', 'down'],
    [1234.5, '▲ 1 234,5 %', 'up'],
    [0, '= 0 %', 'flat'],
    [null, '—', null],
    [undefined, '—', null],
  ])('formatVariation(%s) → %s', (value, text, trend) => {
    expect(formatVariation(value)).toEqual({ text, trend })
  })

  it.each([
    ['2026-10-05', '05/10'],
    ['2026-W41', 'S41'],
    ['2026-W02', 'S2'],
    ['2026-10', 'Oct 2026'],
  ])('bucketLabel(%s) → %s', (key, label) => {
    expect(bucketLabel(key)).toBe(label)
  })
})
