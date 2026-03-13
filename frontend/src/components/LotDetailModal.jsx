import { useState, useEffect, useMemo } from 'react';
import { apiGet, apiPost, apiPatch } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatPrice, formatDate } from '../utils/formatters';
import { CLIENT_TYPES, STATUS_LABELS } from '../utils/constants';

/* ── Default payment plan ─────────────────────────────────── */
const DEFAULT_PAYMENT_PLAN = {
  deposit_pct: 50,
  deposit_start_date: '',
  deposit_count: 1,
  deposit_periodicity: 1,
  balance_delay_months: 0,
  balance_count: 1,
  balance_periodicity: 1,
};

const PERIODICITY_OPTIONS = [
  { value: 1, label: 'Mensuel' },
  { value: 2, label: 'Bimestriel' },
  { value: 3, label: 'Trimestriel' },
  { value: 6, label: 'Semestriel' },
  { value: 12, label: 'Annuel' },
];

const DELAY_OPTIONS = [
  { value: 0, label: 'Immédiatement' },
  { value: 1, label: '1 mois' },
  { value: 2, label: '2 mois' },
  { value: 3, label: '3 mois' },
  { value: 6, label: '6 mois' },
  { value: 12, label: '12 mois' },
];

/* ── Date helpers ─────────────────────────────────────────── */
function addMonths(date, months) {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  const y = d.getFullYear() + Math.floor(targetMonth / 12);
  const m = ((targetMonth % 12) + 12) % 12;
  const maxDay = new Date(y, m + 1, 0).getDate();
  d.setFullYear(y, m, Math.min(d.getDate(), maxDay));
  return d;
}
function generateDueDates(start, count, periodicityMonths) {
  return Array.from({ length: count }, (_, i) => addMonths(start, i * periodicityMonths));
}
function splitAmount(total, count) {
  if (count <= 0) return [];
  const base = Math.round(total * 100 / count) / 100;
  const amounts = Array(count).fill(base);
  amounts[count - 1] = Math.round((total - base * (count - 1)) * 100) / 100;
  return amounts;
}
function computePreview(lotPrice, plan) {
  const depPct = Math.min(100, Math.max(0, parseFloat(plan.deposit_pct) || 50));
  const depositTotal = Math.round(lotPrice * depPct) / 100;
  const balanceTotal = Math.round((lotPrice - depositTotal) * 100) / 100;
  const depositStart = plan.deposit_start_date ? new Date(plan.deposit_start_date) : new Date();
  const depCount = Math.max(1, parseInt(plan.deposit_count) || 1);
  const depPeriod = Math.max(1, parseInt(plan.deposit_periodicity) || 1);
  const balCount = Math.max(1, parseInt(plan.balance_count) || 1);
  const balPeriod = Math.max(1, parseInt(plan.balance_periodicity) || 1);
  const balDelay = Math.max(0, parseInt(plan.balance_delay_months) || 0);
  const depositDates = generateDueDates(depositStart, depCount, depPeriod);
  const depositAmounts = splitAmount(depositTotal, depCount);
  const lastDepositDate = depositDates[depositDates.length - 1];
  const balanceStart = addMonths(lastDepositDate, balDelay);
  const balanceDates = generateDueDates(balanceStart, balCount, balPeriod);
  const balanceAmounts = splitAmount(balanceTotal, balCount);
  const depositRows = depositDates.map((d, i) => ({ type: 'deposit', number: i + 1, date: d, amount: depositAmounts[i] }));
  const balanceRows = balanceDates.map((d, i) => ({ type: 'balance', number: i + 1, date: d, amount: balanceAmounts[i] }));
  const allRows = [...depositRows, ...balanceRows].sort((a, b) => a.date - b.date);
  return { depositTotal, balanceTotal, depositRows, balanceRows, allRows, balanceStart };
}
function fmtShort(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Payment timeline (panel view) ───────────────────────── */
function PaymentTimeline({ rows, total }) {
  if (!rows.length) return null;
  return (
    <div className="pay-timeline">
      <div className="pay-timeline-header">
        <span className="pay-timeline-title">Échéancier prévisionnel</span>
        <span className="pay-timeline-total">{formatPrice(total)}</span>
      </div>
      <div className="pay-timeline-list">
        {rows.map((row, i) => (
          <div key={i} className={`pay-tl-row pay-tl-row--${row.type}`}>
            <div className="pay-tl-track">
              <div className={`pay-tl-dot pay-tl-dot--${row.type}`} />
              {i < rows.length - 1 && <div className="pay-tl-line" />}
            </div>
            <div className="pay-tl-content">
              <div className="pay-tl-top">
                <span className={`pay-tl-badge pay-tl-badge--${row.type}`}>
                  {row.type === 'deposit' ? 'Acompte' : 'Solde'} {row.number}
                </span>
                <span className="pay-tl-date">{fmtShort(row.date)}</span>
              </div>
              <div className="pay-tl-amount">{formatPrice(row.amount)}</div>
            </div>
          </div>
        ))}
        <div className="pay-tl-footer">
          <span className="pay-tl-footer-label">Total</span>
          <span className="pay-tl-footer-amount">{formatPrice(total)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── SVG Icons ────────────────────────────────────────────── */
const IcClose = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M2 2l12 12M14 2L2 14" />
  </svg>
);
const IcSurface = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="5" width="13" height="6" rx="1" />
    <path d="M4.5 5V3M7.5 5V4M10.5 5V3" />
  </svg>
);
const IcChart = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="10" width="3.5" height="4.5" rx="0.5" />
    <rect x="6.25" y="6.5" width="3.5" height="8" rx="0.5" />
    <rect x="11.5" y="2.5" width="3.5" height="12" rx="0.5" />
  </svg>
);
const IcPin = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6c0-2.485-2.015-4.5-4.5-4.5z" />
    <circle cx="8" cy="6" r="1.5" />
  </svg>
);
const IcCalendar = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
    <path d="M1.5 6.5h13M5 1v3M11 1v3" />
  </svg>
);
const IcTag = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 1.5h5.5l7 7a2 2 0 010 2.83l-2.17 2.17a2 2 0 01-2.83 0l-7-7V1.5z" />
    <circle cx="4.5" cy="4.5" r="1.25" />
  </svg>
);
const IcHome = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 8L8 2l7 6M2.5 7v7h4v-4h3v4h4V7" />
  </svg>
);
const IcCompass = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M10.5 5.5L9 9l-4 .5 1.5-3.5 4-.5z" />
  </svg>
);
const IcUser = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="5" r="3" />
    <path d="M1.5 14c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
  </svg>
);
const IcCheck = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 8.5l4 4 7-7" />
  </svg>
);
const IcUnlock = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7.5" width="12" height="7" rx="1.5" />
    <path d="M5 7.5V5a3 3 0 016 0" />
  </svg>
);
const IcLock = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7.5" width="12" height="7" rx="1.5" />
    <path d="M5 7.5V5a3 3 0 016 0v2.5" />
  </svg>
);
const IcPlus = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M8 2v12M2 8h12" />
  </svg>
);
const IcPayments = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 6h14M5 3v10M1 9h14" />
  </svg>
);
const IcMoney = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5v7" />
    <path d="M5.5 6.5c0-1.1 1.1-2 2.5-2s2.5.9 2.5 2-1.1 1.5-2.5 1.5S5.5 8.9 5.5 10s1.1 2 2.5 2 2.5-.9 2.5-2" />
  </svg>
);
const IcTable = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 6h14M1 9h14M5 3v10" />
  </svg>
);

/* ── Payment plan configurator ────────────────────────────── */
function PaymentPlanConfigurator({ lotPrice, plan, onChange, panel = false }) {
  const depPct = parseFloat(plan.deposit_pct) || 50;
  const balPct = Math.round((100 - depPct) * 100) / 100;
  const preview = useMemo(() => computePreview(lotPrice, plan), [lotPrice, plan]);
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="pay-plan">
      <div className="pay-plan-split">
        <div className="pay-plan-split-header">
          <span className="pay-plan-split-label">Répartition du paiement</span>
          <span className="pay-plan-split-hint">Total = {formatPrice(lotPrice)}</span>
        </div>
        <div className="pay-plan-split-row">
          <div className="pay-plan-tranche">
            <div className="pay-plan-tranche-name pay-plan-tranche--deposit">Acompte</div>
            <div className="pay-plan-tranche-pct">
              <input type="number" className="pay-plan-pct-input" min="1" max="99" step="1"
                value={plan.deposit_pct}
                onChange={e => onChange({ ...plan, deposit_pct: e.target.value })} />
              <span className="pay-plan-pct-sym">%</span>
            </div>
            <div className="pay-plan-tranche-amount">{formatPrice(preview.depositTotal)}</div>
          </div>
          <div className="pay-plan-divider">+</div>
          <div className="pay-plan-tranche">
            <div className="pay-plan-tranche-name pay-plan-tranche--balance">Solde</div>
            <div className="pay-plan-tranche-pct pay-plan-tranche-pct--derived">
              <span className="pay-plan-pct-val">{balPct}</span>
              <span className="pay-plan-pct-sym">%</span>
            </div>
            <div className="pay-plan-tranche-amount">{formatPrice(preview.balanceTotal)}</div>
          </div>
        </div>
        <div className="pay-plan-bar">
          <div className="pay-plan-bar-deposit" style={{ width: `${depPct}%` }} />
          <div className="pay-plan-bar-balance" style={{ width: `${balPct}%` }} />
        </div>
      </div>

      <div className="pay-plan-dates">
        <div className="pay-plan-date-field">
          <label className="pay-plan-field-label">Date du premier versement acompte</label>
          <input type="date" className="pay-plan-field-input"
            value={plan.deposit_start_date}
            onChange={e => onChange({ ...plan, deposit_start_date: e.target.value })} />
          <span className="pay-plan-date-hint">Laissez vide pour démarrer aujourd'hui</span>
        </div>
      </div>

      <div className="pay-plan-installments">
        {/* ── Acompte section ── */}
        <div className="pay-plan-section pay-plan-section--deposit">
          <div className="pay-plan-section-title pay-plan-section-title--deposit">
            <span>Étalement acompte</span>
            <span className="pay-plan-section-total">{formatPrice(preview.depositTotal)}</span>
          </div>
          <div className="pay-plan-section-row">
            <div className="pay-plan-field">
              <label className="pay-plan-field-label">Nb de versements</label>
              <input type="number" className="pay-plan-field-input" min="1" max="60"
                value={plan.deposit_count}
                onChange={e => onChange({ ...plan, deposit_count: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="pay-plan-field">
              <label className="pay-plan-field-label">Périodicité</label>
              <select className="pay-plan-field-input" value={plan.deposit_periodicity}
                onChange={e => onChange({ ...plan, deposit_periodicity: parseInt(e.target.value) })}>
                {PERIODICITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="pay-plan-per-installment pay-plan-per-installment--deposit">
            <span className="pay-plan-per-label">Par versement</span>
            <span className="pay-plan-per-amount">
              {formatPrice(preview.depositTotal / Math.max(1, parseInt(plan.deposit_count) || 1))}
            </span>
          </div>
          {preview.depositRows.length > 0 && (
            <div className="pay-plan-last-date">
              Dernier acompte : <strong>{fmtShort(preview.depositRows[preview.depositRows.length - 1].date)}</strong>
            </div>
          )}
        </div>

        {/* ── Solde section ── */}
        <div className="pay-plan-section pay-plan-section--balance">
          <div className="pay-plan-section-title pay-plan-section-title--balance">
            <span>Étalement solde</span>
            <span className="pay-plan-section-total">{formatPrice(preview.balanceTotal)}</span>
          </div>
          <div className="pay-plan-field">
            <label className="pay-plan-field-label">Délai avant le 1er versement solde</label>
            <select className="pay-plan-field-input" value={plan.balance_delay_months}
              onChange={e => onChange({ ...plan, balance_delay_months: parseInt(e.target.value) })}>
              {DELAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="pay-plan-section-row">
            <div className="pay-plan-field">
              <label className="pay-plan-field-label">Nb de versements</label>
              <input type="number" className="pay-plan-field-input" min="1" max="120"
                value={plan.balance_count}
                onChange={e => onChange({ ...plan, balance_count: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="pay-plan-field">
              <label className="pay-plan-field-label">Périodicité</label>
              <select className="pay-plan-field-input" value={plan.balance_periodicity}
                onChange={e => onChange({ ...plan, balance_periodicity: parseInt(e.target.value) })}>
                {PERIODICITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="pay-plan-per-installment pay-plan-per-installment--balance">
            <span className="pay-plan-per-label">Par versement</span>
            <span className="pay-plan-per-amount pay-plan-per-amount--balance">
              {formatPrice(preview.balanceTotal / Math.max(1, parseInt(plan.balance_count) || 1))}
            </span>
          </div>
          <div className="pay-plan-last-date pay-plan-last-date--balance">
            1er versement solde : <strong>{fmtShort(preview.balanceStart)}</strong>
          </div>
        </div>
      </div>

      {/* Panel mode: always-visible timeline / Inline mode: toggle + table */}
      {panel ? (
        <PaymentTimeline rows={preview.allRows} total={lotPrice} />
      ) : (
        <>
          <div className="pay-plan-preview-row">
            <button type="button" className={`pay-plan-preview-btn ${showPreview ? 'active' : ''}`}
              onClick={() => setShowPreview(v => !v)}>
              <IcTable />
              {showPreview ? 'Masquer le récapitulatif' : 'Voir le récapitulatif prévisionnel'}
              <span className="pay-plan-preview-count">{preview.allRows.length} versements</span>
            </button>
          </div>
          {showPreview && (
            <div className="pay-plan-preview">
              <div className="pay-plan-preview-header">
                <span className="pay-plan-preview-title">Récapitulatif prévisionnel</span>
                <span className="pay-plan-preview-total">Total : {formatPrice(lotPrice)}</span>
              </div>
              <table className="pay-preview-table">
                <thead>
                  <tr><th>#</th><th>Type</th><th>Date prévisionnelle</th><th>Montant</th></tr>
                </thead>
                <tbody>
                  {preview.allRows.map((row, i) => (
                    <tr key={i} className={`pay-preview-row pay-preview-row--${row.type}`}>
                      <td className="pay-preview-num">{i + 1}</td>
                      <td><span className={`pay-preview-badge pay-preview-badge--${row.type}`}>{row.type === 'deposit' ? 'Acompte' : 'Solde'} {row.number}</span></td>
                      <td className="pay-preview-date">{fmtShort(row.date)}</td>
                      <td className="pay-preview-amount">{formatPrice(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="pay-preview-footer">
                    <td colSpan="3">Total</td>
                    <td className="pay-preview-amount">{formatPrice(lotPrice)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Add client inline panel ──────────────────────────────── */
function AddClientPanel({ newClient, onChange, onSave, onCancel, saving }) {
  return (
    <div className="add-client-panel">
      <div className="add-client-panel-header">
        <span className="add-client-panel-title">Nouveau client</span>
        <button type="button" className="modal-close" style={{ width: 26, height: 26 }} onClick={onCancel}>
          <IcClose />
        </button>
      </div>
      <div className="add-client-grid">
        {[
          { label: 'Nom complet *', key: 'name', type: 'text', placeholder: 'Jean Dupont' },
          { label: 'Téléphone', key: 'phone', type: 'tel', placeholder: '0612 345 678' },
          { label: 'Email', key: 'email', type: 'email', placeholder: 'email@example.com' },
          { label: 'CIN', key: 'cin', type: 'text', placeholder: 'AB123456' },
        ].map(f => (
          <div key={f.key} className="add-client-field">
            <label className="form-field-label">{f.label}</label>
            <input type={f.type} className="form-field-input" placeholder={f.placeholder}
              value={newClient[f.key]}
              onChange={e => onChange({ ...newClient, [f.key]: e.target.value })} />
          </div>
        ))}
        <div className="add-client-field add-client-field--full">
          <label className="form-field-label">Adresse</label>
          <input type="text" className="form-field-input" placeholder="Rue, ville, pays"
            value={newClient.address}
            onChange={e => onChange({ ...newClient, address: e.target.value })} />
        </div>
        <div className="add-client-field add-client-field--full">
          <label className="form-field-label">Type de client</label>
          <select className="form-field-input" value={newClient.client_type}
            onChange={e => onChange({ ...newClient, client_type: e.target.value })}>
            {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div className="add-client-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving ? 'Création...' : 'Créer et sélectionner'}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function LotDetailModal({ lot, onClose, onRefresh, initialMode = null }) {
  const { user, isManager } = useAuth();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [firstPaymentImmediate, setFirstPaymentImmediate] = useState(false);
  const [reservationDays, setReservationDays] = useState(7);
  const depositDate = (() => { const d = new Date(); d.setDate(d.getDate() + (parseInt(reservationDays) || 7)); return d.toISOString().split('T')[0]; })();
  const [finalPrice, setFinalPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [enablePaymentPlan, setEnablePaymentPlan] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState(DEFAULT_PAYMENT_PLAN);
  const [showAddClient, setShowAddClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', cin: '', address: '', client_type: 'autre', notes: '' });
  const [releaseData, setReleaseData] = useState({ deposit_refund_amount: '', deposit_refund_date: new Date().toISOString().split('T')[0], release_reason: '' });
  const [paymentSchedule, setPaymentSchedule] = useState(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  useEffect(() => {
    loadClients();
    if (lot?.price) setFinalPrice(lot.price.toString());
    if (lot?.reservation_id) loadPaymentSchedule(lot.reservation_id);
  }, [lot]);

  const loadClients = async () => {
    try { const data = await apiGet('/api/clients'); setClients(data); }
    catch (error) { console.error('Error loading clients:', error); }
  };

  const loadPaymentSchedule = async (reservationId) => {
    try {
      const schedule = await apiGet(`/api/payments/schedules/reservation/${reservationId}`);
      setPaymentSchedule(schedule);
    } catch (_) {
      setPaymentSchedule(null); // no schedule yet
    }
  };

  const handleConfirmFirstPayment = async () => {
    const firstDeposit = paymentSchedule?.installments
      ?.filter(i => i.payment_type === 'deposit')
      .sort((a, b) => a.installment_number - b.installment_number)[0];
    if (!firstDeposit) return;
    setConfirmingPayment(true);
    try {
      await apiPatch(`/api/payments/installments/${firstDeposit.id}`, {
        status: 'paid',
        paid_date: new Date().toISOString(),
      });
      toast.success('Premier versement confirmé — réservation validée');
      await loadPaymentSchedule(lot.reservation_id);
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la confirmation');
    } finally { setConfirmingPayment(false); }
  };

  const handleCreateClient = async () => {
    if (!newClient.name.trim()) { toast.warning('Le nom est requis'); return; }
    setSavingClient(true);
    try {
      const createdClient = await apiPost('/api/clients', {
        name: newClient.name.trim(),
        phone: newClient.phone.trim() || null,
        email: newClient.email.trim() || null,
        cin: newClient.cin.trim() || null,
        address: newClient.address.trim() || null,
        client_type: newClient.client_type,
        notes: newClient.notes.trim() || null,
      });
      await loadClients();
      setSelectedClient(createdClient);
      setNewClient({ name: '', phone: '', email: '', cin: '', address: '', client_type: 'autre', notes: '' });
      setShowAddClient(false);
      toast.success('Client créé avec succès');
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la création du client');
    } finally { setSavingClient(false); }
  };

  const resetFormState = () => {
    setShowAddClient(false);
    setNewClient({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });
    setSelectedClient(null);
    setDepositAmount('');
    setReservationDays(7);
    setNotes('');
    setEnablePaymentPlan(false);
    setPaymentPlan(DEFAULT_PAYMENT_PLAN);
  };

  const handleSetMode = (newMode) => {
    resetFormState();
    setMode(newMode);
    if (newMode === 'sell' && lot?.price) setFinalPrice(lot.price.toString());
    if (newMode === 'release') {
      setReleaseData({
        deposit_refund_amount: lot?.deposit > 0 ? String(lot.deposit) : '',
        deposit_refund_date: new Date().toISOString().split('T')[0],
        release_reason: '',
      });
    }
  };

  const handleReserve = async () => {
    if (!selectedClient) { toast.warning('Veuillez sélectionner un client'); return; }
    const days = parseInt(reservationDays) || 7;
    if (days < 1 || days > 365) { toast.warning('Le nombre de jours doit être entre 1 et 365'); return; }
    const deposit = depositAmount ? parseFloat(depositAmount) : 0;
    if (lot.price && deposit >= lot.price) {
      toast.warning(`L'acompte doit être inférieur au prix du lot (${formatPrice(lot.price)})`);
      return;
    }
    setLoading(true);
    try {
      const reservation = await apiPost('/api/reservations', {
        lot_id: lot.id, client_id: selectedClient.id,
        reservation_days: days, deposit,
        deposit_date: depositDate || undefined,
        notes: notes || undefined,
      });
      if (lot.price) {
        try {
          const remainingForPlan = Math.max(0, lot.price - deposit);
          const schedule = await apiPost('/api/payments/schedules', {
            reservation_id: reservation.id, lot_price: remainingForPlan,
            deposit_pct: parseFloat(paymentPlan.deposit_pct) || 50,
            deposit_start_date: paymentPlan.deposit_start_date || undefined,
            balance_delay_months: parseInt(paymentPlan.balance_delay_months) || 0,
            deposit_installments: { count: parseInt(paymentPlan.deposit_count) || 1, periodicity_months: parseInt(paymentPlan.deposit_periodicity) || 1 },
            balance_installments: { count: parseInt(paymentPlan.balance_count) || 1, periodicity_months: parseInt(paymentPlan.balance_periodicity) || 1 },
          });
          if (firstPaymentImmediate) {
            await apiPost(`/api/reservations/${reservation.id}/validate-deposit`, {});
          }
        } catch (err) {
          console.error('Error creating payment schedule:', err);
          toast.warning('Réservation créée, mais erreur lors de la création du plan de paiement');
        }
      }
      toast.success('Lot réservé avec succès');
      onClose();
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la réservation');
    } finally { setLoading(false); }
  };

  const handleSell = async () => {
    if (!finalPrice) { toast.warning('Veuillez entrer le prix final'); return; }
    const clientId = lot.status === 'reserved' ? lot.client_id : selectedClient?.id;
    if (!clientId) { toast.warning('Veuillez sélectionner un client'); return; }
    setLoading(true);
    try {
      await apiPost('/api/sales', {
        lot_id: lot.id, client_id: clientId, price: parseFloat(finalPrice),
        reservation_id: lot.reservation_id || undefined, notes: notes || undefined,
      });
      toast.success('Vente enregistrée avec succès');
      onClose();
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la vente');
    } finally { setLoading(false); }
  };

  const handleConfirmRelease = async () => {
    setLoading(true);
    try {
      const payload = {
        deposit_refund_amount: releaseData.deposit_refund_amount !== '' ? parseFloat(releaseData.deposit_refund_amount) : null,
        deposit_refund_date: releaseData.deposit_refund_date || null,
        release_reason: releaseData.release_reason.trim() || null,
      };
      await apiPost(`/api/reservations/${lot.reservation_id}/release`, payload);
      toast.success('Réservation libérée avec succès');
      onClose();
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la libération');
    } finally { setLoading(false); }
  };

  if (!lot) return null;

  // Remaining balance after initial deposit — used as base for payment plan
  const remainingBalance = lot.price
    ? Math.max(0, lot.price - (parseFloat(depositAmount) || 0))
    : 0;

  const expiryDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (parseInt(reservationDays) || 7));
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  })();

  const priceDiff = (() => {
    if (!finalPrice || !lot?.price) return null;
    const diff = parseFloat(finalPrice) - lot.price;
    const pct = (diff / lot.price * 100).toFixed(1);
    return { diff, pct, positive: diff > 0 };
  })();

  // Preview row count for panel header subtitle (based on remaining balance)
  const previewRowCount = useMemo(
    () => (remainingBalance > 0 && enablePaymentPlan ? computePreview(remainingBalance, paymentPlan).allRows.length : 0),
    [remainingBalance, enablePaymentPlan, paymentPlan]
  );

  // First deposit installment — for alert logic
  const firstDepositInstallment = paymentSchedule?.installments
    ?.filter(i => i.payment_type === 'deposit')
    .sort((a, b) => a.installment_number - b.installment_number)[0] ?? null;
  const firstPaymentIsOverdue = firstDepositInstallment?.status === 'pending'
    && new Date(firstDepositInstallment.due_date) < new Date();
  const isValidated = lot.reservation_status === 'validated';

  const lotStats = [
    lot.surface && { icon: <IcSurface />, value: `${lot.surface} m²`, label: 'Surface' },
    (lot.price && lot.surface && lot.surface > 0) && { icon: <IcChart />, value: `${Math.round(lot.price / lot.surface).toLocaleString('fr-FR')} MAD`, label: 'Prix/m²' },
    lot.zone && { icon: <IcPin />, value: `Zone ${lot.zone}`, label: 'Zone' },
    { icon: <IcCalendar />, value: `${lot.days_in_status ? Math.round(lot.days_in_status) : 0}j`, label: 'Dans ce statut' },
    lot.type_lot && { icon: <IcTag />, value: lot.type_lot, label: 'Type de lot' },
    lot.emplacement && { icon: <IcCompass />, value: lot.emplacement, label: 'Emplacement' },
    lot.type_maison && { icon: <IcHome />, value: lot.type_maison, label: 'Type maison' },
  ].filter(Boolean);

  /* ── DETAIL VIEW ─────────────────────────────────────────── */
  if (!mode) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
          <div className="modal-header">
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-primary)', marginBottom: 2 }}>Lot</div>
              <h2 className="modal-title" style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', letterSpacing: '-0.01em' }}>{lot.numero}</h2>
            </div>
            <button className="modal-close" onClick={onClose}><IcClose /></button>
          </div>
          <div className="modal-body">
            <div className="ldm-price-row">
              <div>
                <div className="lot-price-main">{formatPrice(lot.price)}</div>
                {lot.surface && lot.price && <div className="lot-price-per-m2">{formatPrice(lot.price / lot.surface)}/m²</div>}
              </div>
              <span className={`status-badge ${lot.status}`} style={{ fontSize: '0.82rem', padding: '7px 14px' }}>
                <span className="status-dot"></span>{STATUS_LABELS[lot.status]}
              </span>
            </div>

            <div className="ldm-stats-grid">
              {lotStats.map((s, i) => (
                <div key={i} className="ldm-stat-cell">
                  <div className="ldm-stat-icon">{s.icon}</div>
                  <div className="ldm-stat-value">{s.value}</div>
                  <div className="ldm-stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            {lot.status === 'reserved' && lot.client_name && (
              <div className="ldm-reservation-info">
                <div className="ldm-ri-header">
                  <IcUser />
                  <span>{isValidated ? 'Réservation validée' : 'Réservation en cours'}</span>
                  {isValidated && (
                    <span className="badge badge-green" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                      <IcCheck /> Premier versement reçu
                    </span>
                  )}
                </div>
                <div className="ldm-ri-rows">
                  <div className="ldm-ri-row"><span className="ldm-ri-key">Client</span><span className="ldm-ri-val">{lot.client_name}</span></div>
                  {lot.client_phone && <div className="ldm-ri-row"><span className="ldm-ri-key">Téléphone</span><span className="ldm-ri-val">{lot.client_phone}</span></div>}
                  {lot.reserved_by && <div className="ldm-ri-row"><span className="ldm-ri-key">Réservé par</span><span className="ldm-ri-val">{lot.reserved_by}</span></div>}
                  {lot.reservation_date && <div className="ldm-ri-row"><span className="ldm-ri-key">Date</span><span className="ldm-ri-val">{formatDate(lot.reservation_date)}</span></div>}
                  {lot.expiration_date && <div className="ldm-ri-row"><span className="ldm-ri-key">Expire le</span><span className="ldm-ri-val" style={{ color: 'var(--color-warning)' }}>{formatDate(lot.expiration_date)}</span></div>}
                  {lot.deposit > 0 && <div className="ldm-ri-row"><span className="ldm-ri-key">Acompte initial</span><span className="ldm-ri-val ldm-ri-val--bold">{formatPrice(lot.deposit)}</span></div>}
                  {firstDepositInstallment && (
                    <div className="ldm-ri-row">
                      <span className="ldm-ri-key">1er versement plan</span>
                      <span className="ldm-ri-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {formatPrice(firstDepositInstallment.amount)}
                        {firstDepositInstallment.status === 'paid'
                          ? <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Payé</span>
                          : <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>En attente</span>
                        }
                      </span>
                    </div>
                  )}
                </div>
                {/* First payment alert */}
                {firstPaymentIsOverdue && (
                  <div className="ldm-first-payment-alert">
                    <div className="ldm-fpa-icon">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 2L1 13h14L8 2z" /><path d="M8 6v4M8 11.5v.5" />
                      </svg>
                    </div>
                    <div className="ldm-fpa-body">
                      <div className="ldm-fpa-title">Premier versement en retard</div>
                      <div className="ldm-fpa-desc">
                        Échéance du {formatDate(firstDepositInstallment.due_date)} — {formatPrice(firstDepositInstallment.amount)}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleConfirmFirstPayment}
                      disabled={confirmingPayment}
                      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <IcCheck />
                      {confirmingPayment ? 'Confirmation...' : 'Confirmer le paiement'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            {lot.status === 'available' && (
              <>
                <button className="btn btn-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => handleSetMode('reserve')}><IcLock /> Réserver</button>
                <button className="btn btn-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => handleSetMode('sell')}><IcCheck /> Vendre</button>
              </>
            )}
            {lot.status === 'reserved' && (() => {
              const canManage = isManager || (lot.reserved_by_user_id && lot.reserved_by_user_id === user?.id);
              const msg = `Seul ${lot.reserved_by || 'le commercial qui a réservé'} peut libérer ou finaliser cette réservation`;
              return (
                <>
                  {/* Quick confirm first payment if pending — accessible directly from footer */}
                  {firstPaymentIsOverdue && canManage && (
                    <button className="btn btn-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={handleConfirmFirstPayment} disabled={confirmingPayment}>
                      <IcCheck /> {confirmingPayment ? 'Confirmation...' : 'Valider 1er paiement'}
                    </button>
                  )}
                  <button className="btn btn-ghost"
                    onClick={() => handleSetMode('release')} disabled={loading || !canManage}
                    title={!canManage ? msg : ''}
                    style={!canManage ? { opacity: 0.5, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 } : { display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <IcUnlock /> Libérer
                  </button>
                  <button className="btn btn-success"
                    onClick={() => handleSetMode('sell')} disabled={!canManage}
                    title={!canManage ? msg : ''}
                    style={!canManage ? { opacity: 0.5, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 } : { display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <IcCheck /> Finaliser la vente
                  </button>
                </>
              );
            })()}
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── FORM VIEW — split layout ────────────────────────────── */
  const isReserve = mode === 'reserve';
  const isRelease = mode === 'release';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${enablePaymentPlan ? 'modal--3col' : 'modal--split'}`} onClick={e => e.stopPropagation()}>

        {/* ── LEFT: Lot summary ── */}
        <div className="modal-split-left">
          <div className="msl-eyebrow">Lot</div>
          <div className="msl-num">{lot.numero}</div>
          {lot.zone && <div className="msl-zone">Zone {lot.zone}{lot.type_lot ? ` · ${lot.type_lot}` : ''}</div>}
          <div className="msl-price">{formatPrice(lot.price)}</div>
          {lot.surface && lot.price && <div className="msl-price-m2">{formatPrice(lot.price / lot.surface)}/m²</div>}
          <span className={`status-badge ${lot.status}`} style={{ display: 'inline-flex', fontSize: '0.78rem', padding: '5px 11px', margin: '14px 0 18px' }}>
            <span className="status-dot"></span>{STATUS_LABELS[lot.status]}
          </span>
          <div className="msl-stats">
            {lotStats.map((s, i) => (
              <div key={i} className="msl-stat">
                <span className="msl-stat-icon">{s.icon}</span>
                <span className="msl-stat-text">
                  <span className="msl-stat-value">{s.value}</span>
                  <span className="msl-stat-label">{s.label}</span>
                </span>
              </div>
            ))}
          </div>
          {lot.status === 'reserved' && lot.client_name && (
            <div className="msl-reservation-tag"><IcUser /><span>{lot.client_name}</span></div>
          )}
        </div>

        {/* ── RIGHT: Form ── */}
        <div className="modal-split-right">
          <div className="msr-header">
            <div className="msr-header-left">
              <h3 className="msr-title">
                {isReserve ? 'Réserver le lot' : isRelease ? 'Libérer la réservation' : (lot.status === 'reserved' ? 'Finaliser la vente' : 'Vendre le lot')}
              </h3>
              <div className="msr-subtitle">Lot {lot.numero}</div>
            </div>
            <button className="modal-close" onClick={onClose}><IcClose /></button>
          </div>

          <div className="msr-price-pill">
            <span className="msr-price-pill-label">Prix catalogue</span>
            <span className="msr-price-pill-value">{formatPrice(lot.price)}</span>
          </div>

          <div className="msr-form">

            {/* ── Release form ── */}
            {isRelease && (
              <>
                {/* Info client bloquée */}
                {lot.client_name && (
                  <div className="msr-field-group">
                    <label className="msr-label"><IcUser /> Client</label>
                    <div className="msr-client-locked">
                      <div className="msr-client-locked-monogram">
                        {lot.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="msr-client-locked-name">{lot.client_name}</div>
                        <div className="msr-client-locked-sub">Client de la réservation</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Acompte versé (lecture seule) */}
                {lot.deposit > 0 && (
                  <div className="msr-field-group">
                    <label className="msr-label"><IcMoney /> Acompte versé</label>
                    <div className="msr-info-pill">
                      <span className="msr-info-pill-value">{formatPrice(lot.deposit)}</span>
                      {lot.deposit_date && <span className="msr-info-pill-sub">versé le {formatDate(lot.deposit_date)}</span>}
                    </div>
                  </div>
                )}

                {/* Acompte récupéré */}
                <div className="msr-field-group">
                  <label className="msr-label"><IcMoney /> Acompte récupéré par le client</label>
                  <div className="msr-deposit-row">
                    <input
                      type="number" className="msr-input" min="0" step="1000"
                      placeholder={lot.deposit > 0 ? lot.deposit.toString() : '0'}
                      value={releaseData.deposit_refund_amount}
                      onChange={e => setReleaseData(d => ({ ...d, deposit_refund_amount: e.target.value }))}
                    />
                    <span className="msr-currency">MAD</span>
                  </div>
                  <div className="msr-hint">Laisser vide si aucun remboursement</div>
                </div>

                {/* Date récupération */}
                {releaseData.deposit_refund_amount !== '' && parseFloat(releaseData.deposit_refund_amount) > 0 && (
                  <div className="msr-field-group">
                    <label className="msr-label"><IcCalendar /> Date de récupération</label>
                    <input
                      type="date" className="msr-input"
                      value={releaseData.deposit_refund_date}
                      onChange={e => setReleaseData(d => ({ ...d, deposit_refund_date: e.target.value }))}
                    />
                  </div>
                )}

                {/* Motif de libération */}
                <div className="msr-field-group">
                  <label className="msr-label">Motif de libération</label>
                  <textarea
                    className="msr-textarea"
                    rows={3}
                    placeholder="Raison de la libération (optionnel)…"
                    value={releaseData.release_reason}
                    onChange={e => setReleaseData(d => ({ ...d, release_reason: e.target.value }))}
                  />
                </div>
              </>
            )}

            {/* Client selector */}
            {!isRelease && (isReserve || lot.status !== 'reserved') && (
              <div className="msr-field-group">
                <label className="msr-label"><IcUser /> Client <span className="msr-required">*</span></label>
                <div className="msr-client-row">
                  <select className="msr-select"
                    value={selectedClient?.id || ''}
                    onChange={e => { const c = clients.find(c => c.id === parseInt(e.target.value)); setSelectedClient(c); }}>
                    <option value="">Sélectionner un client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                  </select>
                  <button type="button" className="msr-btn-add-client"
                    onClick={() => setShowAddClient(!showAddClient)}>
                    {showAddClient ? <IcClose /> : <IcPlus />}
                    {showAddClient ? 'Annuler' : 'Nouveau'}
                  </button>
                </div>
                {showAddClient && (
                  <AddClientPanel newClient={newClient} onChange={setNewClient}
                    onSave={handleCreateClient}
                    onCancel={() => { setShowAddClient(false); setNewClient({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' }); }}
                    saving={savingClient} />
                )}
              </div>
            )}

            {/* Client locked from reservation */}
            {!isReserve && !isRelease && lot.status === 'reserved' && lot.client_name && (
              <div className="msr-field-group">
                <label className="msr-label"><IcUser /> Client</label>
                <div className="msr-client-locked">
                  <div className="msr-client-locked-monogram">
                    {lot.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="msr-client-locked-name">{lot.client_name}</div>
                    <div className="msr-client-locked-sub">Client de la réservation</div>
                  </div>
                </div>
              </div>
            )}

            {/* Reservation duration */}
            {isReserve && (
              <div className="msr-field-group">
                <div className="msr-duration-header">
                  <label className="msr-label"><IcCalendar /> Durée avant 1er paiement <span className="msr-required">*</span></label>
                  <label className="msr-immediate-toggle">
                    <input type="checkbox" checked={firstPaymentImmediate}
                      onChange={e => setFirstPaymentImmediate(e.target.checked)} />
                    <span>Immédiat</span>
                  </label>
                </div>
                {!firstPaymentImmediate && (
                  <>
                    <div className="msr-stepper">
                      <button type="button" className="msr-stepper-btn"
                        onClick={() => setReservationDays(d => Math.max(1, (parseInt(d) || 7) - 1))}>−</button>
                      <input type="number" className="msr-stepper-input" min="1" max="365"
                        value={reservationDays} onChange={e => setReservationDays(e.target.value)} />
                      <span className="msr-stepper-unit">jours</span>
                      <button type="button" className="msr-stepper-btn"
                        onClick={() => setReservationDays(d => Math.min(365, (parseInt(d) || 7) + 1))}>+</button>
                    </div>
                    <div className="msr-expiry-hint">
                      <IcCalendar />
                      1er versement prévu le <strong>{expiryDate}</strong>
                    </div>
                  </>
                )}
                {firstPaymentImmediate && (
                  <div className="msr-immediate-hint">
                    <IcCheck /> Le 1er versement sera marqué payé dès la réservation
                  </div>
                )}
              </div>
            )}

            {/* Deposit amount + date (reserve only) */}
            {isReserve && (
              <div className="msr-field-group">
                <label className="msr-label"><IcMoney /> Premier versement (acompte)</label>
                <div className="msr-deposit-row">
                  <div className="msr-price-input-wrap" style={{ flex: 1 }}>
                    <input type="number" className="msr-price-input" placeholder="Montant reçu"
                      value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                      min="0" step="100" />
                    <span className="msr-price-input-currency">MAD</span>
                  </div>
                </div>
                {lot.price && depositAmount && parseFloat(depositAmount) > 0 && (
                  <div className="msr-balance-hint">
                    Solde restant : <strong>{formatPrice(lot.price - parseFloat(depositAmount))}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Final price (sell) */}
            {!isReserve && !isRelease && (
              <div className="msr-field-group">
                <label className="msr-label"><IcMoney /> Prix final de vente <span className="msr-required">*</span></label>
                <div className="msr-price-input-wrap">
                  <input type="number" className="msr-price-input" placeholder="Saisir le prix de vente"
                    value={finalPrice} onChange={e => setFinalPrice(e.target.value)} />
                  <span className="msr-price-input-currency">MAD</span>
                </div>
                {priceDiff !== null && finalPrice && (
                  <div className={`msr-price-diff msr-price-diff--${priceDiff.diff > 0 ? 'up' : priceDiff.diff < 0 ? 'down' : 'eq'}`}>
                    {priceDiff.diff > 0 ? '+' : ''}{priceDiff.pct}% {priceDiff.diff > 0 ? 'au-dessus' : priceDiff.diff < 0 ? 'en-dessous de' : 'identique au'} catalogue
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {!isRelease && (
              <div className="msr-field-group">
                <label className="msr-label">Notes <span className="msr-optional">(optionnel)</span></label>
                <textarea className="msr-textarea" placeholder="Ajouter une note sur cette transaction..."
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            )}

            {/* Payment plan toggle (reserve only) */}
            {isReserve && lot.price && (
              <div className="msr-pay-toggle-row">
                <button type="button"
                  className={`msr-pay-toggle ${enablePaymentPlan ? 'active' : ''}`}
                  onClick={() => setEnablePaymentPlan(v => !v)}>
                  <IcPayments />
                  <div style={{ flex: 1 }}>
                    <span>Personnaliser l'échéancier</span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      Plan par défaut : 50% acompte / 50% solde — 1 versement chacun
                    </div>
                  </div>
                  <div className={`msr-pay-switch ${enablePaymentPlan ? 'msr-pay-switch--on' : ''}`}>
                    <div className="msr-pay-switch-thumb" />
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Sticky action footer — outside scroll area */}
          <div className="msr-actions-footer">
            <button type="button" className="msr-btn-cancel" onClick={() => handleSetMode(null)}>
              Annuler
            </button>
            {isReserve ? (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleReserve} disabled={loading}>
                <IcCheck />{loading ? 'Réservation...' : 'Confirmer la réservation'}
              </button>
            ) : isRelease ? (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--release"
                onClick={handleConfirmRelease} disabled={loading}>
                <IcUnlock />{loading ? 'Libération...' : 'Confirmer la libération'}
              </button>
            ) : (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--sell"
                onClick={handleSell} disabled={loading}>
                <IcCheck />{loading ? 'Vente en cours...' : 'Confirmer la vente'}
              </button>
            )}
          </div>
        </div>

        {/* ── THIRD PANEL: Payment plan (when enabled) ── */}
        {isReserve && enablePaymentPlan && lot.price && (
          <div className="modal-pay-panel">
            <div className="mpp-header">
              <div className="mpp-header-left">
                <span className="mpp-title">Plan de paiement</span>
                <span className="mpp-subtitle">{previewRowCount} versement{previewRowCount > 1 ? 's' : ''}</span>
              </div>
              <span className="mpp-total">{formatPrice(remainingBalance)}</span>
            </div>
            <div className="mpp-body">
              <PaymentPlanConfigurator lotPrice={remainingBalance} plan={paymentPlan} onChange={setPaymentPlan} panel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

