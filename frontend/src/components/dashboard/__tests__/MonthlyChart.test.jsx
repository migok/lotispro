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

  describe('when sales are unavailable before the history start', () => {
    const NOTICE = 'Ventes, CA et conversion disponibles à partir du 15/10/2026'
    const renderUnavailable = () => render(
      <MonthlyChart
        performance={PERFORMANCE}
        loading={false}
        flowKpisAvailable={false}
        historyStart="2026-10-15"
      />,
    )

    it('« Nombre » mode: shows the notice and only the « Réservés » bars, total and legend', () => {
      const { container } = renderUnavailable()

      expect(screen.getByText(NOTICE)).toBeInTheDocument()
      const totals = [...container.querySelectorAll('.monthly-kpi')].map((el) => el.textContent)
      expect(totals).toEqual(['8Réservés'])
      expect(container.querySelectorAll('.chart-bar.sold')).toHaveLength(0)
      expect(container.querySelectorAll('.chart-bar.reserved')).toHaveLength(2)
      expect(container.querySelector('.chart-month-amount')).toBeNull()
      expect(container.querySelector('.legend-dot.sold')).toBeNull()
      expect(container.querySelector('.legend-dot.reserved')).not.toBeNull()
      expect(screen.queryByText('Vendus')).toBeNull()
      expect(screen.queryByText('CA total')).toBeNull()
    })

    it('« Montant » mode: shows the notice instead of the bars', async () => {
      const { container } = renderUnavailable()
      await userEvent.click(screen.getByRole('button', { name: /Montant/ }))

      expect(screen.getByText(NOTICE)).toBeInTheDocument()
      expect(container.querySelectorAll('.chart-bar')).toHaveLength(0)
      expect(container.querySelector('.chart-legend')).toBeNull()
      expect(screen.queryByText('CA total')).toBeNull()
    })
  })

  it('draws sold bars and every total when sales are available', async () => {
    const { container } = render(
      <MonthlyChart
        performance={PERFORMANCE}
        loading={false}
        flowKpisAvailable
        historyStart="2026-01-01"
      />,
    )

    expect(screen.queryByText(/disponibles à partir du/)).toBeNull()
    const totals = [...container.querySelectorAll('.monthly-kpi')].map((el) => el.textContent)
    expect(totals).toHaveLength(3)
    expect(totals.slice(0, 2)).toEqual(['3Vendus', '8Réservés'])
    expect(screen.getByText('CA total')).toBeInTheDocument()
    expect(container.querySelectorAll('.chart-bar.sold')).toHaveLength(2)
    expect(container.querySelector('.legend-dot.sold')).not.toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Montant/ }))
    expect(container.querySelectorAll('.chart-bar.amount')).toHaveLength(2)
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
