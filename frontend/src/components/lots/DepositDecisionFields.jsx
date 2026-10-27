import { PAYMENT_TYPES } from '../../utils/constants';

/**
 * Decision on money already paid when a reservation is engaged — the RAF
 * guarantee or the option deposit: deduct it, or refund it (amount, date,
 * payment type). Controlled: `choice` ('refund' | 'deduct' | null) and
 * `releaseData` ({ deposit_refund_amount, deposit_refund_date, refund_payment_type }).
 * `icons` (optional): { refund, deduct, money, calendar, payments } nodes.
 */
export default function DepositDecisionFields({
  label,
  amount,
  refundLabel,
  refundDesc,
  deductLabel,
  deductDesc,
  choice,
  onChoiceChange,
  releaseData,
  onReleaseChange,
  icons = {},
}) {
  const setRelease = (field) => (e) => onReleaseChange({ ...releaseData, [field]: e.target.value });

  return (
    <>
      <div className="msr-field-group">
        <label className="msr-label">{label} <span className="msr-required">*</span></label>
        <div className="msr-validation-choice">
          <button type="button"
            className={`msr-vc-btn${choice === 'refund' ? ' msr-vc-btn--refund-active' : ''}`}
            onClick={() => onChoiceChange('refund')}>
            {icons.refund}
            <span className="msr-vc-label">{refundLabel}</span>
            <span className="msr-vc-desc">{refundDesc}</span>
          </button>
          <button type="button"
            className={`msr-vc-btn${choice === 'deduct' ? ' msr-vc-btn--deduct-active' : ''}`}
            onClick={() => onChoiceChange('deduct')}>
            {icons.deduct}
            <span className="msr-vc-label">{deductLabel}</span>
            <span className="msr-vc-desc">{deductDesc}</span>
          </button>
        </div>
      </div>

      {choice === 'refund' && (
        <>
          <div className="msr-field-group">
            <label className="msr-label">{icons.money} Montant remboursé <span className="msr-required">*</span></label>
            <div className="msr-deposit-row">
              <input type="number" className="msr-input" min="0" step="1000"
                placeholder={amount > 0 ? amount.toString() : '0'}
                value={releaseData.deposit_refund_amount}
                onChange={setRelease('deposit_refund_amount')} />
              <span className="msr-currency">MAD</span>
            </div>
          </div>
          <div className="msr-field-group">
            <label className="msr-label">{icons.calendar} Date de remboursement <span className="msr-required">*</span></label>
            <input type="date" className="msr-input"
              value={releaseData.deposit_refund_date}
              onChange={setRelease('deposit_refund_date')} />
          </div>
          <div className="msr-field-group">
            <label className="msr-label">{icons.payments} Mode de remboursement <span className="msr-required">*</span></label>
            <select className="msr-select"
              value={releaseData.refund_payment_type || 'cash'}
              onChange={setRelease('refund_payment_type')}>
              {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </>
      )}
    </>
  );
}
