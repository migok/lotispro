import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrendChart from '../TrendChart';

afterEach(() => vi.unstubAllGlobals());
it('exposes the real plotted buckets through the keyboard tooltip', async () => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.callback = callback; }
    observe() { this.callback([{ contentRect: { width: 800, height: 260 } }]); }
    unobserve() {}
    disconnect() {}
  });
  render(<TrendChart salesAvailable series={[
    { key: '2026-11-01', lots_vendus: 2, reservations_creees: 3 },
    { key: '2026-11-02', lots_vendus: 3, reservations_creees: 4 },
  ]} />);
  const chart = await screen.findByRole('application');
  await act(async () => chart.focus());
  const user = userEvent.setup();
  const tooltip = document.querySelector('.recharts-tooltip-wrapper');
  await waitFor(() => expect(tooltip).toHaveTextContent('01/11'));
  expect(tooltip).toHaveTextContent('Lots vendus : 2');
  expect(tooltip).toHaveTextContent('Réservations créées : 3');
  await user.keyboard('{ArrowRight}');
  await waitFor(() => expect(tooltip).toHaveTextContent('02/11'));
  expect(tooltip).toHaveTextContent('Lots vendus : 3');
  expect(tooltip).toHaveTextContent('Réservations créées : 4');
});
