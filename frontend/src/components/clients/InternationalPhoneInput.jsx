import { forwardRef, useRef, useState } from 'react';
import PhoneInput, { getCountryCallingCode } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import frLabels from 'react-phone-number-input/locale/fr';
import 'react-phone-number-input/style.css';
import './internationalPhoneInput.css';

// Mêmes noms que les suggestions « Pays (étranger) » du formulaire.
const labels = {
  ...frLabels,
  GB: 'Royaume-Uni',
  US: 'États-Unis',
  AE: 'Émirats arabes unis',
  SA: 'Arabie saoudite',
};

// Autres noms trouvés par la recherche (en plus du nom français et de l'indicatif).
const SEARCH_ALIASES = {
  GB: 'Grande-Bretagne Angleterre UK United Kingdom',
  US: 'USA Amérique United States',
  AE: 'EAU UAE Dubaï Abu Dhabi',
  SA: 'KSA Saudi Arabia',
  MA: 'Morocco',
  NL: 'Hollande Netherlands',
  DE: 'Germany',
  ES: 'Spain',
  BE: 'Belgium',
  IT: 'Italy',
  CH: 'Switzerland',
};

const COUNTRY_ORDER = ['MA', 'FR', 'ES', 'BE', 'IT', 'DE', 'NL', 'CH', 'GB', 'CA', 'US', 'AE', 'SA', 'QA', '|', '...'];

const LEGACY_HINT = 'Ancien numéro sans indicatif : choisissez le pays (ex. Maroc) pour le convertir.';

const searchable = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const callingCode = (country) => (country ? `+${getCountryCallingCode(country)}` : '');
const keepFocus = (event) => event.preventDefault();

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
  const needle = searchable(query);
  const matches = options.filter((option) => (option.divider
    ? !needle
    : searchable(`${option.label} ${SEARCH_ALIASES[option.value] ?? ''} ${callingCode(option.value)}`).includes(needle)));
  const first = matches.find((option) => !option.divider);

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
      {/* preventDefault sur mousedown : Safari ne donne pas le focus aux boutons,
          un clic ne doit donc pas faire perdre le focus (et fermer la liste). */}
      <button type="button" ref={trigger} className="client-phone-trigger"
        disabled={disabled || readOnly} aria-label={ariaLabel || 'Indicatif du pays'}
        aria-expanded={open} aria-haspopup="dialog"
        title={selected?.label} onFocus={onFocus} onBlur={onBlur} onMouseDown={keepFocus}
        onClick={() => { setOpen(!open); setQuery(''); }}>
        <CountryFlag country={value} />
        <span>{value ? callingCode(value) : 'Indicatif'}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="client-phone-picker" role="dialog" aria-label="Choisir un indicatif">
          <input autoFocus type="search" className="field-input"
            aria-label="Rechercher un pays ou un indicatif" placeholder="Pays ou indicatif…"
            value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // Entrée choisit le premier pays trouvé au lieu d'envoyer le formulaire.
              event.preventDefault();
              if (first) choose(first.value);
            }} />
          <div className="client-phone-options" onMouseDown={keepFocus}>
            {matches.map((option, index) => (option.divider
              ? <hr key={`divider-${index}`} className="client-phone-divider" />
              : (
                <button type="button" key={option.value || 'international'}
                  className="client-phone-option" aria-pressed={option.value === value}
                  aria-label={`${option.label}${option.value ? ` ${callingCode(option.value)}` : ''}`}
                  onClick={() => choose(option.value)}>
                  <CountryFlag country={option.value} />
                  <span className="client-phone-option-label">{option.label}</span>
                  {option.value && <span>{callingCode(option.value)}</span>}
                </button>
              )))}
            {!first && <p className="client-form-hint">Aucun pays trouvé</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const INTERNATIONAL_PREFIX = /^\s*0\s*0/;

// Un numéro commençant par « 00 » est international : on le réécrit en « + »
// avant que la bibliothèque ne l'analyse comme un numéro national du pays choisi.
const NumberInput = forwardRef(function NumberInput({ onChange, ...props }, ref) {
  return (
    <input {...props} ref={ref} onChange={(event) => {
      const { value } = event.target;
      if (INTERNATIONAL_PREFIX.test(value)) event.target.value = `+${value.replace(INTERNATIONAL_PREFIX, '')}`;
      onChange(event);
    }} />
  );
});

export default function InternationalPhoneInput({ id, value, onChange, disabled, error, label, describedBy }) {
  // Numéro enregistré avant l'indicatif obligatoire (ex. 0612345678) : pas de migration,
  // choisir le pays le convertit. Pas d'indication sur un champ désactivé (WhatsApp = téléphone).
  const legacy = !disabled && !!value && !value.startsWith('+');
  const hintId = `${id}-legacy-hint`;
  const description = [legacy && hintId, describedBy].filter(Boolean).join(' ') || undefined;
  return (
    <>
      <PhoneInput id={id} value={value || undefined} onChange={(phone) => onChange(phone || '')}
        labels={labels} flags={flags} countrySelectComponent={CountrySelect}
        countryOptionsOrder={COUNTRY_ORDER} inputComponent={NumberInput}
        countrySelectProps={{ 'aria-label': `Indicatif ${label}` }}
        numberInputProps={{
          className: `field-input${error ? ' has-error' : ''}`,
          'aria-invalid': !!error,
          'aria-describedby': description,
        }}
        className="client-phone" disabled={disabled} placeholder="Numéro de téléphone"
        smartCaret={false} />
      {legacy && <span id={hintId} className="client-form-hint">{LEGACY_HINT}</span>}
    </>
  );
}
