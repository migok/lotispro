import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MonthlyChart from '../MonthlyChart'

const bucket = (key, values = {}) => ({
  key, lots_vendus: 0, ca: 0, reservations_creees: 0, encaissements: 0, ...values,
})

const PERFORMANCE = {
  granularity: 'month',
  series: [
    bucket('2026-09', { lots_vendus: 2, ca: 800000, reservations_creees: 5 }),
    bucket('2026-10', { lots_vendus: 1, ca: 400000, reservations_creees: 3 }),
  ],
}

describe('MonthlyChart', () => {
  it('renders the period series with totals and bucket labels', () => {
    const { container } = render(<MonthlyChart performance={PERFORMANCE} loading={false} />)

    expect(screen.getByRole('heading', { name: /Évolution sur la période/ })).toBeInTheDocument()
    expect(screen.getByText('Sep 2026')).toBeInTheDocument()
    expect(screen.getByText('Oct 2026')).toBeInTheDocument()
    // Totals: 3 sold, 8 reservations created.
    const totals = [...container.querySelectorAll('.monthly-kpi')].map((el) => el.textContent)
    expect(totals.slice(0, 2)).toEqual(['3Vendus', '8Réservés'])
  })

  it('shows the amount of each bucket in « Montant » mode', async () => {
    render(<MonthlyChart performance={PERFORMANCE} loading={false} />)
    await userEvent.click(screen.getByRole('button', { name: /Montant/ }))
    expect(screen.getByRole('button', { name: /Montant/ })).toHaveClass('active')
  })

  it('shows « Aucune donnée sur la période » for an empty series', () => {
    render(<MonthlyChart performance={{ granularity: 'day', series: [] }} loading={false} />)
    expect(screen.getByText('Aucune donnée sur la période')).toBeInTheDocument()
  })

  it('shows a skeleton while loading', () => {
    const { container } = render(<MonthlyChart performance={null} loading />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })
})
