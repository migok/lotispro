import { act, renderHook, waitFor } from '@testing-library/react'
import { apiGet } from '../../../utils/api'
import usePeriodData from '../usePeriodData'

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn() }))

const OCTOBER = { dateFrom: '2026-10-01', dateTo: '2026-10-31' }
const QUARTER = { dateFrom: '2026-10-01', dateTo: '2026-12-31' }

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Routes apiGet by URL to a deferred promise, so tests control the resolution order. */
function controlledApi() {
  const pending = new Map()
  apiGet.mockImplementation((url) => {
    const d = deferred()
    pending.set(url, d)
    return d.promise
  })
  return pending
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('usePeriodData', () => {
  it('fetches stats and performance in parallel with the period, project and user', async () => {
    const pending = controlledApi()
    const { result } = renderHook(() => usePeriodData({ projectId: 7, userId: 3, period: OCTOBER }))

    expect(result.current.loading).toBe(true)
    const query = 'date_from=2026-10-01&date_to=2026-10-31&project_id=7&user_id=3'
    expect([...pending.keys()]).toEqual([
      `/api/dashboard/stats?${query}`,
      `/api/dashboard/performance?${query}`,
    ])

    await act(async () => {
      pending.get(`/api/dashboard/stats?${query}`).resolve({ flow: { lots_vendus: 1 } })
      pending.get(`/api/dashboard/performance?${query}`).resolve({ series: [] })
    })

    expect(result.current).toEqual({
      stats: { flow: { lots_vendus: 1 } },
      performance: { series: [] },
      loading: false,
      error: null,
    })
  })

  it('omits project_id and user_id when they are not set', () => {
    const pending = controlledApi()
    renderHook(() => usePeriodData({ projectId: null, userId: null, period: OCTOBER }))
    expect([...pending.keys()][0]).toBe('/api/dashboard/stats?date_from=2026-10-01&date_to=2026-10-31')
  })

  it('ignores a stale response after a newer period', async () => {
    const pending = controlledApi()
    const { result, rerender } = renderHook(
      ({ period }) => usePeriodData({ projectId: 7, userId: null, period }),
      { initialProps: { period: OCTOBER } },
    )
    const first = 'date_from=2026-10-01&date_to=2026-10-31&project_id=7'
    const second = 'date_from=2026-10-01&date_to=2026-12-31&project_id=7'

    rerender({ period: QUARTER })
    expect(result.current.loading).toBe(true)

    // The newer request answers first...
    await act(async () => {
      pending.get(`/api/dashboard/stats?${second}`).resolve({ id: 'quarter' })
      pending.get(`/api/dashboard/performance?${second}`).resolve({ id: 'quarter-perf' })
    })
    expect(result.current.stats).toEqual({ id: 'quarter' })
    expect(result.current.loading).toBe(false)

    // ...then the superseded one: it must not overwrite the newer data.
    await act(async () => {
      pending.get(`/api/dashboard/stats?${first}`).resolve({ id: 'october' })
      pending.get(`/api/dashboard/performance?${first}`).resolve({ id: 'october-perf' })
    })
    expect(result.current.stats).toEqual({ id: 'quarter' })
    expect(result.current.performance).toEqual({ id: 'quarter-perf' })
  })

  it('exposes the API error message', async () => {
    apiGet.mockRejectedValue(new Error('La date de début doit être antérieure ou égale à la date de fin.'))
    const { result } = renderHook(() => usePeriodData({ projectId: 7, userId: null, period: OCTOBER }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('La date de début doit être antérieure ou égale à la date de fin.')
    expect(result.current.stats).toBeNull()
  })
})
