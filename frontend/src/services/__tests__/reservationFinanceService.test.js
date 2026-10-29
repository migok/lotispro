import {
  acteThresholdMessage,
  getFinancialSummary,
  installmentLabel,
  INSTALLMENT_STATUS_LABELS,
  listPayments,
  recordPayment,
} from '../reservationFinanceService'

function stubFetch(body = {}, status = 200) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('reservationFinanceService', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the financial summary and the payments of a reservation', async () => {
    const fetchMock = stubFetch({ remaining: 400000 })

    await expect(getFinancialSummary(11)).resolves.toEqual({ remaining: 400000 })
    await listPayments(11)

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/reservations\/11\/financial-summary$/)
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/api\/reservations\/11\/payments$/)
  })

  it('records a payment as multipart form data, without a JSON content type', async () => {
    const fetchMock = stubFetch({ id: 7 }, 201)
    const file = new File(['%PDF'], 'cheque.pdf', { type: 'application/pdf' })

    await recordPayment(11, {
      installmentId: 4, amount: '50000', paidOn: '2026-10-28', method: 'check', reference: ' CHQ 123 ', file,
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/reservations\/11\/payments$/)
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBeUndefined()
    const body = options.body
    expect(body).toBeInstanceOf(FormData)
    expect(Object.fromEntries([...body.entries()].filter(([k]) => k !== 'file'))).toEqual({
      installment_id: '4', amount: '50000', paid_on: '2026-10-28', method: 'check', reference: 'CHQ 123',
    })
    expect(body.get('file')).toBeInstanceOf(File)
  })

  it('omits an empty reference and a missing proof', async () => {
    const fetchMock = stubFetch({ id: 7 }, 201)

    await recordPayment(11, { installmentId: 4, amount: '50000', paidOn: '2026-10-28', method: 'cash', reference: '  ' })

    const body = fetchMock.mock.calls[0][1].body
    expect(body.has('reference')).toBe(false)
    expect(body.has('file')).toBe(false)
  })

  it('rejects with the API message (message or detail)', async () => {
    stubFetch({ message: 'Le montant dépasse le restant dû de cette échéance (50 000 MAD).' }, 400)

    await expect(recordPayment(11, { installmentId: 4, amount: '60000', paidOn: '2026-10-28', method: 'cash' }))
      .rejects.toMatchObject({ status: 400, message: 'Le montant dépasse le restant dû de cette échéance (50 000 MAD).' })
  })

  it('builds the deed threshold message from the summary', () => {
    expect(acteThresholdMessage({ acte_min_paid_pct: 10, total_received: 30000, acte_threshold_amount: 50000 }))
      .toBe("L'acte sera disponible quand 10 % du prix total convenu aura été encaissé (30 000 MAD sur 50 000 MAD).")
    expect(acteThresholdMessage({ acte_min_paid_pct: 12.5, total_received: 0, acte_threshold_amount: 62500 }))
      .toBe("L'acte sera disponible quand 12,5 % du prix total convenu aura été encaissé (0 MAD sur 62 500 MAD).")
  })

  it('labels installments and their computed statuses', () => {
    expect(installmentLabel({ payment_type: 'deposit', installment_number: 2 })).toBe('Acompte 2')
    expect(installmentLabel({ payment_type: 'balance', installment_number: 1 })).toBe('Solde 1')
    expect(installmentLabel({ payment_type: 'gap', installment_number: 1 })).toBe('Écart à régulariser')
    expect(INSTALLMENT_STATUS_LABELS).toEqual({ pending: 'À recevoir', partial: 'Partiellement reçu', paid: 'Reçu' })
  })
})
