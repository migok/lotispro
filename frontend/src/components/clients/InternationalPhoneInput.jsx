import { useRef, useState } from 'react';
import PhoneInput, { getCountryCallingCode } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import labels from 'react-phone-number-input/locale/fr';
import 'react-phone-number-input/style.css';
import './internationalPhoneInput.css';

const searchable = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Bundled SVGs also render on Windows, where emoji country flags are unavailable.
function CountryFlag({ country }) {
  const Flag = flags[country];
  return Flag ? <Flag className="client-phone-flag" aria-hidden="true" /> : <span aria-hidden="true">🌐</span>;
}

function CountrySelect({ value, onChange, options, disabled, readOnly, onFocus, onBlur, 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trigger = useRef(null);
  const selected = options.find((option) => option.value === value);
  const choose = (country) => {
    onChange(country);
    setOpen(false);
    setQuery('');
    trigger.current?.focus();
  };
  const matches = options.filter((option) => !option.divider && searchable(
    `${option.label} ${option.value ? `+${getCountryCallingCode(option.value)}` : ''}`
  ).includes(searchable(query)));

  return (
    <div className="client-phone-country" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
      <button type="button" ref={trigger} className="client-phone-trigger"
        disabled={disabled || readOnly} aria-label={ariaLabel || 'Indicatif du pays'}
        aria-expanded={open} aria-haspopup="dialog"
        title={selected?.label} onFocus={onFocus} onBlur={onBlur}
        onClick={() => { setOpen(!open); setQuery(''); }}>
        <CountryFlag country={value} />
        <span>{value ? `+${getCountryCallingCode(value)}` : 'Indicatif'}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="client-phone-picker" role="dialog" aria-label="Choisir un indicatif">
          <input autoFocus type="search" className="field-input"
            aria-label="Rechercher un pays ou un indicatif" placeholder="Pays ou indicatif…"
            value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="client-phone-options">
            {matches.map((option) => (
              <button type="button" key={option.value || 'international'}
                className="client-phone-option" aria-pressed={option.value === value}
                aria-label={`${option.label}${option.value ? ` +${getCountryCallingCode(option.value)}` : ''}`}
                onClick={() => choose(option.value)}>
                <CountryFlag country={option.value} />
                <span>{option.label}</span>
                {option.value && <span>+{getCountryCallingCode(option.value)}</span>}
              </button>
            ))}
            {!matches.length && <p className="client-form-hint">Aucun pays trouvé</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InternationalPhoneInput({ id, value, onChange, disabled, error, label }) {
  return (
    <PhoneInput id={id} value={value || undefined} onChange={(phone) => onChange(phone || '')}
      labels={labels} flags={flags} countrySelectComponent={CountrySelect}
      countrySelectProps={{ 'aria-label': `Indicatif ${label}` }}
      numberInputProps={{ className: `field-input${error ? ' has-error' : ''}`, 'aria-invalid': !!error }}
      className="client-phone" disabled={disabled} placeholder="Numéro de téléphone"
      smartCaret={false} />
  );
}
