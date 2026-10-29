import { formatMad, formatPrice } from '../formatters'

describe('formatMad (same format as the backend format_mad)', () => {
  it('groups thousands with a regular space and adds MAD', () => {
    expect(formatMad(400000)).toBe('400 000 MAD')
    expect(formatMad(0)).toBe('0 MAD')
  })

  it('shows 2 decimals with a comma only when the cents are not zero', () => {
    expect(formatMad(116666.67)).toBe('116 666,67 MAD')
    expect(formatMad(0.4)).toBe('0,40 MAD')
    expect(formatMad(50000.5)).toBe('50 000,50 MAD')
  })

  it('rounds to the cent and accepts numeric strings', () => {
    expect(formatMad(100000.004)).toBe('100 000 MAD')
    expect(formatMad('1234.5')).toBe('1 234,50 MAD')
  })

  it('shows a dash for a missing amount', () => {
    expect(formatMad(null)).toBe('—')
    expect(formatMad(undefined)).toBe('—')
  })

  it('leaves formatPrice unchanged for the other screens', () => {
    expect(formatPrice(400000)).toBe('400.000 MAD')
  })
})
