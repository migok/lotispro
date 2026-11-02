import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';
import { Card, CardHeader, CardTitle, CardContent } from '../card';
import { StatusBadge } from '../status-badge';
import { StatTile } from '../stat-tile';
import { EmptyState } from '../empty-state';
import { Skeleton, LoadingSkeleton } from '../skeleton';
import { DataTable } from '../data-table';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../dialog';
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from '../sheet';
import { Tooltip } from '../tooltip';
import { ConfirmDialog } from '../confirm-dialog';

describe('Button', () => {
  it('activates with the keyboard and defaults to a non-submit button', async () => {
    const click = vi.fn();
    render(<Button onClick={click}>Enregistrer</Button>);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
  it('disables a pending action and exposes its busy state', async () => {
    const click = vi.fn();
    render(<Button variant="danger" loading onClick={click}>Retirer</Button>);
    const button = screen.getByRole('button', { name: /Retirer/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveClass('ui-button--danger');
    await userEvent.click(button);
    expect(click).not.toHaveBeenCalled();
  });
  it('can compose a real link', () => {
    render(<Button asChild variant="ghost"><a href="/app/clients">Clients</a></Button>);
    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/app/clients');
  });
});

describe('StatusBadge', () => {
  it('exposes the workflow label and semantic token', () => {
    render(<StatusBadge status="edl_realise" />);
    const badge = screen.getByText('EDL réalisé');
    expect(badge).toHaveAttribute('data-status', 'edl_realise');
    expect(badge.style.getPropertyValue('--badge-color')).toBe('var(--color-edl-realise)');
  });
  it('labels an unknown status without inventing a workflow state', () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText('Statut inconnu')).toBeInTheDocument();
  });
});

describe('Card and EmptyState', () => {
  it('keeps heading hierarchy and content semantics', () => {
    render(<Card><CardHeader><CardTitle>Clients</CardTitle></CardHeader><CardContent>Contenu</CardContent></Card>);
    expect(screen.getByRole('heading', { level: 2, name: 'Clients' })).toBeInTheDocument();
    expect(screen.getByText('Contenu')).toBeInTheDocument();
  });
  it('lets an empty state action be reached by keyboard', async () => {
    const action = vi.fn();
    render(<EmptyState title="Aucun client" description="Ajoutez un client pour commencer." action={<Button onClick={action}>Ajouter un client</Button>} />);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard(' ');
    expect(action).toHaveBeenCalledOnce();
  });
});

describe('Skeleton', () => {
  it('hides decorative blocks and announces one loading state', () => {
    render(<LoadingSkeleton label="Chargement des clients" rows={3} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveTextContent('Chargement des clients');
    expect(region.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
  it('renders an inert standalone placeholder', () => {
    const { container } = render(<Skeleton className="extra" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).not.toHaveAttribute('tabindex');
  });
});

describe('StatTile and Tooltip', () => {
  it('shows a missing value as a dash and an actual zero as zero', () => {
    render(<><StatTile label="CA" value={null} currency /><StatTile label="Lots" value={0} /></>);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
  it('discloses the exact compact amount on keyboard focus', async () => {
    render(<StatTile label="CA" value={999999} currency />);
    expect(screen.getByText('1 M MAD')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('999 999 MAD');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });
  it('supports a touch-style click as well as focus', async () => {
    render(<Tooltip content="Prix exact"><button>Information</button></Tooltip>);
    await userEvent.click(screen.getByRole('button', { name: 'Information' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Prix exact');
  });
});

describe('Dialog and Sheet', () => {
  it('names the dialog, traps keyboard focus, closes on Escape and returns focus', async () => {
    render(<Dialog><DialogTrigger asChild><Button>Ouvrir</Button></DialogTrigger><DialogContent><DialogTitle>Modifier le client</DialogTitle><DialogDescription>Informations du client</DialogDescription><label>Nom<input /></label></DialogContent></Dialog>);
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Modifier le client' });
    expect(dialog).toHaveAccessibleDescription('Informations du client');
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('provides an accessible wide sheet with a close button', async () => {
    render(<Sheet><SheetTrigger asChild><Button>Voir le lot</Button></SheetTrigger><SheetContent><SheetTitle>Lot 12</SheetTitle><SheetDescription>Détails du lot</SheetDescription>Contenu</SheetContent></Sheet>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Voir le lot' }));
    expect(await screen.findByRole('dialog', { name: 'Lot 12' })).toHaveClass('ui-sheet');
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

const columns = [{ key: 'name', header: 'Nom', sortable: true }, { key: 'amount', header: 'Montant', sortable: true, align: 'right' }];
const rows = [{ id: 1, name: 'Zahra', amount: 30 }, { id: 2, name: 'Amine', amount: 2 }, { id: 3, name: 'Nadia', amount: 100 }];
describe('DataTable', () => {
  it('sorts numerically without mutating the source and exposes aria-sort', async () => {
    render(<DataTable columns={columns} data={rows} caption="Clients" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Montant' }));
    const rendered = screen.getAllByRole('row').slice(1);
    expect(rendered.map((row) => within(row).getAllByRole('cell')[1].textContent)).toEqual(['2', '30', '100']);
    expect(screen.getByRole('columnheader', { name: 'Montant' })).toHaveAttribute('aria-sort', 'ascending');
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });
  it('paginates by keyboard and clamps the page after a data change', async () => {
    const { rerender } = render(<DataTable columns={columns} data={rows} pageSize={2} caption="Clients" />);
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Page suivante' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Nadia')).toBeInTheDocument();
    expect(screen.queryByText('Zahra')).not.toBeInTheDocument();
    rerender(<DataTable columns={columns} data={rows.slice(0, 1)} pageSize={2} caption="Clients" />);
    expect(screen.getByText('Zahra')).toBeInTheDocument();
  });
  it('distinguishes empty, loading and failed states', () => {
    const { rerender } = render(<DataTable columns={columns} data={[]} caption="Clients" />);
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
    rerender(<DataTable columns={columns} data={[]} loading caption="Clients" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    rerender(<DataTable columns={columns} data={[]} error="Chargement impossible" caption="Clients" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Chargement impossible');
    expect(screen.queryByText('Aucun résultat')).not.toBeInTheDocument();
  });
});

function ConfirmationHarness({ onConfirm }) {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Déclencher</Button><ConfirmDialog open={open} onOpenChange={setOpen} title="Retirer le commercial ?" description="Il perdra l’accès à ce projet." confirmLabel="Retirer" onConfirm={onConfirm} /></>;
}
describe('ConfirmDialog', () => {
  it('cancels without performing the action and returns focus', async () => {
    const confirm = vi.fn();
    render(<ConfirmationHarness onConfirm={confirm} />);
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Déclencher' });
    await user.click(trigger);
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Retirer le commercial ?');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('prevents duplicate execution and dismissal while pending', async () => {
    let finish;
    const confirm = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(<ConfirmationHarness onConfirm={confirm} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Déclencher' }));
    await user.click(await screen.findByRole('button', { name: 'Retirer' }));
    expect(screen.getByRole('button', { name: /Retirer/ })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
  it('keeps the dialog open and announces a failed action', async () => {
    render(<ConfirmationHarness onConfirm={async () => { throw new Error('Retrait impossible'); }} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Déclencher' }));
    await user.click(await screen.findByRole('button', { name: 'Retirer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Retrait impossible');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
