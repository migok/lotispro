import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/renderWithProviders'
import RecordPaymentForm from '../RecordPaymentForm'

const GAP = {
  id: 4, payment_type: 'gap', installment_number: 1, amount: 50000,
  due_date: '2027-06-30T00:00:00', received: 0, remaining: 50000, status: 'pending',
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mockFetch(response = { status: 201, body: { id: 7, amount: 50000, installment_id: 4 } }) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: response.status < 400, status: response.status, json: () => Promise.resolve(response.body) })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderForm(props = {}) {
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  renderWithProviders(
    <RecordPaymentForm reservationId={11} installment={GAP} onSaved={onSaved} onCancel={onCancel} {...props} />,
    { user: { id: 1, role: 'manager' } }
  )
  return { onSaved, onCancel }
}

describe('RecordPaymentForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefills the amount with what is left on the installment, today and cash', () => {
    mockFetch()
    renderForm({ installment: { ...GAP, received: 20000, remaining: 30000, status: 'partial' } })

    expect(screen.getByText(/Écart à régulariser/)).toBeInTheDocument()
    expect(screen.getByLabelText('Montant')).toHaveValue(30000)
    expect(screen.getByLabelText("Date d'encaissement")).toHaveValue(today())
    expect(screen.getByLabelText('Mode de paiement')).toHaveValue('cash')
    expect(screen.getByLabelText(/Référence/)).toHaveValue('')
    expect(screen.getByLabelText(/Justificatif/)).toBeInTheDocument()
  })

  it('sends the payment as multipart with its optional proof, then reports it', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    const { onSaved } = renderForm()
    const file = new File(['%PDF'], 'cheque.pdf', { type: 'application/pdf' })

    await user.selectOptions(screen.getByLabelText('Mode de paiement'), 'check')
    await user.type(screen.getByLabelText(/Référence/), 'CHQ 123')
    await user.upload(screen.getByLabelText(/Justificatif/), file)
    await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 7, amount: 50000, installment_id: 4 }))
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/reservations\/11\/payments$/)
    expect(options.method).toBe('POST')
    const body = options.body
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('installment_id')).toBe('4')
    expect(body.get('amount')).toBe('50000')
    expect(body.get('paid_on')).toBe(today())
    expect(body.get('method')).toBe('check')
    expect(body.get('reference')).toBe('CHQ 123')
    expect(body.get('file').name).toBe('cheque.pdf')
  })

  it('shows the API refusal and keeps the form open', async () => {
    const message = 'Le versement précédent doit être encaissé en premier.'
    mockFetch({ status: 400, body: { error: 'BUSINESS_RULE_VIOLATION', message, details: [{ rule: 'installment_order_violation' }] } })
    const user = userEvent.setup()
    const { onSaved } = renderForm()

    await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows the field messages of a validation error', async () => {
    mockFetch({
      status: 422,
      body: {
        error: 'VALIDATION_ERROR', message: 'Certains champs sont invalides',
        details: [{ field: 'body.paid_on', message: "La date d'encaissement ne peut pas être dans le futur.", type: 'value_error' }],
      },
    })
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))

    expect(await screen.findByRole('alert')).toHaveTextContent("La date d'encaissement ne peut pas être dans le futur.")
  })

  it('refuses an amount above what is left before calling the API', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    const { onSaved } = renderForm()

    const amount = screen.getByLabelText('Montant')
    await user.clear(amount)
    await user.type(amount, '60000')
    await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))

    expect(screen.getByRole('alert')).toHaveTextContent('Le montant dépasse le restant dû de cette échéance (50 000 MAD).')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows and accepts an amount with cents (116 666,67)', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    const { onSaved } = renderForm({
      installment: { ...GAP, payment_type: 'balance', amount: 116666.67, remaining: 116666.67 },
    })

    expect(screen.getByText(/restant dû 116 666,67 MAD/)).toBeInTheDocument()
    const amount = screen.getByLabelText('Montant')
    await user.clear(amount)
    await user.type(amount, '116666.67')
    await user.click(screen.getByRole('button', { name: "Enregistrer l'encaissement" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][1].body.get('amount')).toBe('116666.67')
  })

  it('cancels without sending anything', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    const { onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onCancel).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
