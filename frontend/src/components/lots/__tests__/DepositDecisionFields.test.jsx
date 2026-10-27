import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DepositDecisionFields from '../DepositDecisionFields'

const RELEASE = { deposit_refund_amount: '5000', deposit_refund_date: '2026-10-26', refund_payment_type: 'cash' }

function renderFields(props = {}) {
  const onChoiceChange = vi.fn()
  const onReleaseChange = vi.fn()
  render(
    <DepositDecisionFields
      label="Acompte de l'option"
      amount={5000}
      refundLabel="Rembourser l'acompte"
      refundDesc="Acompte rendu au client"
      deductLabel="Déduire l'acompte"
      deductDesc="Acompte conservé"
      choice={null}
      onChoiceChange={onChoiceChange}
      releaseData={RELEASE}
      onReleaseChange={onReleaseChange}
      {...props}
    />
  )
  return { onChoiceChange, onReleaseChange }
}

describe('DepositDecisionFields', () => {
  it('reports the chosen decision', async () => {
    const user = userEvent.setup()
    const { onChoiceChange } = renderFields()

    await user.click(screen.getByRole('button', { name: /Déduire l'acompte/ }))

    expect(onChoiceChange).toHaveBeenCalledWith('deduct')
    expect(screen.queryByText('Montant remboursé')).not.toBeInTheDocument()
  })

  it('asks for the refund details when refunding', async () => {
    const user = userEvent.setup()
    const { onReleaseChange } = renderFields({ choice: 'refund' })

    expect(screen.getByText(/Montant remboursé/)).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox'), 'check')

    expect(onReleaseChange).toHaveBeenCalledWith({ ...RELEASE, refund_payment_type: 'check' })
  })
})
