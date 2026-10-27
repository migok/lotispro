import { useState } from 'react';
import { render, screen } from '@testing-library/react';
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
});
