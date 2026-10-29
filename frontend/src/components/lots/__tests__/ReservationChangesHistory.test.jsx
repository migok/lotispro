import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders'
import ReservationChangesHistory from '../ReservationChangesHistory'

const CHANGES = [
  {
    id: 2, user_id: 1, user_name: 'Test Manager',
    changed_at: '2026-10-29T09:15:00',
    reason: 'Écart à date fixe',
    before: { gap_due_timing: 'fin', gap_due_date: null, notes: 'Client fidèle' },
    after: { gap_due_timing: 'date', gap_due_date: '2027-06-30', notes: null },
  },
  {
    id: 1, user_id: 3, user_name: 'Test Commercial 2',
    changed_at: '2026-10-28T21:50:12.123456',
    reason: 'Remise accordée par la direction',
    before: {
      agreed_total_price: 500000.0, sale_price: 450000.0,
      installments: [
        { id: 3, amount: 100000.0, due_date: '2026-12-28' },
        { id: 4, amount: 50000.0, due_date: '2026-12-28' },
      ],
    },
    after: {
      agreed_total_price: 520000.0, sale_price: 460000.0,
      installments: [
        { id: 3, amount: 110000.0, due_date: '2027-01-27' },
        { id: 4, amount: 60000.0, due_date: '2027-01-27' },
        { id: 9, amount: 1000.5, due_date: '2027-02-01' },
      ],
    },
  },
]

/** Current schedule (financial summary), used to name the installments. */
const INSTALLMENTS = [
  { id: 3, payment_type: 'balance', installment_number: 2 },
  { id: 4, payment_type: 'gap', installment_number: 1 },
]

function stubFetch(body, status = 200) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const entries = () => screen.getAllByRole('listitem').filter((li) => li.matches('.rch-entry'))

describe('ReservationChangesHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists each change, newest first, with date, author, reason and the changed fields before → after', async () => {
    const fetchMock = stubFetch(CHANGES)
    renderWithProviders(<ReservationChangesHistory reservationId={11} installments={INSTALLMENTS} />)

    expect(await screen.findByText('Remise accordée par la direction')).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/reservations\/11\/changes$/)

    const [latest, first] = entries()
    expect(latest).toHaveTextContent('29/10/2026')
    expect(latest).toHaveTextContent('Test Manager')
    expect(latest).toHaveTextContent('Écart à date fixe')
    expect(within(latest).getByText("Échéance de l'écart : À la fin → À une date")).toBeInTheDocument()
    expect(within(latest).getByText("Date de l'écart : — → 30 juin 2027")).toBeInTheDocument()
    expect(within(latest).getByText('Notes : Client fidèle → —')).toBeInTheDocument()

    expect(first).toHaveTextContent('28/10/2026')
    expect(first).toHaveTextContent('Test Commercial 2')
    expect(within(first).getByText('Prix total convenu : 500 000 MAD → 520 000 MAD')).toBeInTheDocument()
    expect(within(first).getByText("Prix figurant sur l'acte : 450 000 MAD → 460 000 MAD")).toBeInTheDocument()
    expect(within(first).getByText('Solde 2 : 100 000 MAD, 28 déc. 2026 → 110 000 MAD, 27 janv. 2027')).toBeInTheDocument()
    expect(within(first).getByText('Écart à régulariser : 50 000 MAD, 28 déc. 2026 → 60 000 MAD, 27 janv. 2027')).toBeInTheDocument()
    // an installment no longer in the schedule, created by the edit
    expect(within(first).getByText('Échéance : — → 1 000,50 MAD, 01 févr. 2027')).toBeInTheDocument()
  })

  it('says so when there is no change', async () => {
    stubFetch([])
    renderWithProviders(<ReservationChangesHistory reservationId={11} />)

    expect(await screen.findByText('Aucune modification enregistrée.')).toBeInTheDocument()
  })

  it('says so when the history cannot be loaded', async () => {
    stubFetch({ detail: 'Erreur' }, 500)
    renderWithProviders(<ReservationChangesHistory reservationId={11} />)

    expect(await screen.findByText('Historique indisponible.')).toBeInTheDocument()
  })
})
