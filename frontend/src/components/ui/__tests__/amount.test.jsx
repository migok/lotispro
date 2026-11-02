import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Amount } from '../amount';
import { InfoTip } from '../info-tip';

it('shows a compact amount without leading space and exposes its exact value', async () => {
  render(<Amount value={1250000} />);
  const value = screen.getByRole('button', { name: '1 250 000 MAD' });
  expect(value.textContent).toBe('1,3 M MAD');
  await userEvent.click(value);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('1 250 000 MAD');
});

it('opens a named information tip from the keyboard', async () => {
  render(<InfoTip text="Montant calculé par le serveur" />);
  const trigger = screen.getByRole('button', { name: 'Montant calculé par le serveur' });
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Montant calculé par le serveur');
});
