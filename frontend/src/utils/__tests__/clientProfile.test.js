import {
  acteAddressOf,
  describeAcquisition,
  fieldErrorsFromApi,
  matchesClientSearch,
  normalizeCin,
  normalizePhone,
  shouldToastClientError,
  validateClientForm,
} from '../clientProfile'

describe('normalizePhone', () => {
  it.each([
    ['0612345678', '+212612345678'],
    ['0033612345678', '+33612345678'],
    ['06 12.34-56-78', '+212612345678'],
    ['+212612345678', '+212612345678'],
  ])('normalises %s', (raw, expected) => {
    expect(normalizePhone(raw)).toEqual({ value: expected, error: null })
  })

  it.each(['12345', '+0612345678', 'abc'])('rejects %s', (raw) => {
    const result = normalizePhone(raw)
    expect(result.value).toBeNull()
    expect(result.error).toBe('Numéro invalide (format international, ex. +212612345678)')
  })

  it('treats empty as no value and no error', () => {
    expect(normalizePhone('  ')).toEqual({ value: null, error: null })
  })
})

describe('normalizeCin', () => {
  it('upper-cases and strips spaces', () => {
    expect(normalizeCin('ab 123456')).toEqual({ value: 'AB123456', error: null })
  })

  it('rejects an invalid format with the exact message', () => {
    expect(normalizeCin('123456')).toEqual({
      value: null,
      error: 'Format CIN invalide (ex. AB123456)',
    })
  })

  it('treats empty as no value and no error', () => {
    expect(normalizeCin('')).toEqual({ value: null, error: null })
  })
})

describe('fieldErrorsFromApi', () => {
  it('maps "body.cin" and a bare "cin" to the field name', () => {
    const error = {
      details: [
        { field: 'body.cin', message: 'CIN KO' },
        { field: 'phone', message: 'Tel KO' },
      ],
    }
    expect(fieldErrorsFromApi(error)).toEqual({ cin: 'CIN KO', phone: 'Tel KO' })
  })

  it('returns {} without details', () => {
    expect(fieldErrorsFromApi(new Error('boom'))).toEqual({})
  })
})

describe('validateClientForm', () => {
  const base = {
    last_name: 'Benali',
    first_name: 'Fatima',
    phone: '0612345678',
    acquisition_channel: 'smap',
  }

  it('accepts a valid form', () => {
    expect(validateClientForm(base)).toEqual({})
  })

  it('flags a legacy client (last_name null, only name) as missing the last name', () => {
    const errors = validateClientForm({ ...base, last_name: null, name: 'Ancien Client' })
    expect(errors.last_name).toBe('Champ obligatoire')
  })

  it('requires the acte address only when both addresses are filled', () => {
    const both = { ...base, address_morocco: 'Casa', address_abroad: 'Lyon' }
    expect(validateClientForm(both).acte_address).toBeDefined()
    expect(validateClientForm({ ...both, acte_address: 'abroad' })).toEqual({})
    expect(validateClientForm({ ...base, address_abroad: 'Lyon' })).toEqual({})
  })

  it('requires referrer and date for samsar', () => {
    const errors = validateClientForm({ ...base, acquisition_channel: 'samsar' })
    expect(errors.acquisition_referrer).toBe('Indiquez qui')
    expect(errors.acquisition_date).toBe('Indiquez quand')
  })
})

describe('acteAddressOf', () => {
  it('follows the explicit choice, then the single filled address', () => {
    const both = { address_morocco: 'Casa', address_abroad: 'Lyon' }
    expect(acteAddressOf({ ...both, acte_address: 'abroad' })).toBe('Lyon')
    expect(acteAddressOf({ ...both, acte_address: 'morocco' })).toBe('Casa')
    expect(acteAddressOf({ address_morocco: 'Casa' })).toBe('Casa')
    expect(acteAddressOf({ address_abroad: 'Lyon' })).toBe('Lyon')
    expect(acteAddressOf({})).toBeNull()
  })
})

describe('describeAcquisition / matchesClientSearch', () => {
  it('formats channel, referrer and date', () => {
    expect(
      describeAcquisition({
        acquisition_channel: 'samsar',
        acquisition_referrer: 'Karim',
        acquisition_date: '2026-10-01',
      })
    ).toBe('Samsar — Karim (01/10/2026)')
    expect(describeAcquisition({ acquisition_channel: 'smap' })).toBe('SMAP')
    expect(describeAcquisition({})).toBe('')
  })

  it('searches name parts, contacts, CIN and email', () => {
    const client = { name: 'Fatima Benali', maiden_name: 'Alaoui', email: 'f@exemple.ma' }
    expect(matchesClientSearch(client, 'alaoui')).toBe(true)
    expect(matchesClientSearch(client, '@EXEMPLE')).toBe(true)
    expect(matchesClientSearch(client, 'zzz')).toBe(false)
    expect(matchesClientSearch(client, '')).toBe(true)
  })
})

describe('shouldToastClientError', () => {
  it('toasts when there are no details or none maps to a form field', () => {
    expect(shouldToastClientError(new Error('x'))).toBe(true)
    expect(shouldToastClientError({ details: [{ field: 'body.unknown', message: 'm' }] })).toBe(true)
  })

  it('does not toast when a detail maps to a rendered field', () => {
    expect(shouldToastClientError({ details: [{ field: 'body.cin', message: 'm' }] })).toBe(false)
  })
})
