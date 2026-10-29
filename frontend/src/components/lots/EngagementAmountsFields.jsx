import { useId } from 'react';
import { formatMad } from '../../utils/formatters';
import { engagementAmountsErrors, gapAmount, parseAmount } from '../../utils/engagePayload';

const GAP_TIMINGS = [
  { value: 'debut', label: 'Au début', desc: 'Avec le premier acompte' },
  { value: 'fin', label: 'À la fin', desc: 'Avec la dernière échéance' },
  { value: 'date', label: 'À une date', desc: 'Date précise' },
];

/**
 * « (−0,30 %) » : écart du prix convenu au prix catalogue, en % du catalogue, signé, au centième
 * (calculé en centimes, sans bruit flottant). Vide si le catalogue est nul ou si l'écart arrondi
 * vaut 0,00 %.
 */
function cataloguePctText(agreed, cataloguePrice) {
  const catalogueCents = Math.round(cataloguePrice * 100);
  if (!catalogueCents) return '';
  const diffCents = Math.round(agreed * 100) - catalogueCents;
  // hundredths of a percent, rounded half away from zero
  const hundredths = Math.round(Math.abs(diffCents) * 10000 / catalogueCents);
  if (!hundredths) return '';
  const text = `${Math.floor(hundredths / 100)},${String(hundredths % 100).padStart(2, '0')}`;
  return ` (${diffCents < 0 ? '−' : '+'}${text}\u00a0%)`;
}

function FieldError({ message }) {
  if (!message) return null;
  return <span className="client-form-error" role="alert">{message}</span>;
}

/**
 * Montants d'un engagement (spec E4-T5), mêmes libellés partout :
 * « Prix catalogue » (lecture seule), « Prix total convenu », « Prix figurant sur l'acte »,
 * « Écart à régulariser » (calculé = convenu − acte, jamais saisi), « Échéance de l'écart »
 * (au début / à la fin / à une date) et « Premier acompte reçu ».
 *
 * Contrôlé : `value` = { agreedTotalPrice, salePrice, gapDueTiming, gapDueDate, firstPayment }
 * (valeurs de formulaire), `onChange(nextValue)`.
 * `firstPayment` (nombre, facultatif) : premier acompte non saisi (garantie déduite,
 * modification d'une réservation) — affiché en lecture seule, avec `firstPaymentHint`.
 * `salePriceHint` (facultatif) : aide sous le prix sur l'acte (calcul prix/m² × surface).
 * Les erreurs sont affichées en ligne ; le parent bloque l'envoi avec `engagementAmountsErrors`.
 */
export default function EngagementAmountsFields({
  cataloguePrice,
  value,
  onChange,
  firstPayment,
  firstPaymentHint,
  salePriceHint,
}) {
  const id = useId();
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  const errors = engagementAmountsErrors(value, { firstPayment });
  const gap = gapAmount(value.agreedTotalPrice, value.salePrice);
  const firstPaymentReadOnly = firstPayment != null;
  const agreed = parseAmount(value.agreedTotalPrice);

  return (
    <>
      <div className="msr-field-group">
        <span className="msr-label">Prix catalogue</span>
        <div className="msr-info-pill">
          <span className="msr-info-pill-value">{cataloguePrice != null ? formatMad(cataloguePrice) : '—'}</span>
        </div>
      </div>

      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-agreed`}>Prix total convenu</label>
        <div className="msr-price-input-wrap">
          <input id={`${id}-agreed`} type="number" className="msr-price-input" min="0" step="0.01"
            placeholder="Montant total demandé au client"
            value={value.agreedTotalPrice} onChange={set('agreedTotalPrice')} />
          <span className="msr-price-input-currency">MAD</span>
        </div>
        {agreed != null && cataloguePrice != null && agreed !== cataloguePrice && (
          <div className={`msr-price-diff msr-price-diff--${agreed < cataloguePrice ? 'down' : 'up'}`}>
            {agreed < cataloguePrice
              ? `${formatMad(cataloguePrice - agreed)} sous le prix catalogue${cataloguePctText(agreed, cataloguePrice)}`
              : `${formatMad(agreed - cataloguePrice)} au-dessus du prix catalogue${cataloguePctText(agreed, cataloguePrice)}`}
          </div>
        )}
        <FieldError message={errors.agreedTotalPrice} />
      </div>

      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-acte`}>Prix figurant sur l'acte</label>
        <div className="msr-price-input-wrap">
          <input id={`${id}-acte`} type="number" className="msr-price-input" min="0" step="0.01"
            placeholder="Prix imprimé sur l'acte"
            value={value.salePrice} onChange={set('salePrice')} />
          <span className="msr-price-input-currency">MAD</span>
        </div>
        {salePriceHint && (
          <div className="msr-price-diff msr-price-diff--eq" style={{ opacity: 0.7 }}>{salePriceHint}</div>
        )}
        <FieldError message={errors.salePrice} />
      </div>

      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-gap`}>Écart à régulariser</label>
        <div className="msr-info-pill">
          <output id={`${id}-gap`} className="msr-info-pill-value">{formatMad(gap)}</output>
          <span className="msr-info-pill-sub">Calculé : prix total convenu − prix figurant sur l'acte</span>
        </div>
      </div>

      {gap > 0 && (
        <div className="msr-field-group">
          <span className="msr-label">Échéance de l'écart</span>
          <div className="msr-validation-choice" style={{ flexDirection: 'row', gap: 8 }}>
            {GAP_TIMINGS.map((t) => (
              <button key={t.value} type="button" aria-pressed={value.gapDueTiming === t.value}
                className={`msr-vc-btn${value.gapDueTiming === t.value ? ' msr-vc-btn--deduct-active' : ''}`}
                style={{ flex: 1 }}
                onClick={() => onChange({ ...value, gapDueTiming: t.value })}>
                <span className="msr-vc-label">{t.label}</span>
                <span className="msr-vc-desc">{t.desc}</span>
              </button>
            ))}
          </div>
          {value.gapDueTiming === 'date' && (
            <>
              <label className="msr-label" htmlFor={`${id}-gap-date`} style={{ marginTop: 8 }}>Date de l'écart</label>
              <input id={`${id}-gap-date`} type="date" className="msr-input"
                value={value.gapDueDate} onChange={set('gapDueDate')} />
            </>
          )}
          <FieldError message={errors.gapDueDate} />
        </div>
      )}

      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-first`}>Premier acompte reçu</label>
        {firstPaymentReadOnly ? (
          <div className="msr-info-pill">
            <output id={`${id}-first`} className="msr-info-pill-value">{formatMad(firstPayment)}</output>
            {firstPaymentHint && <span className="msr-info-pill-sub">{firstPaymentHint}</span>}
          </div>
        ) : (
          <>
            <div className="msr-price-input-wrap">
              <input id={`${id}-first`} type="number" className="msr-price-input" min="0" step="0.01"
                placeholder="Montant reçu"
                value={value.firstPayment} onChange={set('firstPayment')} />
              <span className="msr-price-input-currency">MAD</span>
            </div>
            {firstPaymentHint && <div className="msr-price-diff msr-price-diff--eq">{firstPaymentHint}</div>}
          </>
        )}
        <FieldError message={errors.firstPayment} />
      </div>
    </>
  );
}
