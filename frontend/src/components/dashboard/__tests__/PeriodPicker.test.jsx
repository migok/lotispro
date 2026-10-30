import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PeriodPicker from '../PeriodPicker'

const ERROR = 'La date de début doit être antérieure ou égale à la date de fin.'

function Harness({ initial, onChange, children }) {
  const [value, setValue] = useState(initial)
  return (
    <PeriodPicker
      value={value}
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    >
      {children}
    </PeriodPicker>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 10, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PeriodPicker', () => {
  it('shows the active period, the date fields and the pressed shortcut', () => {
    render(<Harness initial={{ dateFrom: '2026-10-01', dateTo: '2026-10-31' }} onChange={vi.fn()} />)

    expect(screen.getByText('Période : du 01/10/2026 au 31/10/2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Du')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('Au')).toHaveValue('2026-10-31')
    expect(screen.getByRole('button', { name: 'Ce mois' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ce trimestre' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking « Ce trimestre » calls onChange with the quarter and updates the label', async () => {
    const onChange = vi.fn()
    render(<Harness initial={{ dateFrom: '2026-10-01', dateTo: '2026-10-31' }} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Ce trimestre' }))

    expect(onChange).toHaveBeenCalledWith({ dateFrom: '2026-10-01', dateTo: '2026-12-31' })
    expect(screen.getByText('Période : du 01/10/2026 au 31/12/2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ce trimestre' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Au')).toHaveValue('2026-12-31')
  })

  it('applies a valid manual date', () => {
    const onChange = vi.fn()
    render(<Harness initial={{ dateFrom: '2026-10-01', dateTo: '2026-10-31' }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-10-15' } })

    expect(onChange).toHaveBeenCalledWith({ dateFrom: '2026-10-15', dateTo: '2026-10-31' })
    expect(screen.getByText('Période : du 15/10/2026 au 31/10/2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { pressed: true })).toBeNull()
  })

  it('inverted manual dates show the error and do not call onChange', () => {
    const onChange = vi.fn()
    render(<Harness initial={{ dateFrom: '2026-10-01', dateTo: '2026-10-31' }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-11-05' } })

    expect(screen.getByRole('alert')).toHaveTextContent(ERROR)
    expect(onChange).not.toHaveBeenCalled()
    // The active period is unchanged.
    expect(screen.getByText('Période : du 01/10/2026 au 31/10/2026')).toBeInTheDocument()

    // Fixing the end date clears the error and applies the range.
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-11-30' } })
    expect(screen.queryByText(ERROR)).toBeNull()
    expect(onChange).toHaveBeenCalledWith({ dateFrom: '2026-11-05', dateTo: '2026-11-30' })
  })

  it('an out-of-range year being typed is not applied and shows no error', () => {
    const onChange = vi.fn()
    render(<Harness initial={{ dateFrom: '2026-10-01', dateTo: '2026-10-31' }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '0202-10-01' } })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Période : du 01/10/2026 au 31/10/2026')).toBeInTheDocument()
  })

  it('renders the actions slot', () => {
    render(
      <Harness initial={{ dateFrom: '2026-10-01', dateTo: '2026-10-31' }} onChange={vi.fn()}>
        <button type="button">Exporter</button>
      </Harness>,
    )
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeInTheDocument()
  })
})
