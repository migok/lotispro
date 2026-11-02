import { apiFetch } from '../../../utils/api'
import { exportDashboard } from '../exportDashboard'

vi.mock('../../../utils/api', async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}))

const OCTOBER = { dateFrom: '2026-10-01', dateTo: '2026-10-31' }

function okResponse(headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    blob: async () => new Blob(['xlsx']),
  }
}

let downloads

beforeEach(() => {
  downloads = []
  URL.createObjectURL = vi.fn(() => 'blob:export')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    downloads.push({ href: this.href, download: this.download })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('exportDashboard', () => {
  it('requests the export with the period, project and user and uses the header filename', async () => {
    apiFetch.mockResolvedValue(okResponse({
      'Content-Disposition': 'attachment; filename="dashboard_al-amal_2026-10-01_2026-10-31.xlsx"',
    }))

    await exportDashboard({ projectId: 7, userId: 3, period: OCTOBER })

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/dashboard/export?date_from=2026-10-01&date_to=2026-10-31&project_id=7&user_id=3',
    )
    expect(downloads).toEqual([
      { href: 'blob:export', download: 'dashboard_al-amal_2026-10-01_2026-10-31.xlsx' },
    ])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })

  it('falls back to a period filename without Content-Disposition and omits an empty user', async () => {
    apiFetch.mockResolvedValue(okResponse())

    await exportDashboard({ projectId: 7, userId: null, period: OCTOBER })

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/dashboard/export?date_from=2026-10-01&date_to=2026-10-31&project_id=7',
    )
    expect(downloads.map((d) => d.download)).toEqual(['dashboard_2026-10-01_2026-10-31.xlsx'])
  })

  it('throws the API message on a refusal and downloads nothing', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({ message: "Vous n'avez pas accès à ce projet." }),
    })

    await expect(exportDashboard({ projectId: 7, userId: null, period: OCTOBER }))
      .rejects.toMatchObject({ message: "Vous n'avez pas accès à ce projet.", status: 403 })
    expect(downloads).toEqual([])
  })
})
