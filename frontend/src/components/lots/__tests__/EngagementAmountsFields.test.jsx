import { useState } from 'react'
import { getDefaultNormalizer, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EngagementAmountsFields from '../EngagementAmountsFields'

const REFERENCE = { agreedTotalPrice: '500000', salePrice: '450000', gapDueTiming: 'fin', gapDueDate: '', firstPayment: '100000' }

/** Controlled host: keeps the value in state and reports every change. */
function Host({ initial = REFERENCE, onChange = () => {}, ...props }) {
  const [value, setValue] = useState(initial)
  return (
    <EngagementAmountsFields
      cataloguePrice={500000}
      value={value}
      onChange={(next) => { setValue(next); onChange(next) }}
      {...props}
    />
  )
}

describe('EngagementAmountsFields', () => {
  it('shows the catalogue price read-only and the computed gap (reference example)', () => {
    render(<Host />)

    expect(screen.getByText('Prix catalogue')).toBeInTheDocument()
    expect(screen.getByText('500 000 MAD')).toBeInTheDocument()
    expect(screen.getByLabelText('Prix total convenu')).toHaveValue(500000)
    expect(screen.getByLabelText("Prix figurant sur l'acte")).toHaveValue(450000)
    expect(screen.getByLabelText('Écart à régulariser')).toHaveTextContent('50 000 MAD')
    expect(screen.getByLabelText('Premier acompte reçu')).toHaveValue(100000)
  })

  it('recomputes the gap when the agreed total price changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Host onChange={onChange} />)

    const agreed = screen.getByLabelText('Prix total convenu')
    await user.clear(agreed)
    await user.type(agreed, '520000')

    expect(onChange).toHaveBeenLastCalledWith({ ...REFERENCE, agreedTotalPrice: '520000' })
    expect(screen.getByLabelText('Écart à régulariser')).toHaveTextContent('70 000 MAD')
  })

  it('shows an inline error when the deed price is above the agreed total price', async () => {
    const user = userEvent.setup()
    render(<Host />)

    const acte = screen.getByLabelText("Prix figurant sur l'acte")
    await user.clear(acte)
    await user.type(acte, '550000')

    expect(screen.getByText("Le prix figurant sur l'acte ne peut pas dépasser le prix total convenu.")).toBeInTheDocument()
    expect(screen.getByLabelText('Écart à régulariser')).toHaveTextContent('0 MAD')
  })

  it('asks for a date when the gap is due at a date', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Host onChange={onChange} />)

    expect(screen.getByRole('button', { name: /^À la fin/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /^À une date/ }))

    expect(onChange).toHaveBeenLastCalledWith({ ...REFERENCE, gapDueTiming: 'date' })
    expect(screen.getByText("Indiquez la date de l'écart.")).toBeInTheDocument()
    await user.type(screen.getByLabelText("Date de l'écart"), '2027-06-30')

    expect(onChange).toHaveBeenLastCalledWith({ ...REFERENCE, gapDueTiming: 'date', gapDueDate: '2027-06-30' })
    expect(screen.queryByText("Indiquez la date de l'écart.")).not.toBeInTheDocument()
  })

  it('hides the gap timing when there is no gap', () => {
    render(<Host initial={{ ...REFERENCE, salePrice: '500000' }} />)

    expect(screen.getByLabelText('Écart à régulariser')).toHaveTextContent('0 MAD')
    expect(screen.queryByText("Échéance de l'écart")).not.toBeInTheDocument()
  })

  it('shows a first payment that is not typed read-only', () => {
    render(<Host firstPayment={20000} firstPaymentHint="Garantie déduite" />)

    expect(screen.getByLabelText('Premier acompte reçu')).toHaveTextContent('20 000 MAD')
    expect(screen.getByText('Garantie déduite')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Montant reçu')).not.toBeInTheDocument()
  })

  it('refuses a first payment above the agreed total price', () => {
    render(<Host initial={{ ...REFERENCE, firstPayment: '600000' }} />)

    expect(screen.getByText('Le premier acompte reçu ne peut pas dépasser le prix total convenu.')).toBeInTheDocument()
  })

  it('no longer shows the promotion fields', () => {
    render(<Host />)

    expect(screen.queryByText(/promotion/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Premier acompte \(ND\)/)).not.toBeInTheDocument()
  })

  it('takes amounts at the cent (step 0.01): a deed price of grid price × surface stays valid', () => {
    render(<Host initial={{ ...REFERENCE, salePrice: '453217.5', firstPayment: '100000.25' }} />)

    for (const label of ['Prix total convenu', "Prix figurant sur l'acte", 'Premier acompte reçu']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('step', '0.01')
      expect(screen.getByLabelText(label)).toBeValid()
    }
  })

  describe('difference from the catalogue price, with its percentage', () => {
    // exact text: the space before « % » is a non-breaking space (U+00A0)
    const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) }

    it('below the catalogue price: amount and negative percentage at 2 decimals', () => {
      render(<Host cataloguePrice={399000} initial={{ ...REFERENCE, agreedTotalPrice: '397807.05', salePrice: '397807.05' }} />)

      expect(screen.getByText('1 192,95 MAD sous le prix catalogue (−0,30\u00a0%)', exact)).toBeInTheDocument()
    })

    it('above the catalogue price: amount and positive percentage', () => {
      render(<Host cataloguePrice={400000} initial={{ ...REFERENCE, agreedTotalPrice: '405000', salePrice: '405000' }} />)

      expect(screen.getByText('5 000 MAD au-dessus du prix catalogue (+1,25\u00a0%)', exact)).toBeInTheDocument()
    })

    it('follows the agreed price as it is typed', async () => {
      const user = userEvent.setup()
      render(<Host />)

      const agreed = screen.getByLabelText('Prix total convenu')
      await user.clear(agreed)
      await user.type(agreed, '475000')

      expect(screen.getByText('25 000 MAD sous le prix catalogue (−5,00\u00a0%)', exact)).toBeInTheDocument()
    })

    it('shows no percentage when the catalogue price is 0', () => {
      render(<Host cataloguePrice={0} initial={{ ...REFERENCE, agreedTotalPrice: '1000', salePrice: '1000', firstPayment: '' }} />)

      expect(screen.getByText('1 000 MAD au-dessus du prix catalogue')).toBeInTheDocument()
      expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    })

    it('shows no difference at all when the agreed price equals the catalogue price', () => {
      render(<Host />)

      expect(screen.queryByText(/prix catalogue \(/)).not.toBeInTheDocument()
      expect(screen.queryByText(/sous le prix catalogue|au-dessus du prix catalogue/)).not.toBeInTheDocument()
    })
  })
})
