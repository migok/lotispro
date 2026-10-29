import { useEffect, useState } from 'react';
import { loadInternationalPhoneInput, loadedInternationalPhoneInput } from './lazyInternationalPhoneInput';

/**
 * Champ téléphone chargé à la demande (drapeaux + sélecteur ~100 Ko gzip hors du
 * bundle principal). En attendant : champ texte simple, la saisie « +33… » reste possible.
 */
export default function LazyPhoneInput({ id, value, onChange, disabled, error, describedBy, label }) {
  const [Loaded, setLoaded] = useState(loadedInternationalPhoneInput);
  useEffect(() => {
    if (Loaded) return undefined;
    let active = true;
    loadInternationalPhoneInput().then(
      (component) => { if (active) setLoaded(() => component); },
      () => {} // échec réseau : on garde le champ simple
    );
    return () => { active = false; };
  }, [Loaded]);

  if (Loaded) {
    return (
      <Loaded id={id} label={label} value={value} onChange={onChange}
        disabled={disabled} error={error} describedBy={describedBy} />
    );
  }
  return (
    <input id={id} type="tel" className={`field-input${error ? ' has-error' : ''}`}
      value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      placeholder="Numéro de téléphone" aria-invalid={!!error} aria-describedby={describedBy} />
  );
}
