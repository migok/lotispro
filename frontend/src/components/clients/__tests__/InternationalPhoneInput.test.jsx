import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InternationalPhoneInput from '../InternationalPhoneInput';

function Harness({ initial = '' }) {
  const [value, setValue] = useState(initial);
  return <>
    <label htmlFor="phone">Téléphone</label>
    <InternationalPhoneInput id="phone" label="téléphone" value={value} onChange={setValue} />
    <output data-testid="value">{value}</output>
  </>;
}

const trigger = () => screen.getByRole('button', { name: 'Indicatif téléphone' });

async function chooseCountry(user, search, name) {
  await user.click(screen.getByRole('button', { name: 'Indicatif téléphone' }));
  await user.type(screen.getByRole('searchbox'), search);
  await user.click(screen.getByRole('button', { name }));
}

describe('InternationalPhoneInput', () => {
  it('starts without a country or an imposed +212', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Indicatif téléphone' })).toHaveTextContent('Indicatif');
    expect(screen.getByLabelText('Téléphone')).toHaveValue('');
    expect(screen.getByTestId('value')).toBeEmptyDOMElement();
  });

  it.each([
    ['France', /France \+33/, '0612345678', '+33612345678'],
    ['+212', /Maroc \+212/, '0612345678', '+212612345678'],
    ['Italie', /Italie \+39/, '0212345678', '+390212345678'],
    ['Canada', /Canada \+1/, '4165550123', '+14165550123'],
  ])('uses the selected country %s to convert the national number', async (search, name, national, expected) => {
    const user = userEvent.setup();
    render(<Harness />);
    await chooseCountry(user, search, name);
    await user.type(screen.getByLabelText('Téléphone'), national);
    expect(screen.getByTestId('value')).toHaveTextContent(expected);
  });

  it('infers the flag and calling code from an existing international number', () => {
    render(<Harness initial="+33612345678" />);
    const trigger = screen.getByRole('button', { name: 'Indicatif téléphone' });
    expect(trigger).toHaveTextContent('+33');
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('+33612345678');
  });

  it('accepts pasting an international number without selecting a country', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('Téléphone'));
    await user.paste('+33 6 12 34 56 78');
    expect(screen.getByTestId('value')).toHaveTextContent('+33612345678');
    expect(screen.getByRole('button', { name: 'Indicatif téléphone' })).toHaveTextContent('+33');
  });

  it('shows bundled flags, searches without accents and closes with Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Indicatif téléphone' });
    await user.click(trigger);
    await user.type(screen.getByRole('searchbox'), 'etats-unis');
    const country = screen.getByRole('button', { name: /^États-Unis.*\+1/ });
    expect(country.querySelector('svg')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    ['Maroc', /Maroc \+212/, '0033 6 12 34 56 78', '+33612345678', '+33', 'France'],
    ['France', /France \+33/, '00212 6 12 34 56 78', '+212612345678', '+212', 'Maroc'],
  ])('pasting a "00" number with %s selected switches to the dialled country', async (search, name, pasted, expected, code, country) => {
    const user = userEvent.setup();
    render(<Harness />);
    await chooseCountry(user, search, name);
    await user.click(screen.getByLabelText('Téléphone'));
    await user.paste(pasted);
    expect(screen.getByTestId('value')).toHaveTextContent(expected);
    expect(trigger()).toHaveTextContent(code);
    expect(trigger()).toHaveAttribute('title', country);
    expect(trigger().querySelector('svg')).toBeInTheDocument();
  });

  it('typing a "00" number with Maroc selected switches to France', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await chooseCountry(user, 'Maroc', /Maroc \+212/);
    await user.type(screen.getByLabelText('Téléphone'), '0033612345678');
    expect(screen.getByTestId('value')).toHaveTextContent('+33612345678');
    expect(trigger()).toHaveTextContent('+33');
  });

  it('accepts a "00" number without selecting a country', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('Téléphone'));
    await user.paste('0033 6 12 34 56 78');
    expect(screen.getByTestId('value')).toHaveTextContent('+33612345678');
    expect(trigger()).toHaveTextContent('+33');
  });

  it('selects the first match on Enter in the search box without submitting the form', async () => {
    const user = userEvent.setup();
    const submit = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={submit}><Harness /><button type="submit">Enregistrer</button></form>);
    await user.click(trigger());
    await user.type(screen.getByRole('searchbox'), 'maroc{Enter}');
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('+212');
  });

  it('selects a clicked option even when the browser blurs without a related target (Safari)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    await user.type(screen.getByRole('searchbox'), 'france');
    const option = screen.getByRole('button', { name: /France \+33/ });
    // Safari ne donne pas le focus aux boutons : sans preventDefault sur
    // mousedown, le champ de recherche perd le focus vers <body>.
    if (fireEvent.mouseDown(option)) {
      fireEvent.focusOut(screen.getByRole('searchbox'), { relatedTarget: null });
    }
    fireEvent.click(option);
    expect(trigger()).toHaveTextContent('+33');
  });

  it('lists the usual countries first, then a separator, with French names and aliases', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    const dialog = screen.getByRole('dialog');
    const names = [...dialog.querySelectorAll('.client-phone-option')].slice(0, 14)
      .map((option) => option.querySelector('.client-phone-option-label').textContent);
    expect(names).toEqual([
      'Maroc', 'France', 'Espagne', 'Belgique', 'Italie', 'Allemagne', 'Pays-Bas', 'Suisse',
      'Royaume-Uni', 'Canada', 'États-Unis', 'Émirats arabes unis', 'Arabie saoudite', 'Qatar',
    ]);
    const separator = screen.getByRole('separator');
    expect(dialog.querySelectorAll('.client-phone-option')[13].nextElementSibling).toBe(separator);

    await user.type(screen.getByRole('searchbox'), 'angleterre');
    expect(screen.getByRole('button', { name: 'Royaume-Uni +44' })).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'usa');
    expect(screen.getByRole('button', { name: 'États-Unis +1' })).toBeInTheDocument();
  });

  it('hints how to convert a legacy number stored without a dial code', async () => {
    const user = userEvent.setup();
    render(<Harness initial="0612345678" />);
    const hint = 'Ancien numéro sans indicatif : choisissez le pays (ex. Maroc) pour le convertir.';
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(screen.getByLabelText('Téléphone')).toHaveAccessibleDescription(hint);
    await chooseCountry(user, 'Maroc', /Maroc \+212/);
    expect(screen.getByTestId('value')).toHaveTextContent('+212612345678');
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it('links the number input to the given description', () => {
    render(<>
      <InternationalPhoneInput id="p" label="téléphone" value="" onChange={() => {}} error="Erreur" describedBy="p-error" />
      <span id="p-error">Erreur</span>
    </>);
    const input = screen.getByPlaceholderText('Numéro de téléphone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Erreur');
  });
});
