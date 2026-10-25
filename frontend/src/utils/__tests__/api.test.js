import { apiPost, buildApiError } from '../api'

describe('buildApiError', () => {
  it('carries status and details', () => {
    const error = buildApiError({ message: 'Bad', details: [{ field: 'cin', message: 'KO' }] }, 422)
    expect(error).toBeInstanceOf(Error)
    expect(error.status).toBe(422)
    expect(error.details).toEqual([{ field: 'cin', message: 'KO' }])
    expect(error.message).toBe('Bad')
  })

  it('prefers detail, then message, then a generic message', () => {
    expect(buildApiError({ detail: 'D', message: 'M' }, 400).message).toBe('D')
    expect(buildApiError({ message: 'M' }, 400).message).toBe('M')
    expect(buildApiError({}, 500).message).toBe('Erreur 500')
    expect(buildApiError(null, 500).message).toBe('Erreur 500')
  })

  it('defaults details to [] when absent or not an array', () => {
    expect(buildApiError({ message: 'M' }, 400).details).toEqual([])
    expect(buildApiError({ details: 'oops' }, 400).details).toEqual([])
  })
})

describe('apiPost error path (mocked fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects with status, details and the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 422,
          json: () =>
            Promise.resolve({
              message: 'Request validation failed',
              details: [{ field: 'body.email', message: 'Adresse email invalide' }],
            }),
        })
      )
    )

    await expect(apiPost('/api/clients', {})).rejects.toMatchObject({
      status: 422,
      message: 'Request validation failed',
      details: [{ field: 'body.email', message: 'Adresse email invalide' }],
    })
  })
})
