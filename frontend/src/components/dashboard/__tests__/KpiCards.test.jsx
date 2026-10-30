import { render, screen, within } from '@testing-library/react'
import KpiCards from '../KpiCards'

const STATS = {
  period: { date_from: '2026-10-01', date_to: '2026-10-31' },
  previous_period: { date_from: '2026-08-31', date_to: '2026-09-30' },
  flow: { lots_vendus: 4, ca: 1200000, reservations_creees: 8, taux_conversion: 50, encaissements: 350000 },
  flow_previous: { lots_vendus: 2, ca: 1000000, reservations_creees: 8, taux_conversion: 25, encaissements: 0 },
  variations: { lots_vendus: 100, ca: 20, reservations_creees: 0, taux_conversion: 100, encaissements: null },
  state: { available: 42, option: 3 },
  state_kpis_available: true,
  flow_kpis_available: true,
  history_start: '2026-10-10',
}

const card = (label) => screen.getByText(label).closest('.period-kpi-card')

describe('KpiCards', () => {
  it('renders the flow and state values with their variations', () => {
    render(<KpiCards stats={STATS} loading={false} />)

    expect(within(card('Lots vendus')).getByText('4')).toBeInTheDocument()
    expect(within(card('Lots vendus')).getByText('▲ 100 %')).toBeInTheDocument()
    expect(within(card('CA')).getByText('1.2M MAD')).toBeInTheDocument()
    expect(within(card('CA')).getByText('▲ 20 %')).toBeInTheDocument()
    expect(within(card('Réservations créées')).getByText('8')).toBeInTheDocument()
    expect(within(card('Réservations créées')).getByText('= 0 %')).toBeInTheDocument()
    expect(within(card('Taux de conversion')).getByText('50 %')).toBeInTheDocument()
    expect(within(card('Encaissements')).getByText('350K MAD')).toBeInTheDocument()
    expect(within(card('Encaissements')).getByText('—')).toBeInTheDocument()
    expect(screen.getAllByText('vs période précédente')).toHaveLength(5)

    expect(within(card('Disponibles au 31/10/2026')).getByText('42')).toBeInTheDocument()
    expect(within(card('En option au 31/10/2026')).getByText('3')).toBeInTheDocument()
  })

  it('explains each flow KPI in a tooltip', () => {
    render(<KpiCards stats={STATS} loading={false} />)
    for (const title of [
      'Réservations engagées sur la période',
      'Prix total convenu des réservations engagées sur la période',
      'Réservations créées sur la période, toutes étapes',
      'Lots vendus ÷ réservations créées sur la même période (peut dépasser 100 %)',
      "Sommes reçues sur la période (versements à l'engagement et échéances)",
    ]) {
      expect(screen.getByTitle(title)).toBeInTheDocument()
    }
  })

  it('shows a skeleton with aria-busy while loading', () => {
    const { container } = render(<KpiCards stats={null} loading />)
    const region = container.querySelector('[aria-busy="true"]')
    expect(region).not.toBeNull()
    expect(region.querySelectorAll('.period-kpi-card')).toHaveLength(7)
    expect(screen.queryByText('Lots vendus')).toBeNull()
  })

  it('replaces unavailable values with notices', () => {
    render(
      <KpiCards
        stats={{ ...STATS, flow_kpis_available: false, state_kpis_available: false }}
        loading={false}
      />,
    )

    const flowNotice = 'Ventes, CA et conversion disponibles à partir du 10/10/2026'
    const stateNotice = 'Situation des lots disponible à partir du 10/10/2026'
    expect(within(card('Lots vendus')).getByText(flowNotice)).toBeInTheDocument()
    expect(within(card('CA')).getByText(flowNotice)).toBeInTheDocument()
    expect(within(card('Taux de conversion')).getByText(flowNotice)).toBeInTheDocument()
    expect(within(card('Disponibles au 31/10/2026')).getByText(stateNotice)).toBeInTheDocument()
    expect(within(card('En option au 31/10/2026')).getByText(stateNotice)).toBeInTheDocument()

    // Reservations created and cash-ins stay visible.
    expect(within(card('Réservations créées')).getByText('8')).toBeInTheDocument()
    expect(within(card('Encaissements')).getByText('350K MAD')).toBeInTheDocument()
    expect(within(card('Lots vendus')).queryByText('4')).toBeNull()
    expect(within(card('Disponibles au 31/10/2026')).queryByText('42')).toBeNull()
  })

  it('renders nothing without stats once loaded', () => {
    const { container } = render(<KpiCards stats={null} loading={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
