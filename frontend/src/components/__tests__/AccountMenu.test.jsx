import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountMenu from '../AccountMenu';

it.each(['Se déconnecter', 'Passer en mode clair'])('keeps %s clickable after a blur with null relatedTarget', async (action) => {
  const onLogout = vi.fn(), toggleTheme = vi.fn();
  render(<AccountMenu user={{ name: 'Nadia', role: 'manager' }} theme="dark" onLogout={onLogout} toggleTheme={toggleTheme} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'Compte : Nadia' });
  await user.click(trigger);
  fireEvent.blur(trigger, { relatedTarget: null });
  await user.click(screen.getByRole('button', { name: action }));
  expect(action === 'Se déconnecter' ? onLogout : toggleTheme).toHaveBeenCalledOnce();
});

it('closes on Escape even after focus left the browser control', async () => {
  render(<AccountMenu user={{ name: 'Nadia' }} theme="dark" onLogout={() => {}} toggleTheme={() => {}} />);
  const trigger = screen.getByRole('button', { name: 'Compte : Nadia' });
  await userEvent.click(trigger);
  fireEvent.blur(trigger, { relatedTarget: null });
  expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('still closes on an outside pointer click', async () => {
  render(<><AccountMenu user={{ name: 'Nadia' }} theme="dark" onLogout={() => {}} toggleTheme={() => {}} /><button>Autre action</button></>);
  await userEvent.click(screen.getByRole('button', { name: 'Compte : Nadia' }));
  await userEvent.click(screen.getByRole('button', { name: 'Autre action' }));
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).not.toBeInTheDocument();
});
