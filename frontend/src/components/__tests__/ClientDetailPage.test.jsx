import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../../test/renderWithProviders'
import ClientDetailPage from '../ClientDetailPage'

const CLIENT = {
  id: 7,
  name: 'Fatima Benali',
  first_name: 'Fatima',
  last_name: 'Benali',
  maiden_name: 'Alaoui',
  phone: '+212612345678',
  whatsapp: '+212612345679',
  email: 'fatima@exemple.ma',
  cin: 'AB123456',
  address_morocco: '12 rue des Orangers',
  city_morocco: 'Casablanca',
  address_abroad: '5 avenue de Paris',
  city_abroad: 'Lyon',
  country_abroad: 'France',
  acte_address: 'abroad',
  acquisition_channel: 'samsar',
  acquisition_referrer: 'Karim',
  acquisition_date: '2026-10-01',
  notification_channels: ['email', 'whatsapp'],
  client_type: 'autre',
  created_at: '2026-10-02T10:00:00',
  sales_history: [],
  reservations: [],
}

function mockFetch(client) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const body = String(url).includes('/details') ? client : []
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })
  )
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/app/clients/:clientId" element={<ClientDetailPage />} />
    </Routes>,
    { route: '/app/clients/7', user: { id: 1, role: 'manager' } }
  )
}

describe('ClientDetailPage - fiche client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the acquisition channel with referrer and DD/MM/YYYY date', async () => {
    mockFetch(CLIENT)
    renderPage()

    expect(await screen.findByText('Canal : Samsar — Karim (01/10/2026)')).toBeInTheDocument()
  })

  it('shows both addresses and flags the one used for actes', async () => {
    mockFetch(CLIENT)
    renderPage()

    const morocco = await screen.findByText(/12 rue des Orangers/)
    const abroad = screen.getByText(/5 avenue de Paris/)
    expect(abroad).toHaveTextContent('Étranger : 5 avenue de Paris, Lyon, France')
    expect(morocco).toHaveTextContent('Maroc : 12 rue des Orangers, Casablanca')
    expect(abroad).toHaveTextContent('Actes')
    expect(morocco).not.toHaveTextContent('Actes')
    expect(screen.getByTitle("Adresse utilisée pour les actes")).toBeInTheDocument()
  })

  it('shows the notification history of the client', async () => {
    const fetchMock = vi.fn((url) => {
      const path = String(url)
      const body = path.includes('/details')
        ? CLIENT
        : path.includes('/api/notifications')
          ? [{ id: 1, kind: 'reservation_engagee', channel: 'email', recipient: 'client', status: 'sent', error: null, sent_at: '2026-10-28T09:12:00Z', sent_by_user_id: 2 }]
          : []
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    expect(await screen.findByText('Réservation engagée')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/notifications?client_id=7'))).toBe(true)
  })

  it('shows the legacy address (address_morocco only) in read mode', async () => {
    mockFetch({ ...CLIENT, address_abroad: null, acte_address: null })
    renderPage()

    const line = await screen.findByText(/12 rue des Orangers/)
    expect(line).toHaveTextContent('Actes')
  })

  describe('acte de réservation', () => {
    const WITH_RESERVATION = {
      ...CLIENT,
      reservations_history: [
        { id: 5, status: 'active', lot_numero: 'A1', project_id: 1, project_name: 'Projet', reserved_by_user_id: 2 },
      ],
    }
    const SUMMARY = {
      catalogue_price: 500000, agreed_total_price: 500000, acte_price: 450000, gap_amount: 50000,
      gap_due_timing: 'fin', gap_due_date: null, first_payment: 100000, total_received: 100000, remaining: 400000,
      acte_min_paid_pct: 10, acte_threshold_amount: 50000, acte_available: true,
      installments: [
        { id: 1, payment_type: 'deposit', installment_number: 1, amount: 150000, due_date: '2030-01-01T00:00:00', received: 0, remaining: 150000, status: 'pending' },
        { id: 4, payment_type: 'gap', installment_number: 1, amount: 50000, due_date: '2030-06-01T00:00:00', received: 0, remaining: 50000, status: 'pending' },
      ],
      updated_at: '2026-10-28T10:00:00',
    }

    function mockDownloads(acteStatus, summary = SUMMARY, client = WITH_RESERVATION) {
      const fetchMock = vi.fn((url, options = {}) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, '')
        const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
        if (path.endsWith('/details')) return json(client)
        if (path.includes('/api/payments/schedules/client/')) {
          return json([{ id: 9, reservation_id: 5, lot_price: 400000, installments: [] }])
        }
        if (path.endsWith('/api/reservations/5/financial-summary')) return json(summary)
        if (path.endsWith('/api/reservations/5/payments') && options.method === 'POST') return json({ id: 2 }, 201)
        if (path.endsWith('/api/reservations/5/certificate/email')) {
          return json({ error: 'BUSINESS_RULE_VIOLATION', message: "L'acte sera disponible quand 10 % du prix total convenu aura été encaissé (0 MAD sur 50 000 MAD)." }, 400)
        }
        if (path.endsWith('/api/reservations/5/acte')) {
          return Promise.resolve({ ok: acteStatus === 200, status: acteStatus, blob: () => Promise.resolve(new Blob(['%PDF'])), json: () => Promise.resolve({}) })
        }
        if (path.endsWith('/api/reservations/5/certificate')) {
          return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF'])) })
        }
        return json([])
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    const calledPaths = (fetchMock) => fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''))

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:acte')
      URL.revokeObjectURL = vi.fn()
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    async function clickDownload() {
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Réservations \(1\)/ }))
      await user.click(await screen.findByRole('button', { name: /Télécharger/ }))
    }

    it('downloads the archived acte first', async () => {
      const fetchMock = mockDownloads(200)
      await clickDownload()

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
      expect(calledPaths(fetchMock)).toContain('/api/reservations/5/acte')
      expect(calledPaths(fetchMock)).not.toContain('/api/reservations/5/certificate')
    })

    it('falls back to on-the-fly generation when no acte is archived (404)', async () => {
      const fetchMock = mockDownloads(404)
      await clickDownload()

      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
      expect(calledPaths(fetchMock)).toEqual(expect.arrayContaining(['/api/reservations/5/acte', '/api/reservations/5/certificate']))
    })

    it('no longer shows an aggregate « Restant à payer »; each reservation shows its own « Reste à payer »', async () => {
      mockDownloads(200, SUMMARY, {
        ...WITH_RESERVATION,
        sales_history: [{ id: 1, price: 480000, sale_date: '2026-10-20', lot_numero: 'B2', project_id: 1, project_name: 'Projet' }],
      })
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('Résumé commercial')
      expect(screen.queryByText(/Restant à payer/)).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Paiements' }))
      expect((await screen.findByText('Reste à payer')).nextSibling).toHaveTextContent('400 000 MAD')
    })

    it('no longer offers to create a plan for a reservation without schedule', async () => {
      const fetchMock = mockDownloads(200, SUMMARY, {
        ...WITH_RESERVATION,
        reservations_history: [
          ...WITH_RESERVATION.reservations_history,
          { id: 6, status: 'active', lot_numero: 'C3', lot_price: 300000, project_id: 1, project_name: 'Projet', reserved_by_user_id: 2 },
        ],
      })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Paiements' }))

      await screen.findByRole('table', { name: 'Échéancier' })
      expect(screen.queryByRole('button', { name: /Créer le plan/ })).not.toBeInTheDocument()
      expect(screen.queryByText('Réservations sans plan de paiement')).not.toBeInTheDocument()
      expect(fetchMock.mock.calls.some(([url, opts]) => String(url).endsWith('/api/payments/schedules') && opts?.method === 'POST')).toBe(false)
    })

    it('only offers to record a payment on an engaged reservation (gap timing set at engagement)', async () => {
      mockDownloads(200, { ...SUMMARY, gap_due_timing: null })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Paiements' }))

      await screen.findByRole('table', { name: 'Échéancier' })
      expect(screen.queryByRole('button', { name: 'Enregistrer un encaissement' })).not.toBeInTheDocument()
    })

    it('shows a neutral message when the deed status cannot be loaded', async () => {
      const fetchMock = mockDownloads(200)
      const base = fetchMock.getMockImplementation()
      fetchMock.mockImplementation((url, opts) =>
        String(url).endsWith('/api/reservations/5/financial-summary')
          ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) })
          : base(url, opts))
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Réservations \(1\)/ }))

      expect(await screen.findByText('Documents indisponibles.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Télécharger/ })).not.toBeInTheDocument()
    })

    it('shows the threshold message and the receipt while the deed is not available', async () => {
      mockDownloads(404, { ...SUMMARY, acte_min_paid_pct: 30, acte_threshold_amount: 150000, acte_available: false })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Réservations \(1\)/ }))

      expect(await screen.findByText(
        "L'acte sera disponible quand 30 % du prix total convenu aura été encaissé (100 000 MAD sur 150 000 MAD)."
      )).toBeInTheDocument()
      expect(screen.getByText('Reçu de paiement')).toBeInTheDocument()
      expect(screen.queryByText('Acte de réservation')).not.toBeInTheDocument()
    })

    it('shows the API message when the deed email is refused (400 message)', async () => {
      mockDownloads(200)
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Réservations \(1\)/ }))
      await user.click(await screen.findByRole('button', { name: /Envoyer par email/ }))

      expect(await screen.findByText(
        "L'acte sera disponible quand 10 % du prix total convenu aura été encaissé (0 MAD sur 50 000 MAD)."
      )).toBeInTheDocument()
    })

    describe('lignes de réservation cliquables', () => {
      const TWO = {
        ...WITH_RESERVATION,
        reservations_history: [
          { id: 5, status: 'active', lot_numero: 'A1', lot_surface: 111.376211083, project_id: 1, project_name: 'Projet', reserved_by_user_id: 2 },
          { id: 6, status: 'active', lot_numero: 'C3', lot_surface: 91, project_id: 1, project_name: 'Projet', reserved_by_user_id: 2 },
        ],
      }

      function mockRows({ schedules, summaries }) {
        vi.stubGlobal('fetch', vi.fn((url) => {
          const path = String(url).replace(/^https?:\/\/[^/]+/, '')
          const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
          if (path.endsWith('/details')) return json(TWO)
          if (path.includes('/api/payments/schedules/client/')) return json(schedules)
          const m = path.match(/\/api\/reservations\/(\d+)\/financial-summary/)
          if (m) return json(summaries[m[1]] || SUMMARY)
          return json([])
        }))
      }
      const SCHEDULES = [
        { id: 9, reservation_id: 5, lot_price: 400000, installments: [] },
        { id: 10, reservation_id: 6, lot_price: 300000, installments: [] },
      ]
      const row = (n) => screen.findByRole('button', { name: `Voir les paiements du lot ${n}` })

      it('switches to Paiements and highlights the card of the clicked row', async () => {
        mockRows({ schedules: SCHEDULES, summaries: {} })
        const user = userEvent.setup()
        renderPage()
        await user.click(await screen.findByRole('button', { name: /Réservations \(2\)/ }))
        await user.click(await row('C3'))

        const card = (await screen.findByText('Lot C3 — Projet')).closest('.pay-overview-card')
        expect(card).toHaveClass('pay-overview-card--highlight')
        expect(screen.getByText('Lot A1 — Projet').closest('.pay-overview-card')).not.toHaveClass('pay-overview-card--highlight')
      })

      it('activates a row with the Enter key', async () => {
        mockRows({ schedules: SCHEDULES, summaries: {} })
        const user = userEvent.setup()
        renderPage()
        await user.click(await screen.findByRole('button', { name: /Réservations \(2\)/ }))
        const r = await row('A1')
        r.focus()
        await user.keyboard('{Enter}')

        expect((await screen.findByText('Lot A1 — Projet')).closest('.pay-overview-card')).toHaveClass('pay-overview-card--highlight')
      })

      it('does not navigate when a deed button inside the row is clicked', async () => {
        mockRows({ schedules: SCHEDULES, summaries: {} })
        const user = userEvent.setup()
        renderPage()
        await user.click(await screen.findByRole('button', { name: /Réservations \(2\)/ }))
        const buttons = await screen.findAllByRole('button', { name: /Télécharger/ })
        await user.click(buttons[0])

        expect(screen.getByRole('button', { name: /Réservations \(2\)/ })).toHaveClass('active')
        expect(document.querySelector('.pay-overview-card')).toBeNull()
      })

      it('says so when the clicked reservation has no schedule', async () => {
        mockRows({ schedules: [SCHEDULES[0]], summaries: {} })
        const user = userEvent.setup()
        renderPage()
        await user.click(await screen.findByRole('button', { name: /Réservations \(2\)/ }))
        await user.click(await row('C3'))

        expect(await screen.findByText('Aucun échéancier pour le lot C3.')).toBeInTheDocument()
      })

      it('shows the threshold message only for an engaged reservation', async () => {
        mockRows({
          schedules: SCHEDULES,
          summaries: {
            5: { ...SUMMARY, acte_available: false, acte_min_paid_pct: 10, acte_threshold_amount: 50000, first_payment: 0, total_received: 0 },
            6: { ...SUMMARY, acte_available: false, gap_due_timing: null, first_payment: 0, total_received: 0 },
          },
        })
        const user = userEvent.setup()
        renderPage()
        await user.click(await screen.findByRole('button', { name: /Réservations \(2\)/ }))

        await screen.findAllByText(/L'acte sera disponible quand/)
        const rows = [await row('A1'), await row('C3')]
        expect(within(rows[0]).getByText(/L'acte sera disponible quand/)).toBeInTheDocument()
        expect(within(rows[1]).queryByText(/L'acte sera disponible quand/)).not.toBeInTheDocument()
        expect(within(rows[1]).queryByText('Reçu de paiement')).not.toBeInTheDocument()
      })

      it('shows a legacy warning instead of the threshold message', async () => {
        mockRows({
          schedules: SCHEDULES,
          summaries: { 5: { ...SUMMARY, legacy: true, gap_due_timing: null, acte_available: false, first_payment: 0 } },
        })
        const user = userEvent.setup()
        renderPage()
        await user.click(await screen.findByRole('button', { name: /Réservations \(2\)/ }))

        const r = await row('A1')
        expect(await within(r).findByText('Réservation engagée avant la nouvelle gestion des montants.')).toBeInTheDocument()
        expect(within(r).queryByText(/L'acte sera disponible quand/)).not.toBeInTheDocument()
      })

      it('formats the surface with at most 2 decimals and French separators', async () => {
        mockRows({ schedules: SCHEDULES, summaries: {} })
        const user = userEvent.setup()
        renderPage()
        await user.click(await screen.findByRole('button', { name: /Réservations \(2\)/ }))

        expect(await screen.findByText(/111,38 m²/)).toBeInTheDocument()
        expect(screen.getByText(/91 m²/)).toBeInTheDocument()
      })
    })

    it('shows the schedule and records a payment from the payments tab, without promotion', async () => {
      const fetchMock = mockDownloads(200)
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Paiements' }))

      const schedule = await screen.findByRole('table', { name: 'Échéancier' })
      expect(within(schedule).getByRole('row', { name: /Écart à régulariser/ })).toHaveTextContent('50 000 MAD')
      expect(screen.getByText('Reste à payer').nextSibling).toHaveTextContent('400 000 MAD')
      expect(screen.queryByText(/promotion/i)).not.toBeInTheDocument()
      await user.click(within(within(schedule).getByRole('row', { name: /Acompte 1/ })).getByRole('button', { name: 'Enregistrer un encaissement' }))
      await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))

      await waitFor(() => expect(fetchMock.mock.calls.some(
        ([url, opts]) => String(url).endsWith('/api/reservations/5/payments') && opts?.method === 'POST'
      )).toBe(true))
      expect(fetchMock.mock.calls.some(([url, opts]) => String(url).includes('/api/payments/installments/') && opts?.method === 'PATCH')).toBe(false)
    })
  })
})
