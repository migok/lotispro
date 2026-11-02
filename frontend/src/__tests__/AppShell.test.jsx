import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { AppContent } from '../App';
import { apiGet } from '../utils/api';
import { renderWithProviders } from '../test/renderWithProviders';
vi.mock('../utils/api', () => ({ apiGet: vi.fn(), apiFetch: vi.fn() }));
beforeEach(() => { apiGet.mockImplementation(async () => []); });

it('labels the active route, translates the role and exposes account controls', async () => {
  renderWithProviders(<Routes><Route path="/app/*" element={<AppContent />} /></Routes>, { route: '/app/clients', user: { role: 'commercial', name: 'Amine', email: 'amine@test.ma' } });
  const desktop = screen.getByRole('complementary', { name: 'Navigation principale' });
  expect(within(desktop).getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page');
  expect(within(desktop).queryByRole('link', { name: 'Gestionnaires' })).not.toBeInTheDocument();
  await userEvent.click(within(desktop).getByRole('button', { name: /Compte/ }));
  expect(within(desktop).getByText('Commercial')).toBeVisible();
  expect(within(desktop).getByText('amine@test.ma')).toBeVisible();
  expect(within(desktop).getByRole('button', { name: /mode clair/i })).toBeVisible();
});

it('traps mobile navigation in a dialog and restores the trigger on Escape', async () => {
  renderWithProviders(<Routes><Route path="/app/*" element={<AppContent />} /></Routes>, { route: '/app/clients', user: { role: 'manager', name: 'Nadia' } });
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'Ouvrir le menu' });
  await user.click(trigger);
  const menu = await screen.findByRole('dialog', { name: 'Navigation' });
  expect(within(menu).getByRole('link', { name: 'Gestionnaires' })).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('closes mobile navigation after a route selection and provides a skip link', async () => {
  renderWithProviders(<Routes><Route path="/app/*" element={<AppContent />} /></Routes>, { route: '/app/clients', user: { role: 'manager', name: 'Nadia' } });
  const user = userEvent.setup();
  expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute('href', '#main-content');
  await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('link', { name: 'Projets' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
