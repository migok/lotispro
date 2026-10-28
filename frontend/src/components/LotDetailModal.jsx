import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiFetch, apiUploadFile, buildApiError } from '../utils/api';
import { useAuth } from '../contexts/authHooks';
import { useToast } from '../contexts/toastHooks';
import { formatPrice, formatDate } from '../utils/formatters';
import { ACTIVE_LOT_STATUSES, STATUS_LABELS, PAYMENT_TYPES } from '../utils/constants';
import ClientForm from './clients/ClientForm';
import ClientPicker from './clients/ClientPicker';
import { shouldToastClientError } from '../utils/clientProfile';
import { DEFAULT_ENABLED_OPTIONAL, EDL_STATUSES, allowedTransitions, openEdlActionsLabel } from '../utils/lotWorkflow';
import EdlPanel from './lots/EdlPanel';
import EdlTransitionForm from './lots/EdlTransitionForm';
import DepositDecisionFields from './lots/DepositDecisionFields';
import { buildEngagePayload, firstAmountsError, gapAmount, parseAmount, refundFields } from '../utils/engagePayload';
import EngagementAmountsFields from './lots/EngagementAmountsFields';
import PaymentsPanel from './lots/PaymentsPanel';
import { acteThresholdMessage } from '../services/reservationFinanceService';
import NotifyClientPanel from './notifications/NotifyClientPanel';
import NotificationHistory from './notifications/NotificationHistory';

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

// Statuts où l'acte de réservation est archivé (engagement et au-delà)
const ACTE_CATEGORY = 'acte_reservation';
const ACTE_STATUSES = ['reservation_engagee', 'reservation_soldee', ...EDL_STATUSES, 'chez_notaire', 'chez_proprietaire'];

// Montants d'un engagement (EngagementAmountsFields) avant préremplissage
const EMPTY_AMOUNTS = { agreedTotalPrice: '', salePrice: '', gapDueTiming: 'fin', gapDueDate: '', firstPayment: '' };
const GAP_TIMING_TEXT = { debut: 'au début', fin: 'à la fin' };

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
const toCents = (v) => Math.round((v || 0) * 100);
/**
 * Preview of a schedule covering `total`. With `engage` ({ agreed, firstPayment, gap,
 * gapTiming, gapDate }) it mirrors the engagement schedule (spec E4-T5, R1/R2): it covers
 * agreed − first payment; the deposit part is what remains of agreed × deposit % once the
 * first payment (and the gap when due at the start) are counted; the gap is its own row.
 */
function computePreview(total, plan, engage = null) {
  const depPct = Math.min(100, Math.max(0, parseFloat(plan.deposit_pct) || 50));
  let depositTotal;
  let balanceTotal;
  let gapTotal = 0;
  if (engage) {
    const agreed = toCents(engage.agreed);
    const first = toCents(engage.firstPayment);
    const gap = toCents(engage.gap);
    const left = Math.max(0, agreed - first - gap);
    const gapAtStart = engage.gapTiming === 'debut' ? gap : 0;
    const deposit = Math.min(left, Math.max(0, Math.round(agreed * depPct / 100) - first - gapAtStart));
    depositTotal = deposit / 100;
    balanceTotal = (left - deposit) / 100;
    gapTotal = Math.min(gap, Math.max(0, agreed - first)) / 100;
  } else {
    depositTotal = Math.round(total * depPct) / 100;
    balanceTotal = Math.max(0, Math.round((total - depositTotal) * 100) / 100);
  }
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
  const planRows = [...depositRows, ...balanceRows];
  const gapRows = [];
  if (gapTotal > 0) {
    const lastDate = planRows.reduce((last, r) => (r.date > last ? r.date : last), depositStart);
    const gapDate = engage.gapTiming === 'debut' ? new Date()
      : engage.gapTiming === 'date' && engage.gapDate ? new Date(engage.gapDate)
      : lastDate;
    gapRows.push({ type: 'gap', number: 1, date: gapDate, amount: gapTotal });
  }
  const allRows = [...planRows.filter((r) => r.amount > 0), ...gapRows].sort((a, b) => a.date - b.date);
  return { depositTotal, balanceTotal, gapTotal, depositRows, balanceRows, allRows, balanceStart };
}
function previewRowLabel(row) {
  if (row.type === 'gap') return 'Écart à régulariser';
  return `${row.type === 'deposit' ? 'Acompte' : 'Solde'} ${row.number}`;
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
                  {previewRowLabel(row)}
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

/* ── Expired alert banner ─────────────────────────────────── */
const IcAlertTriangle = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2L1 13h14L8 2z" /><path d="M8 6v4M8 11.5v.5" />
  </svg>
);
const IcDownload = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" />
  </svg>
);
const IcUpload = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 10V2M5 5l3-3 3 3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" />
  </svg>
);
const IcFile = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 1.5H3.5A1.5 1.5 0 002 3v10a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 13V6.5L9 1.5z" />
    <path d="M9 1.5V6.5H14" />
  </svg>
);
const IcTrash = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12M5.5 4V2.5a.5.5 0 01.5-.5h4a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l.8 9.5a1 1 0 001 .9h6.4a1 1 0 001-.9L13 4" />
  </svg>
);

function ExpiredAlert({ status, expirationDate }) {
  if (!expirationDate) return null;
  const now = new Date();
  const exp = new Date(expirationDate);
  if (exp >= now) return null;
  const daysOver = Math.ceil((now - exp) / (1000 * 60 * 60 * 24));
  const title = status === 'option' ? 'Option expirée' : 'Délai de finalisation dépassé';
  return (
    <div className="ldm-expired-alert">
      <div className="ldm-ea-icon"><IcAlertTriangle /></div>
      <div className="ldm-ea-body">
        <div className="ldm-ea-title">{title}</div>
        <div className="ldm-ea-sub">Validation commerciale requise</div>
      </div>
      <div className="ldm-ea-badge">
        <span className="ldm-ea-days">{daysOver}</span>
        <span className="ldm-ea-unit">j</span>
      </div>
    </div>
  );
}

/* ── Payment plan configurator ────────────────────────────── */
function PaymentPlanConfigurator({ lotPrice, plan, onChange, panel = false, engage = null }) {
  const depPct = parseFloat(plan.deposit_pct) || 50;
  const balPct = Math.round((100 - depPct) * 100) / 100;
  const preview = useMemo(() => computePreview(lotPrice, plan, engage), [lotPrice, plan, engage]);
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
        {preview.gapTotal > 0 && (
          <div className="pay-plan-split-hint" style={{ marginTop: 6 }}>
            + Écart à régulariser : {formatPrice(preview.gapTotal)} (échéance distincte)
          </div>
        )}
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
                      <td><span className={`pay-preview-badge pay-preview-badge--${row.type}`}>{previewRowLabel(row)}</span></td>
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
function AddNotairePanel({ newNotaire, onChange, onSave, onCancel, saving }) {
  return (
    <div className="add-client-panel">
      <div className="add-client-panel-header">
        <span className="add-client-panel-title">Nouveau notaire</span>
        <button type="button" className="modal-close" style={{ width: 26, height: 26 }} onClick={onCancel}>
          <IcClose />
        </button>
      </div>
      <div className="add-client-grid">
        {[
          { label: 'Nom *', key: 'nom', type: 'text', placeholder: 'Dupont' },
          { label: 'Prénom *', key: 'prenom', type: 'text', placeholder: 'Jean' },
          { label: 'Téléphone *', key: 'telephone', type: 'tel', placeholder: '0612 345 678' },
          { label: 'Email', key: 'email', type: 'email', placeholder: 'notaire@etude.fr' },
          { label: 'Ville', key: 'ville', type: 'text', placeholder: 'Paris' },
        ].map(f => (
          <div key={f.key} className="add-client-field">
            <label className="form-field-label">{f.label}</label>
            <input type={f.type} className="form-field-input" placeholder={f.placeholder}
              value={newNotaire[f.key]}
              onChange={e => onChange({ ...newNotaire, [f.key]: e.target.value })} />
          </div>
        ))}
        <div className="add-client-field add-client-field--full">
          <label className="form-field-label">Adresse</label>
          <input type="text" className="form-field-input" placeholder="12 rue de la Paix, 75001 Paris"
            value={newNotaire.adresse}
            onChange={e => onChange({ ...newNotaire, adresse: e.target.value })} />
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

function AddClientPanel({ onSubmit, onCancel }) {
  return (
    <div className="add-client-panel">
      <div className="add-client-panel-header">
        <span className="add-client-panel-title">Nouveau client</span>
        <button type="button" className="modal-close" style={{ width: 26, height: 26 }} onClick={onCancel}>
          <IcClose />
        </button>
      </div>
      <ClientForm compact onSubmit={onSubmit} onCancel={onCancel} submitLabel="Créer et sélectionner" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/**
 * Fiche lot. Après une étape de réservation réussie, le panneau « Notifier le
 * client » remplace la fiche ; le fermer (avec ou sans envoi) ferme la fiche.
 */
export default function LotDetailModal(props) {
  const { onClose, onRefresh } = props;
  const [notify, setNotify] = useState(null);

  const handleStepDone = async ({ kind, reservationId, clientId }) => {
    if (onRefresh) onRefresh();
    if (!reservationId) { onClose(); return; }
    let client = null;
    try {
      client = clientId ? await apiGet(`/api/clients/${clientId}`) : null;
    } catch {
      // préférences inconnues : le panneau retombe sur l'email
    }
    setNotify({ kind, reservationId, client });
  };

  if (notify) return <NotifyClientPanel {...notify} onClose={onClose} />;
  return <LotDetailModalContent {...props} onStepDone={handleStepDone} />;
}

function LotDetailModalContent({
  lot,
  onClose,
  onRefresh,
  onStepDone,
  initialMode = null,
  enabledOptionalStatuses = DEFAULT_ENABLED_OPTIONAL,
}) {
  const { user, isManager: hasManagerRole } = useAuth();
  const isManager = hasManagerRole();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [reservationDays, setReservationDays] = useState(7);
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [enablePaymentPlan, setEnablePaymentPlan] = useState(true);
  const [paymentPlan, setPaymentPlan] = useState(DEFAULT_PAYMENT_PLAN);
  const [projectFinancingPlan, setProjectFinancingPlan] = useState(null);
  const [lotPricingConfig, setLotPricingConfig] = useState(null); // prix_m2_acte from project pricing grid
  const [showAddClient, setShowAddClient] = useState(false);
  const [releaseData, setReleaseData] = useState({ deposit_refund_amount: '', deposit_refund_date: new Date().toISOString().split('T')[0], release_reason: '' });
  const [reservation, setReservation] = useState(null); // full reservation details from API
  const [validationChoice, setValidationChoice] = useState(null); // 'refund' | 'deduct' | null
  // New transition state
  const [guaranteeAmount, setGuaranteeAmount] = useState('');
  const [finalizationDate, setFinalizationDate] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [notaryDate, setNotaryDate] = useState('');
  const [notaires, setNotaires] = useState([]);
  const [selectedNotaire, setSelectedNotaire] = useState(null);
  const [showAddNotaire, setShowAddNotaire] = useState(false);
  const [newNotaire, setNewNotaire] = useState({ nom: '', prenom: '', telephone: '', email: '', ville: '', adresse: '' });
  const [savingNotaire, setSavingNotaire] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [editForm, setEditForm] = useState({ price_per_sqm: '', price_per_sqm_acte: '', surface: '', zone: '', type_lot: '', emplacement: '', type_maison: '' });
  const [extendDays, setExtendDays] = useState(7);
  // Réservation engagée — montants (prix total convenu, prix sur l'acte, écart, premier acompte)
  const [amounts, setAmounts] = useState(EMPTY_AMOUNTS);
  const [downloadingDoc, setDownloadingDoc] = useState(false);
  const [settingNotaireIntent, setSettingNotaireIntent] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [documentsError, setDocumentsError] = useState(false);
  const documentsLotId = useRef(null);
  const [regeneratingActe, setRegeneratingActe] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = useRef(null);
  // Open EDL actions of the displayed lot, reported by the EDL panel once
  // loaded; unknown (null) until then, so « Finaliser » stays disabled.
  const [edlCount, setEdlCount] = useState({ lotId: null, count: null });
  const edlOpenCount = edlCount.lotId === lot?.id ? edlCount.count : null;
  // financial-summary of the displayed lot's reservation, reported by PaymentsPanel;
  // null until loaded, so the deed alert / « Marquer soldé » wait for it.
  const [finance, setFinance] = useState({ reservationId: null, summary: null });
  const financeSummary = lot?.reservation_id != null && finance.reservationId === lot.reservation_id ? finance.summary : null;
  const reportFinanceSummary = useCallback(
    (summary) => setFinance({ reservationId: lot?.reservation_id, summary }),
    [lot?.reservation_id]
  );
  const reportEdlOpenCount = useCallback(
    (count) => setEdlCount({ lotId: lot?.id, count }),
    [lot?.id]
  );

  useEffect(() => {
    loadClients();
    loadNotaires();
    if (lot?.reservation_id) {
      loadReservation(lot.reservation_id);
    } else {
      setReservation(null);
    }
    if (documentsLotId.current !== lot?.id) {
      // autre lot : ne jamais montrer l'état des documents du lot précédent
      documentsLotId.current = lot?.id ?? null;
      setDocuments([]);
      setDocumentsLoaded(false);
      setDocumentsError(false);
    }
    if (lot?.id && (['chez_notaire', 'chez_proprietaire'].includes(lot.status) || (lot.reservation_id && ACTE_STATUSES.includes(lot.status)))) {
      loadDocuments();
    } else {
      setDocuments([]);
      setDocumentsLoaded(false);
      setDocumentsError(false);
    }
    if (lot?.project_id) {
      loadProjectFinancingPlan(lot.project_id);
      loadLotPricingConfig(lot.project_id, lot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadDocuments is recreated every render; reload only when the lot changes
  }, [lot]);

  // When pricing config loads after handleSetMode was called without it, re-apply auto-calc
  useEffect(() => {
    if (!lotPricingConfig?.sale_price_computed) return;
    if (!['direct_engage', 'finaliser_engage', 'option_engage'].includes(mode)) return;
    if (lot?.price_per_sqm_acte) return; // already set on lot directly
    setAmounts((a) => ({ ...a, salePrice: String(lotPricingConfig.sale_price_computed) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-applying auto-calc on mode change would overwrite the price the user typed; only run when the pricing config loads
  }, [lotPricingConfig]);

  const loadProjectFinancingPlan = async (projectId) => {
    try {
      const plan = await apiGet(`/api/projects/${projectId}/financing-plan`);
      if (plan) {
        setProjectFinancingPlan(plan);
        setPaymentPlan({
          deposit_pct: plan.deposit_pct,
          deposit_start_date: '',
          deposit_count: plan.deposit_count,
          deposit_periodicity: plan.deposit_periodicity,
          balance_delay_months: plan.balance_delay_months,
          balance_count: plan.balance_count,
          balance_periodicity: plan.balance_periodicity,
        });
      }
    } catch {
      // No plan configured yet — keep DEFAULT_PAYMENT_PLAN
    }
  };

  const loadLotPricingConfig = async (projectId, currentLot) => {
    console.log('[PricingConfig] called with projectId=', projectId, 'lot.id=', currentLot?.id);
    if (!projectId) { console.log('[PricingConfig] EARLY RETURN — no projectId'); return; }
    try {
      const data = await apiGet(`/api/projects/${projectId}/pricing-configs`);
      const configs = data?.configs || [];
      console.log('[PricingConfig] projectId=', projectId, 'lot fields:', {
        zone: currentLot.zone,
        type_lot: currentLot.type_lot,
        type_maison: currentLot.type_maison,
        emplacement: currentLot.emplacement,
        surface: currentLot.surface,
      });
      console.log('[PricingConfig] configs from API:', configs.map(c => ({
        zone: c.zone, type_lot: c.type_lot, type_maison: c.type_maison, emplacement: c.emplacement,
        prix_m2_acte: c.prix_m2_acte, prix_m2_catalogue: c.prix_m2_catalogue,
      })));
      const match = configs.find(c =>
        String(c.zone ?? '') === String(currentLot.zone ?? '') &&
        String(c.type_lot ?? '') === String(currentLot.type_lot ?? '') &&
        String(c.type_maison ?? '') === String(currentLot.type_maison ?? '') &&
        String(c.emplacement ?? '') === String(currentLot.emplacement ?? '')
      );
      console.log('[PricingConfig] match=', match ?? 'NONE');
      if (match) {
        const surface = currentLot.surface || 0;
        setLotPricingConfig({
          prix_m2_acte: match.prix_m2_acte,
          prix_m2_catalogue: match.prix_m2_catalogue,
          sale_price_computed: surface > 0 ? Math.round(match.prix_m2_acte * surface * 100) / 100 : null,
          catalogue_price_computed: surface > 0 ? Math.round(match.prix_m2_catalogue * surface * 100) / 100 : null,
        });
      } else {
        setLotPricingConfig(null);
      }
    } catch (err) {
      console.log('[PricingConfig] ERROR:', err);
      setLotPricingConfig(null);
    }
  };

  const loadReservation = async (reservationId) => {
    try {
      const data = await apiGet(`/api/reservations/${reservationId}`);
      setReservation(data);
    } catch {
      setReservation(null);
    }
  };

  const loadClients = async () => {
    try { const data = await apiGet('/api/clients'); setClients(data); }
    catch (error) { console.error('Error loading clients:', error); }
  };

  const loadNotaires = async () => {
    try { const data = await apiGet('/api/notaires'); setNotaires(data); }
    catch (error) { console.error('Error loading notaires:', error); }
  };

  const handleCreateNotaire = async () => {
    if (!newNotaire.nom.trim()) { toast.warning('Le nom est requis'); return; }
    if (!newNotaire.prenom.trim()) { toast.warning('Le prénom est requis'); return; }
    if (!newNotaire.telephone.trim()) { toast.warning('Le téléphone est requis'); return; }
    setSavingNotaire(true);
    try {
      const created = await apiPost('/api/notaires', {
        nom: newNotaire.nom.trim(),
        prenom: newNotaire.prenom.trim(),
        telephone: newNotaire.telephone.trim(),
        email: newNotaire.email.trim() || undefined,
        ville: newNotaire.ville.trim() || undefined,
        adresse: newNotaire.adresse.trim() || undefined,
      });
      await loadNotaires();
      setSelectedNotaire(created);
      setShowAddNotaire(false);
      setNewNotaire({ nom: '', prenom: '', telephone: '', email: '', ville: '', adresse: '' });
      toast.success('Notaire créé et sélectionné');
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la création du notaire');
    } finally { setSavingNotaire(false); }
  };

  const loadDocuments = async () => {
    if (!lot?.id) return;
    try {
      const data = await apiGet(`/api/lots/${lot.id}/documents`);
      setDocuments(data);
      setDocumentsError(false);
      setDocumentsLoaded(true);
    } catch {
      // ne pas conclure "acte absent" sur un échec de chargement
      setDocuments([]);
      setDocumentsLoaded(false);
      setDocumentsError(true);
    }
  };

  const latestActe = documents
    .filter(d => d.category === ACTE_CATEGORY)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || b.id - a.id)[0];
  const notaryDocuments = documents.filter(d => d.category !== ACTE_CATEGORY);

  const handleRegenerateActe = async () => {
    setRegeneratingActe(true);
    try {
      await apiPost(`/api/reservations/${lot.reservation_id}/acte`, {});
      toast.success('Acte régénéré');
      await loadDocuments();
    } catch (err) {
      toast.error(err.message || "Erreur lors de la génération de l'acte");
    } finally { setRegeneratingActe(false); }
  };

  const handleUploadDocument = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingDoc(true);
    try {
      await apiUploadFile(`/api/lots/${lot.id}/documents`, file);
      toast.success('Document ajouté');
      loadDocuments();
    } catch (err) {
      toast.error(err.message || 'Erreur lors de l\'upload');
    } finally { setUploadingDoc(false); }
  };

  const handleDownloadDocument = async (doc) => {
    try {
      const response = await apiFetch(`/api/lots/${lot.id}/documents/${doc.id}`);
      if (!response.ok) throw new Error('Erreur de téléchargement');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      toast.error(err.message || 'Erreur de téléchargement');
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      const response = await apiFetch(`/api/lots/${lot.id}/documents/${docId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Erreur de suppression');
      }
      toast.success('Document supprimé');
      setDocuments(docs => docs.filter(d => d.id !== docId));
    } catch (err) {
      toast.error(err.message || 'Erreur de suppression');
    }
  };

  // A payment may archive the deed (threshold crossed): reload documents and the lot list
  const handlePaymentRecorded = () => {
    loadDocuments();
    if (onRefresh) onRefresh();
  };

  const handleCreateClient = async (payload) => {
    let createdClient;
    try {
      createdClient = await apiPost('/api/clients', payload);
    } catch (error) {
      if (shouldToastClientError(error)) toast.error(error.message || 'Erreur lors de la création du client');
      throw error;
    }
    await loadClients();
    setSelectedClient(createdClient);
    setShowAddClient(false);
    toast.success('Client créé avec succès');
  };

  const resetFormState = () => {
    setShowAddClient(false);
    setSelectedClient(null);
    setDepositAmount('');
    setReservationDays(7);
    setNotes('');
    setEnablePaymentPlan(false);
    setPaymentPlan(projectFinancingPlan ? {
      deposit_pct: projectFinancingPlan.deposit_pct,
      deposit_start_date: '',
      deposit_count: projectFinancingPlan.deposit_count,
      deposit_periodicity: projectFinancingPlan.deposit_periodicity,
      balance_delay_months: projectFinancingPlan.balance_delay_months,
      balance_count: projectFinancingPlan.balance_count,
      balance_periodicity: projectFinancingPlan.balance_periodicity,
    } : DEFAULT_PAYMENT_PLAN);
    setGuaranteeAmount('');
    setFinalizationDate('');
    setPaymentType('cash');
    setNotaryDate('');
    setBlockReason('');
    setEditForm({ price_per_sqm: '', price_per_sqm_acte: '', surface: '', zone: '', type_lot: '', emplacement: '', type_maison: '' });
    setExtendDays(7);
    setValidationChoice(null);
    setAmounts(EMPTY_AMOUNTS);
  };

  const handleSetMode = (newMode) => {
    resetFormState();
    setMode(newMode);
    if (newMode === 'finaliser_refund' || newMode === 'finaliser_engage') {
      const gAmount = reservation?.guarantee_amount ?? lot?.guarantee_amount ?? 0;
      const gPayType = reservation?.payment_type ?? lot?.payment_type ?? 'cash';
      setReleaseData({
        deposit_refund_amount: gAmount > 0 ? String(gAmount) : '',
        deposit_refund_date: new Date().toISOString().split('T')[0],
        release_reason: '',
        refund_payment_type: gPayType,
      });
    }
    if (newMode === 'option_engage') {
      const optionDeposit = reservation?.deposit ?? lot?.deposit ?? 0;
      setReleaseData({
        deposit_refund_amount: optionDeposit > 0 ? String(optionDeposit) : '',
        deposit_refund_date: new Date().toISOString().split('T')[0],
        release_reason: '',
        refund_payment_type: 'cash',
      });
    }
    if (newMode === 'finaliser_engage' || newMode === 'direct_engage' || newMode === 'option_engage') {
      setEnablePaymentPlan(true);
      // Prix total convenu = prix catalogue ; prix sur l'acte = grille de prix, sinon convenu
      const agreed = lot?.price ? String(lot.price) : '';
      let acte = agreed;
      if (lot?.price_per_sqm_acte && lot?.surface && lot.surface > 0) {
        acte = String(Math.round(lot.price_per_sqm_acte * lot.surface * 100) / 100);
      } else if (lotPricingConfig?.sale_price_computed) {
        acte = String(lotPricingConfig.sale_price_computed);
      }
      setAmounts({ ...EMPTY_AMOUNTS, agreedTotalPrice: agreed, salePrice: acte });
    }
    if (newMode === 'update_notaire') {
      setNotaryDate(lot?.notary_date || '');
      if (lot?.notaire_id) {
        const existing = notaires.find(n => n.id === lot.notaire_id);
        setSelectedNotaire(existing || null);
      } else {
        setSelectedNotaire(null);
      }
    }
    if (newMode === 'to_notaire') {
      setSelectedNotaire(null);
      setNotaryDate('');
    }
    if (newMode === 'complete_lot') {
      setEditForm({
        price_per_sqm: lot?.price_per_sqm ? lot.price_per_sqm.toString() : '',
        price_per_sqm_acte: lot?.price_per_sqm_acte ? lot.price_per_sqm_acte.toString() : '',
        surface: lot?.surface ? lot.surface.toString() : '',
        zone: lot?.zone || '',
        type_lot: lot?.type_lot || '',
        emplacement: lot?.emplacement || '',
        type_maison: lot?.type_maison || '',
      });
    }
  };

  const handleActivateLot = async () => {
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/activate`, {});
      toast.success('Lot activé — disponible');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Champs obligatoires manquants'); }
    finally { setLoading(false); }
  };

  const handleCompleteLot = async () => {
    if (!editForm.price_per_sqm || parseFloat(editForm.price_per_sqm) <= 0) { toast.warning('Le prix/m² catalogue est requis'); return; }
    if (!editForm.surface || parseFloat(editForm.surface) <= 0) { toast.warning('La surface est requise'); return; }
    const price_per_sqm = parseFloat(editForm.price_per_sqm);
    const price_per_sqm_acte = editForm.price_per_sqm_acte ? parseFloat(editForm.price_per_sqm_acte) : null;
    const surface = parseFloat(editForm.surface);
    const computedPrice = Math.round(price_per_sqm * surface * 100) / 100;
    setLoading(true);
    try {
      await apiPut(`/api/lots/${lot.id}`, {
        price_per_sqm,
        price_per_sqm_acte,
        price: computedPrice,
        surface,
        zone: editForm.zone.trim() || null,
        type_lot: editForm.type_lot.trim() || null,
        emplacement: editForm.emplacement.trim() || null,
        type_maison: editForm.type_maison.trim() || null,
      });
      await apiPost(`/api/lots/${lot.id}/transitions/activate`, {});
      toast.success('Lot activé — disponible');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur lors de la mise à jour'); }
    finally { setLoading(false); }
  };

  const handleStartOption = async () => {
    if (!selectedClient) { toast.warning('Veuillez sélectionner un client'); return; }
    const days = parseInt(reservationDays) || 7;
    if (days < 1 || days > 365) { toast.warning('Le nombre de jours doit être entre 1 et 365'); return; }
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + days);
    setLoading(true);
    try {
      const res = await apiPost(`/api/lots/${lot.id}/transitions/start-option`, {
        client_id: selectedClient.id,
        expiration_date: expDate.toISOString(),
        notes: notes || undefined,
      });
      toast.success('Option démarrée avec succès');
      await onStepDone({ kind: 'option_confirmee', reservationId: res.id, clientId: res.client_id });
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleCancelOption = async () => {
    setLoading(true);
    try {
      const url = notes.trim()
        ? `/api/lots/${lot.id}/transitions/cancel-option?reason=${encodeURIComponent(notes.trim())}`
        : `/api/lots/${lot.id}/transitions/cancel-option`;
      await apiPost(url, {});
      toast.success('Option annulée — lot disponible');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleDirectReservation = async () => {
    if (!selectedClient) { toast.warning('Veuillez sélectionner un client'); return; }
    if (!guaranteeAmount || parseFloat(guaranteeAmount) <= 0) { toast.warning('Le montant de garantie est requis'); return; }
    if (!finalizationDate) { toast.warning('La date de finalisation est requise'); return; }
    setLoading(true);
    try {
      const res = await apiPost(`/api/lots/${lot.id}/transitions/direct-reservation`, {
        client_id: selectedClient.id,
        guarantee_amount: parseFloat(guaranteeAmount),
        payment_type: paymentType,
        finalization_date: new Date(finalizationDate).toISOString(),
        notes: notes || undefined,
      });
      toast.success('Réservation à finaliser créée');
      await onStepDone({ kind: 'reservation_a_finaliser', reservationId: res.id, clientId: res.client_id });
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleDirectEngage = async () => {
    if (!selectedClient) { toast.warning('Veuillez sélectionner un client'); return; }
    const amountsError = typedFirstPaymentError();
    if (amountsError) { toast.warning(amountsError); return; }
    setLoading(true);
    try {
      const res = await apiPost(`/api/lots/${lot.id}/transitions/direct-engage`, engageBody({
        client_id: selectedClient.id,
        guarantee_amount: parseAmount(amounts.firstPayment),
        payment_type: paymentType,
        notes: notes || undefined,
      }));
      toast.success('Réservation engagée créée');
      await onStepDone({ kind: 'reservation_engagee', reservationId: res.id, clientId: res.client_id });
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  // option → reservation_engagee (project without « réservation à finaliser »)
  const handleOptionEngage = async () => {
    const amountsError = typedFirstPaymentError();
    if (amountsError) { toast.warning(amountsError); return; }
    const optionDeposit = reservation?.deposit ?? lot?.deposit ?? 0;
    let depositFields = {};
    if (optionDeposit > 0) {
      if (!validationChoice) { toast.warning("Indiquez si l'acompte de l'option est déduit ou remboursé"); return; }
      const refundError = validationChoice === 'refund' ? refundFormError() : null;
      if (refundError) { toast.warning(refundError); return; }
      depositFields = {
        deposit_action: validationChoice,
        ...(validationChoice === 'refund' ? refundFields(releaseData) : {}),
      };
    }
    setLoading(true);
    try {
      const res = await apiPost(`/api/lots/${lot.id}/transitions/option-engage`, engageBody({
        guarantee_amount: parseAmount(amounts.firstPayment),
        payment_type: paymentType,
        notes: notes || undefined,
        ...depositFields,
      }));
      toast.success('Réservation engagée');
      await onStepDone({ kind: 'reservation_engagee', reservationId: res.id, clientId: res.client_id });
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleEdlFinalize = async () => {
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/edl-finalize`, {});
      toast.success('État des lieux finalisé');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleExtendOption = async () => {
    const days = parseInt(extendDays) || 7;
    if (days < 1 || days > 365) { toast.warning('La durée doit être entre 1 et 365 jours'); return; }
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/extend-option?additional_days=${days}`, {});
      toast.success(`Option prolongée de ${days} jour${days > 1 ? 's' : ''}`);
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleToReservation = async () => {
    if (!guaranteeAmount || parseFloat(guaranteeAmount) <= 0) { toast.warning('Le montant de garantie est requis'); return; }
    if (!finalizationDate) { toast.warning('La date de finalisation est requise'); return; }
    setLoading(true);
    try {
      const res = await apiPost(`/api/lots/${lot.id}/transitions/to-reservation`, {
        guarantee_amount: parseFloat(guaranteeAmount),
        finalization_date: new Date(finalizationDate).toISOString(),
        payment_type: paymentType,
        notes: notes || undefined,
      });
      toast.success('Réservation à finaliser');
      await onStepDone({ kind: 'reservation_a_finaliser', reservationId: res.id, clientId: res.client_id });
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleFinaliserRefund = async () => {
    const amount = releaseData.deposit_refund_amount !== '' ? parseFloat(releaseData.deposit_refund_amount) : null;
    if (amount === null || amount < 0) { toast.warning('Le montant remboursé est requis (0 si aucun remboursement)'); return; }
    if (!releaseData.deposit_refund_date) { toast.warning('La date de remboursement est requise'); return; }
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/refund`, {
        refund_amount: amount,
        refund_date: releaseData.deposit_refund_date,
        release_reason: releaseData.release_reason.trim() || null,
      });
      toast.success('Garantie remboursée — lot disponible');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  // Build payment_plan block from state — returns undefined if plan not enabled
  const _buildPaymentPlanPayload = () => {
    if (!enablePaymentPlan) return undefined;
    return {
      deposit_pct: parseFloat(paymentPlan.deposit_pct) || 50,
      deposit_start_date: paymentPlan.deposit_start_date || undefined,
      balance_delay_months: parseInt(paymentPlan.balance_delay_months) || 0,
      deposit_count: parseInt(paymentPlan.deposit_count) || 1,
      deposit_periodicity: parseInt(paymentPlan.deposit_periodicity) || 1,
      balance_count: parseInt(paymentPlan.balance_count) || 1,
      balance_periodicity: parseInt(paymentPlan.balance_periodicity) || 1,
    };
  };

  // Body of an engagement: `fields` + agreed price, deed price, gap timing and payment plan
  function engageBody(fields) {
    return buildEngagePayload({ amounts, paymentPlan: _buildPaymentPlanPayload(), ...fields });
  }

  // Amounts error of a direct / option engagement (typed first payment, required), else null
  function typedFirstPaymentError() {
    const error = firstAmountsError(amounts);
    if (error) return error;
    if (!(parseAmount(amounts.firstPayment) > 0)) return 'Le premier acompte reçu est requis';
    return null;
  }

  // Warning for an incomplete refund form (guarantee or option deposit), else null
  function refundFormError() {
    const amount = releaseData.deposit_refund_amount !== '' ? parseFloat(releaseData.deposit_refund_amount) : null;
    if (amount === null || amount < 0) return 'Le montant remboursé est requis';
    if (!releaseData.deposit_refund_date) return 'La date de remboursement est requise';
    return null;
  }

  const handleFinaliserEngage = async () => {
    const amountsError = firstAmountsError(amounts, { firstPayment: activeGuaranteeAmount() });
    if (amountsError) { toast.warning(amountsError); return; }
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/engage`, engageBody({ guarantee_action: 'deduct' }));
      toast.success('Réservation engagée — garantie déduite');
      await onStepDone({ kind: 'reservation_engagee', reservationId: lot.reservation_id, clientId: lot.client_id });
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleFinaliserEngageWithRefund = async () => {
    const refundError = refundFormError();
    if (refundError) { toast.warning(refundError); return; }
    const amountsError = firstAmountsError(amounts, { firstPayment: 0 });
    if (amountsError) { toast.warning(amountsError); return; }
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/engage`, engageBody({
        guarantee_action: 'refund',
        ...refundFields(releaseData),
      }));
      toast.success('Garantie rendue au client — réservation engagée');
      await onStepDone({ kind: 'reservation_engagee', reservationId: lot.reservation_id, clientId: lot.client_id });
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  // Guarantee kept as first payment when engaging a reservation to finalise
  function activeGuaranteeAmount() {
    return reservation?.guarantee_amount ?? lot?.guarantee_amount ?? 0;
  }

  const handleSetNotaireIntent = async (wantsNotaire) => {
    if (!lot?.id) return;
    setSettingNotaireIntent(true);
    try {
      const updatedRes = await apiPost(`/api/lots/${lot.id}/transitions/set-notaire-intent`, {
        wants_notaire: wantsNotaire,
      });
      setReservation(updatedRes);
      toast.success(wantsNotaire
        ? 'Client positionné pour le passage chez le notaire'
        : 'Intention notaire retirée');
      if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setSettingNotaireIntent(false); }
  };

  const handleDownloadCertificate = async () => {
    if (!lot?.reservation_id) return;
    setDownloadingDoc(true);
    try {
      const response = await apiFetch(`/api/reservations/${lot.reservation_id}/certificate`);
      if (!response.ok) {
        // threshold refusal: 400 `message`; other errors may carry `detail`
        throw buildApiError(await response.json().catch(() => ({})), response.status);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acte_reservation_${lot.reservation_id}_lot${lot.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) { toast.error(error.message || 'Erreur lors de la génération'); }
    finally { setDownloadingDoc(false); }
  };

  const handleDownloadReceipt = async () => {
    if (!lot?.reservation_id) return;
    setDownloadingDoc(true);
    try {
      const response = await apiFetch(`/api/reservations/${lot.reservation_id}/receipt`);
      if (!response.ok) {
        throw buildApiError(await response.json().catch(() => ({})), response.status);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recu_paiement_${lot.reservation_id}_lot${lot.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) { toast.error(error.message || 'Erreur lors de la génération'); }
    finally { setDownloadingDoc(false); }
  };

  // The sale is recorded at the agreed total price (backend); no price is typed any more
  const handleToSoldee = async () => {
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/solde`, { notes: notes || undefined });
      toast.success('Lot soldé — vente enregistrée');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleToNotaire = async () => {
    if (!selectedNotaire) { toast.warning('Veuillez sélectionner un notaire'); return; }
    if (!notaryDate) { toast.warning('La date de l\'acte est requise'); return; }
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/notaire`, {
        notaire_id: selectedNotaire.id,
        notary_date: notaryDate,
        notes: notes || undefined,
      });
      toast.success('Lot passé chez le notaire');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleUpdateNotaire = async () => {
    if (!selectedNotaire) { toast.warning('Veuillez sélectionner un notaire'); return; }
    if (!notaryDate) { toast.warning('La date de l\'acte est requise'); return; }
    setLoading(true);
    try {
      await apiPut(`/api/lots/${lot.id}/transitions/notaire`, {
        notaire_id: selectedNotaire.id,
        notary_date: notaryDate,
      });
      toast.success('Informations notaire mises à jour');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleToProprietaire = async () => {
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/proprietaire`, {});
      toast.success('Lot transféré chez le propriétaire');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleBlock = async () => {
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/block`, { reason: blockReason.trim() || null });
      toast.success('Lot bloqué');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleUnblock = async () => {
    setLoading(true);
    try {
      await apiPost(`/api/lots/${lot.id}/transitions/unblock`, {});
      toast.success('Lot débloqué — disponible');
      onClose(); if (onRefresh) onRefresh();
    } catch (error) { toast.error(error.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  if (!lot) return null;

  // Actions offered = transitions allowed for this status by the project settings
  const allowed = new Set(allowedTransitions(lot.status, enabledOptionalStatuses));
  const can = (transition) => allowed.has(transition);

  // Source de vérité pour la garantie : API reservation > lot prop > 0
  const activeGuarantee = reservation?.guarantee_amount ?? lot?.guarantee_amount ?? 0;
  // Acompte versé pendant l'option (déduit ou remboursé à l'engagement)
  const optionDeposit = reservation?.deposit ?? lot?.deposit ?? 0;
  const decisionIcons = { refund: <IcUnlock />, deduct: <IcCheck />, money: <IcMoney />, calendar: <IcCalendar />, payments: <IcPayments /> };
  const activePaymentType = reservation?.payment_type ?? lot?.payment_type ?? null;

  // Remaining balance after initial deposit — used as base for payment plan
  const remainingBalance = lot.price
    ? Math.max(0, lot.price - (parseFloat(depositAmount) || 0))
    : 0;

  const expiryDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (parseInt(reservationDays) || 7));
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  })();

  // First deposit installment (financial summary) — for the overdue alert
  const firstDepositInstallment = financeSummary?.installments
    ?.filter(i => i.payment_type === 'deposit')
    .sort((a, b) => a.installment_number - b.installment_number)[0] ?? null;
  const firstPaymentIsOverdue = firstDepositInstallment != null && firstDepositInstallment.status !== 'paid'
    && new Date(firstDepositInstallment.due_date) < new Date();
  // Payments are recorded on an engaged reservation, by its commercial or a manager
  const canRecordPayments = lot.status === 'reservation_engagee'
    && (isManager || (lot.reserved_by_user_id != null && lot.reserved_by_user_id === user?.id));
  const showFinance = ACTE_STATUSES.includes(lot.status) && !!lot.reservation_id;
  const lotStats = [
    lot.surface && { icon: <IcSurface />, value: `${lot.surface} m²`, label: 'Surface' },
    (lot.price_per_sqm || (lot.price && lot.surface && lot.surface > 0)) && {
      icon: <IcChart />,
      value: `${Math.round(lot.price_per_sqm ?? (lot.price / lot.surface)).toLocaleString('fr-FR')} MAD`,
      label: 'Prix/m² catalogue'
    },
    lot.price_per_sqm_acte && {
      icon: <IcChart />,
      value: `${Math.round(lot.price_per_sqm_acte).toLocaleString('fr-FR')} MAD`,
      label: 'Prix/m² acte'
    },
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
        <div className="modal ldm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
          <div className="modal-header ldm-modal-header">
            <div className="ldm-header-id">
              <span className="ldm-header-eyebrow">Lot</span>
              <h2 className="modal-title ldm-header-number">{lot.numero}</h2>
            </div>
            <button className="modal-close" onClick={onClose}><IcClose /></button>
          </div>
          <div className="modal-body">
            <div className="ldm-price-row">
              <div className="ldm-price-block">
                <div className="lot-price-main">{formatPrice(lot.price)}</div>
                {lot.price_per_sqm
                  ? <div className="lot-price-per-m2">{lot.price_per_sqm.toLocaleString('fr-FR')} MAD/m² <span className="lot-price-tag">catalogue</span></div>
                  : (lot.surface && lot.price && lot.surface > 0)
                    ? <div className="lot-price-per-m2">{formatPrice(lot.price / lot.surface)}/m² <span className="lot-price-tag">catalogue</span></div>
                    : null
                }
                {lot.price_per_sqm_acte && (
                  <div className="lot-price-per-m2 lot-price-acte">
                    {lot.surface
                      ? <>{formatPrice(Math.round(lot.price_per_sqm_acte * lot.surface * 100) / 100)} <span className="lot-price-tag">acte</span></>
                      : <>{lot.price_per_sqm_acte.toLocaleString('fr-FR')} MAD/m² <span className="lot-price-tag">acte</span></>
                    }
                  </div>
                )}
              </div>
              <span className={`status-badge status-badge--pill ${lot.status}`}>
                <span className="status-dot"></span>{STATUS_LABELS[lot.status]}
              </span>
            </div>

            <div className="ldm-divider" />

            {lotStats.length > 0 && <div className="ldm-section-label">Caractéristiques</div>}
            <div className="ldm-stats-grid">
              {lotStats.map((s, i) => (
                <div key={i} className="ldm-stat-cell">
                  <div className="ldm-stat-icon">{s.icon}</div>
                  <div className="ldm-stat-text">
                    <div className="ldm-stat-value">{s.value}</div>
                    <div className="ldm-stat-label">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {lot.status === 'blocked' && (
              <div className="ldm-reservation-info">
                <div className="ldm-ri-header">
                  <IcLock />
                  <span>Lot bloqué</span>
                </div>
                <div className="ldm-ri-rows">
                  <div className="ldm-ri-row">
                    <span className="ldm-ri-key">Motif</span>
                    <span className="ldm-ri-val">{lot.blocked_reason || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {ACTIVE_LOT_STATUSES.includes(lot.status) && lot.client_name && (
              <div className="ldm-reservation-info">
                <div className="ldm-ri-header">
                  <IcUser />
                  <span>{STATUS_LABELS[lot.status]}</span>
                </div>
                <ExpiredAlert status={lot.status} expirationDate={lot.expiration_date} />
                <div className="ldm-ri-rows">
                  <div className="ldm-ri-row"><span className="ldm-ri-key">Client</span><span className="ldm-ri-val">{lot.client_name}</span></div>
                  {lot.client_phone && <div className="ldm-ri-row"><span className="ldm-ri-key">Téléphone</span><span className="ldm-ri-val">{lot.client_phone}</span></div>}
                  {lot.reserved_by_name && <div className="ldm-ri-row"><span className="ldm-ri-key">Suivi par</span><span className="ldm-ri-val">{lot.reserved_by_name}</span></div>}
                  {lot.reservation_date && <div className="ldm-ri-row"><span className="ldm-ri-key">Date option</span><span className="ldm-ri-val">{formatDate(lot.reservation_date)}</span></div>}
                  {lot.expiration_date && <div className="ldm-ri-row"><span className="ldm-ri-key">Expiration</span><span className="ldm-ri-val" style={{ color: new Date(lot.expiration_date) < new Date() ? 'var(--color-error)' : 'var(--color-warning)' }}>{formatDate(lot.expiration_date)}</span></div>}
                  {lot.deposit > 0 && <div className="ldm-ri-row"><span className="ldm-ri-key">Acompte initial</span><span className="ldm-ri-val ldm-ri-val--bold">{formatPrice(lot.deposit)}</span></div>}
                  {activeGuarantee > 0 && <div className="ldm-ri-row"><span className="ldm-ri-key">Garantie</span><span className="ldm-ri-val ldm-ri-val--bold">{formatPrice(activeGuarantee)}</span></div>}
                  {activePaymentType && <div className="ldm-ri-row"><span className="ldm-ri-key">Paiement garantie</span><span className="ldm-ri-val">{PAYMENT_TYPES.find(p => p.value === activePaymentType)?.label || activePaymentType}</span></div>}
                  {lot.notary_name && <div className="ldm-ri-row"><span className="ldm-ri-key">Notaire</span><span className="ldm-ri-val">{lot.notary_name}</span></div>}
                  {lot.notary_date && <div className="ldm-ri-row"><span className="ldm-ri-key">Date acte</span><span className="ldm-ri-val">{formatDate(lot.notary_date)}</span></div>}
                  {/* Tag intention notaire — visible pour reservation_soldee et les statuts EDL */}
                  {can('set_notaire_intent') && (
                    <div className="ldm-ri-row">
                      <span className="ldm-ri-key">Chez le notaire</span>
                      <span className="ldm-ri-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {reservation?.wants_notaire
                          ? <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Souhaité</span>
                          : <span className="badge badge-gray" style={{ fontSize: '0.65rem' }}>Non encore</span>
                        }
                      </span>
                    </div>
                  )}
                  {/* Montants de la réservation engagée (spec E4-T5) */}
                  {ACTE_STATUSES.includes(lot.status) && reservation?.sale_price != null && (
                    <>
                      <div className="ldm-ri-row">
                        <span className="ldm-ri-key">Prix figurant sur l'acte</span>
                        <span className="ldm-ri-val ldm-ri-val--bold">{formatPrice(reservation.sale_price)}</span>
                      </div>
                      {(reservation.gap_amount ?? 0) > 0 && (
                        <div className="ldm-ri-row">
                          <span className="ldm-ri-key">Écart à régulariser</span>
                          <span className="ldm-ri-val">
                            {formatPrice(reservation.gap_amount)}
                            {reservation.gap_due_timing === 'date'
                              ? ` — le ${formatDate(reservation.gap_due_date)}`
                              : GAP_TIMING_TEXT[reservation.gap_due_timing] ? ` — ${GAP_TIMING_TEXT[reservation.gap_due_timing]}` : ''}
                          </span>
                        </div>
                      )}
                      <div className="ldm-ri-row">
                        <span className="ldm-ri-key">Premier acompte reçu</span>
                        <span className="ldm-ri-val">{formatPrice(reservation.first_payment)}</span>
                      </div>
                    </>
                  )}
                  {/* Acte de réservation archivé */}
                  {ACTE_STATUSES.includes(lot.status) && documentsError && (
                    <div className="ldm-ri-row">
                      <span className="ldm-ri-key">Documents indisponibles.</span>
                    </div>
                  )}
                  {ACTE_STATUSES.includes(lot.status) && documentsLoaded && (() => {
                    const acte = latestActe;
                    if (acte) {
                      return (
                        <div className="ldm-ri-row">
                          <span className="ldm-ri-key">Acte</span>
                          <span className="ldm-ri-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Acte de réservation</span>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDownloadDocument(acte)}>
                              Télécharger
                            </button>
                          </span>
                        </div>
                      );
                    }
                    // No deed yet: legitimately waiting for the paid threshold, or a failed generation
                    if (!financeSummary) return null;
                    if (!financeSummary.acte_available) {
                      return (
                        <div className="ldm-ri-row">
                          <span className="ldm-ri-key" style={{ color: 'var(--color-warning)' }}>{acteThresholdMessage(financeSummary)}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="ldm-ri-row">
                        <span className="ldm-ri-key" style={{ color: 'var(--color-warning)' }}>L'acte n'a pas été généré.</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={handleRegenerateActe} disabled={regeneratingActe}>
                          {regeneratingActe ? 'Génération...' : 'Régénérer'}
                        </button>
                      </div>
                    );
                  })()}
                </div>
                {firstPaymentIsOverdue && (
                  <div className="ldm-first-payment-alert">
                    <div className="ldm-fpa-icon"><IcAlertTriangle /></div>
                    <div className="ldm-fpa-body">
                      <div className="ldm-fpa-title">Premier versement en retard</div>
                      <div className="ldm-fpa-desc">
                        Échéance du {formatDate(firstDepositInstallment.due_date)} — restant dû {formatPrice(firstDepositInstallment.remaining)}.
                        {canRecordPayments && ' Enregistrez l\'encaissement dans l\'échéancier.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Échéancier et encaissements (réservation engagée et au-delà) ── */}
          {showFinance && (
            <div className="ldm-documents-section">
              <div className="ldm-section-label">Échéancier et encaissements</div>
              <PaymentsPanel
                key={lot.reservation_id}
                reservationId={lot.reservation_id}
                canRecord={canRecordPayments}
                showActeStatus={false}
                onSummaryChange={reportFinanceSummary}
                onPaymentRecorded={handlePaymentRecorded}
              />
            </div>
          )}

          {/* ── Notifications ── */}
          <div className="ldm-documents-section">
            <div className="ldm-section-label">Notifications</div>
            <NotificationHistory lotId={lot.id} />
          </div>

          {/* ── Documents notariés ── */}
          {['chez_notaire', 'chez_proprietaire'].includes(lot.status) && (
            <div className="ldm-documents-section">
              <div className="ldm-documents-header">
                <div className="ldm-section-label" style={{ margin: 0 }}>
                  <IcFile /> Documents
                  {documents.length > 0 && (
                    <span className="badge badge-gray" style={{ fontSize: '0.65rem', marginLeft: 6 }}>{documents.length}</span>
                  )}
                </div>
                {lot.status === 'chez_notaire' && (
                  <>
                    <input
                      ref={docFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                      style={{ display: 'none' }}
                      onChange={handleUploadDocument}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}
                      onClick={() => docFileInputRef.current?.click()}
                      disabled={uploadingDoc}
                    >
                      <IcUpload />{uploadingDoc ? 'Upload...' : 'Ajouter'}
                    </button>
                  </>
                )}
              </div>
              {documents.length === 0 ? (
                <div className="ldm-documents-empty">Aucun document</div>
              ) : (
                <div className="ldm-documents-list">
                  {documents.map(doc => (
                    <div key={doc.id} className="ldm-doc-row">
                      <div className="ldm-doc-icon"><IcFile /></div>
                      <div className="ldm-doc-name" title={doc.filename}>{doc.filename}</div>
                      <div className="ldm-doc-actions">
                        <button
                          className="ldm-doc-btn"
                          onClick={() => handleDownloadDocument(doc)}
                          title="Télécharger"
                        >
                          <IcDownload />
                        </button>
                        {lot.status === 'chez_notaire' && doc.category !== ACTE_CATEGORY && (
                          <button
                            className="ldm-doc-btn ldm-doc-btn--danger"
                            onClick={() => handleDeleteDocument(doc.id)}
                            title="Supprimer"
                          >
                            <IcTrash />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {EDL_STATUSES.includes(lot.status) && (
            <EdlPanel key={lot.id} lot={lot} onOpenCountChange={reportEdlOpenCount} />
          )}

          <div className="modal-footer ldm-footer">
            {lot.status === 'creation' && can('activate') && (() => {
              const missingFields = [!lot.price && 'Prix', !lot.surface && 'Surface'].filter(Boolean);
              const canActivate = missingFields.length === 0;
              return (
                <>
                  {!canActivate && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-warning)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <IcAlertTriangle /> Manquant : {missingFields.join(', ')}
                    </span>
                  )}
                  <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('complete_lot')}>
                    Compléter
                  </button>
                  <button className="btn btn-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={handleActivateLot} disabled={loading || !canActivate}
                    title={!canActivate ? `Complétez d'abord : ${missingFields.join(', ')}` : ''}>
                    <IcCheck /> Activer
                  </button>
                </>
              );
            })()}
            {lot.status === 'available' && (
              <>
                {can('start_option') && (
                  <button className="btn btn-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('start_option')}><IcLock /> Option</button>
                )}
                {can('direct_reservation') && (
                  <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('direct_reservation')}><IcCheck /> Résa. à finaliser</button>
                )}
                {can('direct_engage') && (
                  <button className="btn btn-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('direct_engage')}><IcCheck /> Résa. engagée</button>
                )}
                {can('block') && (
                  <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('block')}><IcLock /> Bloquer</button>
                )}
              </>
            )}
            {lot.status === 'option' && (() => {
              const canManage = isManager || (lot.reserved_by_user_id && lot.reserved_by_user_id === user?.id);
              return (
                <>
                  {can('cancel_option') && (
                    <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleSetMode('cancel_option')} disabled={!canManage}
                      title={!canManage ? 'Seul le commercial responsable ou un manager peut annuler' : ''}>
                      <IcUnlock /> Annuler option
                    </button>
                  )}
                  {can('extend_option') && (
                    <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleSetMode('extend_option')} disabled={!canManage}
                      title={!canManage ? 'Seul le commercial responsable ou un manager peut prolonger' : ''}>
                      <IcCalendar /> Prolonger
                    </button>
                  )}
                  {can('to_reservation') && (
                    <button className="btn btn-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleSetMode('to_reservation')} disabled={!canManage}
                      title={!canManage ? 'Seul le commercial responsable ou un manager peut valider' : ''}>
                      <IcCheck /> Passer à réservation à finaliser
                    </button>
                  )}
                  {can('option_engage') && (
                    <button className="btn btn-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleSetMode('option_engage')} disabled={!canManage}
                      title={!canManage ? 'Seul le commercial responsable ou un manager peut engager' : 'Engager la réservation'}>
                      <IcCheck /> Engager
                    </button>
                  )}
                </>
              );
            })()}
            {lot.status === 'reservation_a_finaliser' && (() => {
              const canManage = isManager || (lot.reserved_by_user_id && lot.reserved_by_user_id === user?.id);
              return (
                <>
                  {can('refund') && (
                    <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleSetMode('finaliser_refund')} disabled={!canManage}>
                      <IcUnlock /> Rembourser
                    </button>
                  )}
                  {can('engage') && (
                    <button className="btn btn-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleSetMode('finaliser_engage')} disabled={!canManage}>
                      <IcCheck /> Valider
                    </button>
                  )}
                </>
              );
            })()}
            {lot.status === 'reservation_engagee' && (
              <>
                {/* Document : acte une fois le seuil d'encaissement atteint, reçu dès le premier acompte */}
                {financeSummary?.acte_available ? (
                  <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={handleDownloadCertificate} disabled={downloadingDoc}
                    title="Télécharger l'acte de réservation PDF">
                    <IcDownload /> {downloadingDoc ? 'Génération...' : 'Acte de réservation'}
                  </button>
                ) : (financeSummary?.first_payment ?? 0) > 0 && (
                  <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={handleDownloadReceipt} disabled={downloadingDoc}
                    title="Télécharger le reçu de paiement (acte pas encore disponible)">
                    <IcDownload /> {downloadingDoc ? 'Génération...' : 'Reçu de paiement'}
                  </button>
                )}
                {can('solde') && (() => {
                  // Soldable only once nothing is left to pay (gap included) — checked again by the backend
                  const allPaid = financeSummary != null && financeSummary.remaining <= 0;
                  return (
                    <button
                      className="btn btn-success"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...(!allPaid ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                      onClick={() => allPaid && handleSetMode('to_soldee')}
                      disabled={!allPaid}
                      title={!allPaid
                        ? (financeSummary ? `Reste à payer : ${formatPrice(financeSummary.remaining)} — la réservation ne peut pas être soldée.` : "Chargement de l'échéancier…")
                        : 'Marquer le lot comme soldé'}
                    >
                      <IcCheck /> Marquer soldé
                    </button>
                  );
                })()}
              </>
            )}
            {['reservation_soldee', ...EDL_STATUSES].includes(lot.status) && (
              <>
                {/* Tag : intention notaire */}
                {!can('set_notaire_intent') ? null : reservation?.wants_notaire ? (
                  <button
                    className="btn btn-warning"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetNotaireIntent(false)}
                    disabled={settingNotaireIntent}
                    title="Retirer l'intention de passer chez le notaire">
                    <IcTag /> {settingNotaireIntent ? 'En cours...' : 'Notaire : Oui'}
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetNotaireIntent(true)}
                    disabled={settingNotaireIntent}
                    title="Marquer que le client souhaite passer chez le notaire">
                    <IcTag /> {settingNotaireIntent ? 'En cours...' : 'Notaire : Non'}
                  </button>
                )}
                {/* États des lieux (projets avec EDL) */}
                {can('edl_schedule') && (
                  <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('edl_schedule')}>
                    <IcCalendar /> Programmer l'EDL
                  </button>
                )}
                {can('edl_reschedule') && (
                  <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('edl_reschedule')}>
                    <IcCalendar /> Reprogrammer
                  </button>
                )}
                {can('edl_done') && (
                  <button className="btn btn-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('edl_done')}>
                    <IcCheck /> EDL réalisé
                  </button>
                )}
                {can('edl_finalize') && (
                  <>
                    {edlOpenCount > 0 && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-warning)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <IcAlertTriangle /> {openEdlActionsLabel(edlOpenCount)}
                      </span>
                    )}
                    <button className="btn btn-success"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...(edlOpenCount !== 0 ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                      onClick={handleEdlFinalize} disabled={loading || edlOpenCount !== 0}
                      title={edlOpenCount === null
                        ? 'Chargement des actions…'
                        : edlOpenCount > 0 ? 'Toutes les actions doivent être faites avant de finaliser' : "Finaliser l'état des lieux"}>
                      <IcCheck /> Finaliser l'EDL
                    </button>
                  </>
                )}
                {/* Passage chez le notaire — seulement si intention confirmée */}
                {can('notaire') && (
                  <button
                    className="btn btn-primary"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      ...(!reservation?.wants_notaire ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                    }}
                    onClick={() => reservation?.wants_notaire && handleSetMode('to_notaire')}
                    disabled={!reservation?.wants_notaire}
                    title={!reservation?.wants_notaire
                      ? "Activez d'abord le tag 'Notaire : Oui' pour ce lot"
                      : 'Passer chez le notaire'}>
                    <IcCalendar /> Chez le notaire
                  </button>
                )}
              </>
            )}
            {lot.status === 'chez_notaire' && (
              <>
                {isManager && can('proprietaire') && (
                  <button className="btn btn-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('to_proprietaire')}>
                    <IcHome /> Confirmer acte
                  </button>
                )}
                {can('notaire_update') && (
                  <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSetMode('update_notaire')}>
                    <IcCompass /> Modifier notaire
                  </button>
                )}
              </>
            )}
            {lot.status === 'blocked' && isManager && can('unblock') && (
              <button className="btn btn-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => handleSetMode('unblock')}>
                <IcUnlock /> Libérer
              </button>
            )}
            <button className="btn btn-ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>Fermer</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── FORM VIEW — split layout ────────────────────────────── */
  const modeTitles = {
    complete_lot: "Compléter la fiche",
    start_option: "Mettre en option",
    extend_option: "Prolonger l'option",
    direct_reservation: "Réservation à finaliser (direct)",
    direct_engage: "Réservation engagée (direct)",
    option_engage: "Engager la réservation (option)",
    edl_schedule: "Programmer l'état des lieux",
    edl_reschedule: "Reprogrammer l'état des lieux",
    edl_done: "État des lieux réalisé",
    cancel_option: "Annuler l'option",
    to_reservation: "Passer à réservation à finaliser",
    finaliser_refund: "Rembourser la garantie",
    finaliser_engage: "Engager la réservation",
    to_soldee: "Marquer soldé",
    to_notaire: "Chez le notaire",
    update_notaire: "Modifier le notaire",
    to_proprietaire: "Confirmer l'acte notarial",
    block: "Bloquer le lot",
    unblock: "Débloquer le lot",
  };

  const isStartOption = mode === 'start_option';
  const isEngageMode = mode === 'direct_engage' || mode === 'finaliser_engage' || mode === 'option_engage';
  const isEdlMode = ['edl_schedule', 'edl_reschedule', 'edl_done'].includes(mode);
  const showThirdPanel = (isStartOption || isEngageMode) && enablePaymentPlan && lot.price;
  // Premier acompte reçu à l'engagement : saisi (direct / option, + acompte de l'option déduit),
  // ou la garantie conservée (réservation à finaliser), 0 si elle est rendue
  const finaliserFirstPayment = validationChoice === 'deduct' ? activeGuarantee : 0;
  const engageFirstPayment = mode === 'finaliser_engage'
    ? finaliserFirstPayment
    : (parseAmount(amounts.firstPayment) ?? 0) + (mode === 'option_engage' && validationChoice === 'deduct' ? optionDeposit : 0);
  const engageAgreed = parseAmount(amounts.agreedTotalPrice) ?? 0;
  // The schedule covers agreed − first payment, the gap on its own installment (spec E4-T5)
  const engagePreview = isEngageMode ? {
    agreed: engageAgreed,
    firstPayment: engageFirstPayment,
    gap: gapAmount(amounts.agreedTotalPrice, amounts.salePrice),
    gapTiming: amounts.gapDueTiming,
    gapDate: amounts.gapDueDate,
  } : null;
  const thirdPanelPrice = isEngageMode ? Math.max(0, engageAgreed - engageFirstPayment) : remainingBalance;
  const previewRowCount = showThirdPanel && thirdPanelPrice > 0
    ? computePreview(thirdPanelPrice, paymentPlan, engagePreview).allRows.length : 0;
  // Deed price hint: deed price per m² × surface
  const salePriceHint = lot?.surface && lot.surface > 0 && (lot?.price_per_sqm_acte || lotPricingConfig?.prix_m2_acte)
    ? `${Number(lot?.price_per_sqm_acte || lotPricingConfig.prix_m2_acte).toLocaleString('fr-FR')} MAD/m² acte × ${lot.surface} m²`
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${showThirdPanel ? 'modal--3col' : 'modal--split'}`} onClick={e => e.stopPropagation()}>

        {/* ── LEFT: Lot summary ── */}
        <div className="modal-split-left">
          <div className="msl-eyebrow">Lot</div>
          <div className="msl-num">{lot.numero}</div>
          {lot.zone && <div className="msl-zone">Zone {lot.zone}{lot.type_lot ? ` · ${lot.type_lot}` : ''}</div>}
          <div className="msl-price">{formatPrice(lot.price)}</div>
          {lot.price_per_sqm
            ? <div className="msl-price-m2">{lot.price_per_sqm.toLocaleString('fr-FR')} MAD/m² <span className="lot-price-tag">catalogue</span></div>
            : (lot.surface && lot.price && lot.surface > 0)
              ? <div className="msl-price-m2">{formatPrice(lot.price / lot.surface)}/m² <span className="lot-price-tag">catalogue</span></div>
              : null
          }
          {lot.price_per_sqm_acte && lot.surface && (
            <div className="msl-price-m2 lot-price-acte">
              {formatPrice(Math.round(lot.price_per_sqm_acte * lot.surface * 100) / 100)} <span className="lot-price-tag">acte</span>
            </div>
          )}
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
          {lot.client_name && (
            <div className="msl-reservation-tag"><IcUser /><span>{lot.client_name}</span></div>
          )}
        </div>

        {/* ── RIGHT: Form ── */}
        <div className="modal-split-right">
          <div className="msr-header">
            <div className="msr-header-left">
              <h3 className="msr-title">{modeTitles[mode] || mode}</h3>
              <div className="msr-subtitle">Lot {lot.numero}</div>
            </div>
            <button className="modal-close" onClick={onClose}><IcClose /></button>
          </div>

          {lot.price && !isEngageMode && (
            <div className="msr-price-pill">
              <span className="msr-price-pill-label">Prix catalogue</span>
              <span className="msr-price-pill-value">{formatPrice(lot.price)}</span>
            </div>
          )}
          {['direct_engage', 'finaliser_engage', 'option_engage'].includes(mode) && !lot.price_per_sqm_acte && lotPricingConfig?.sale_price_computed && Math.abs(lotPricingConfig.sale_price_computed - lot.price) > 1 && (
            <div className="msr-price-pill" style={{ background: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.25)' }}>
              <span className="msr-price-pill-label">Grille de prix (acte)</span>
              <span className="msr-price-pill-value" style={{ color: '#8b5cf6' }}>{formatPrice(lotPricingConfig.sale_price_computed)}</span>
            </div>
          )}

          {isEdlMode ? (
            <EdlTransitionForm
              mode={mode}
              lot={lot}
              onCancel={() => handleSetMode(null)}
              onDone={() => { onClose(); if (onRefresh) onRefresh(); }}
            />
          ) : (<>
          <div className="msr-form">

            {/* ── complete_lot form ── */}
            {mode === 'complete_lot' && (
              <>
                <div className="msr-section-head">
                  <IcChart />
                  <span className="msr-section-label">Valeurs numériques</span>
                </div>
                <div className="msr-fields-2">
                  <div className="msr-field-group">
                    <label className="msr-label">Prix/m² catalogue <span className="msr-required">*</span></label>
                    <div className="msr-price-input-wrap">
                      <input type="number" className="msr-price-input" placeholder="0" min="0" step="100"
                        value={editForm.price_per_sqm} onChange={e => setEditForm(f => ({ ...f, price_per_sqm: e.target.value }))} />
                      <span className="msr-price-input-currency">MAD/m²</span>
                    </div>
                  </div>
                  <div className="msr-field-group">
                    <label className="msr-label">Prix/m² acte <span className="msr-optional">(opt.)</span></label>
                    <div className="msr-price-input-wrap">
                      <input type="number" className="msr-price-input" placeholder="0" min="0" step="100"
                        value={editForm.price_per_sqm_acte} onChange={e => setEditForm(f => ({ ...f, price_per_sqm_acte: e.target.value }))} />
                      <span className="msr-price-input-currency">MAD/m²</span>
                    </div>
                  </div>
                </div>
                <div className="msr-fields-2">
                  <div className="msr-field-group">
                    <label className="msr-label">Surface <span className="msr-required">*</span></label>
                    <div className="msr-price-input-wrap">
                      <input type="number" className="msr-price-input" placeholder="0" min="0" step="1"
                        value={editForm.surface} onChange={e => setEditForm(f => ({ ...f, surface: e.target.value }))} />
                      <span className="msr-price-input-currency">m²</span>
                    </div>
                  </div>
                </div>
                {editForm.surface && parseFloat(editForm.surface) > 0 && (editForm.price_per_sqm || editForm.price_per_sqm_acte) && (
                  <div className="msr-price-computed-row">
                    {editForm.price_per_sqm && parseFloat(editForm.price_per_sqm) > 0 && (
                      <div className="msr-price-computed">
                        <span className="msr-price-computed-label">Prix catalogue</span>
                        <span className="msr-price-computed-value">{formatPrice(parseFloat(editForm.price_per_sqm) * parseFloat(editForm.surface))}</span>
                      </div>
                    )}
                    {editForm.price_per_sqm_acte && parseFloat(editForm.price_per_sqm_acte) > 0 && (
                      <div className="msr-price-computed msr-price-computed--acte">
                        <span className="msr-price-computed-label">Prix acte</span>
                        <span className="msr-price-computed-value">{formatPrice(parseFloat(editForm.price_per_sqm_acte) * parseFloat(editForm.surface))}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="msr-section-head">
                  <IcTag />
                  <span className="msr-section-label">Descriptif</span>
                </div>
                <div className="msr-fields-2">
                  <div className="msr-field-group">
                    <label className="msr-label">Type de lot <span className="msr-optional">(opt.)</span></label>
                    <input type="text" className="msr-input" placeholder="Résidentiel, Commercial…"
                      value={editForm.type_lot} onChange={e => setEditForm(f => ({ ...f, type_lot: e.target.value }))} />
                  </div>
                  <div className="msr-field-group">
                    <label className="msr-label">Zone <span className="msr-optional">(opt.)</span></label>
                    <input type="text" className="msr-input" placeholder="A1, B2…"
                      value={editForm.zone} onChange={e => setEditForm(f => ({ ...f, zone: e.target.value }))} />
                  </div>
                </div>
                <div className="msr-fields-2">
                  <div className="msr-field-group">
                    <label className="msr-label">Emplacement <span className="msr-optional">(opt.)</span></label>
                    <input type="text" className="msr-input" placeholder="2 façades, Angle…"
                      value={editForm.emplacement} onChange={e => setEditForm(f => ({ ...f, emplacement: e.target.value }))} />
                  </div>
                  <div className="msr-field-group">
                    <label className="msr-label">Type de maison <span className="msr-optional">(opt.)</span></label>
                    <input type="text" className="msr-input" placeholder="Villa, Appartement…"
                      value={editForm.type_maison} onChange={e => setEditForm(f => ({ ...f, type_maison: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {/* ── Expired alert for option / raf modes ── */}
            {(mode === 'cancel_option' || mode === 'to_reservation' || mode === 'finaliser_refund' || mode === 'finaliser_engage') && (
              <ExpiredAlert status={lot.status} expirationDate={lot.expiration_date} />
            )}

            {/* ── start_option form ── */}
            {isStartOption && (
              <>
                {/* Client selector */}
                <div className="msr-field-group">
                  <label className="msr-label"><IcUser /> Client <span className="msr-required">*</span></label>
                  <div className="msr-client-row">
                    <ClientPicker clients={clients} value={selectedClient} onChange={setSelectedClient} />
                    <button type="button" className="msr-btn-add-client"
                      onClick={() => setShowAddClient(!showAddClient)}>
                      {showAddClient ? <IcClose /> : <IcPlus />}
                      {showAddClient ? 'Annuler' : 'Nouveau'}
                    </button>
                  </div>
                  {showAddClient && (
                    <AddClientPanel onSubmit={handleCreateClient} onCancel={() => setShowAddClient(false)} />
                  )}
                </div>
                {/* Duration */}
                <div className="msr-field-group">
                  <label className="msr-label"><IcCalendar /> Durée de l'option <span className="msr-required">*</span></label>
                  <div className="msr-stepper">
                    <button type="button" className="msr-stepper-btn"
                      onClick={() => setReservationDays(d => Math.max(1, (parseInt(d) || 7) - 1))}>−</button>
                    <input type="number" className="msr-stepper-input" min="1" max="365"
                      value={reservationDays} onChange={e => setReservationDays(e.target.value)} />
                    <span className="msr-stepper-unit">jours</span>
                    <button type="button" className="msr-stepper-btn"
                      onClick={() => setReservationDays(d => Math.min(365, (parseInt(d) || 7) + 1))}>+</button>
                  </div>
                  <div className="msr-expiry-hint"><IcCalendar /> Expire le <strong>{expiryDate}</strong></div>
                </div>
                {/* Notes */}
                <div className="msr-field-group">
                  <label className="msr-label">Notes <span className="msr-optional">(optionnel)</span></label>
                  <textarea className="msr-textarea" placeholder="Ajouter une note..."
                    value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </>
            )}

            {/* ── direct_reservation form (available → RAF) ── */}
            {mode === 'direct_reservation' && (
              <>
                <div className="msr-field-group">
                  <label className="msr-label"><IcUser /> Client <span className="msr-required">*</span></label>
                  <div className="msr-client-row">
                    <ClientPicker clients={clients} value={selectedClient} onChange={setSelectedClient} />
                    <button type="button" className="msr-btn-add-client"
                      onClick={() => setShowAddClient(!showAddClient)}>
                      {showAddClient ? <IcClose /> : <IcPlus />}
                      {showAddClient ? 'Annuler' : 'Nouveau'}
                    </button>
                  </div>
                  {showAddClient && (
                    <AddClientPanel onSubmit={handleCreateClient} onCancel={() => setShowAddClient(false)} />
                  )}
                </div>
                <div className="msr-field-group">
                  <label className="msr-label"><IcMoney /> Montant de garantie <span className="msr-required">*</span></label>
                  <div className="msr-price-input-wrap">
                    <input type="number" className="msr-price-input" placeholder="Montant reçu"
                      min="0" step="1000" value={guaranteeAmount} onChange={e => setGuaranteeAmount(e.target.value)} />
                    <span className="msr-price-input-currency">MAD</span>
                  </div>
                </div>
                <div className="msr-field-group">
                  <label className="msr-label"><IcPayments /> Mode de paiement <span className="msr-required">*</span></label>
                  <select className="msr-select" value={paymentType} onChange={e => setPaymentType(e.target.value)}>
                    {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="msr-field-group">
                  <label className="msr-label"><IcCalendar /> Date limite de finalisation <span className="msr-required">*</span></label>
                  <input type="date" className="msr-input" value={finalizationDate} onChange={e => setFinalizationDate(e.target.value)} />
                </div>
                <div className="msr-field-group">
                  <label className="msr-label">Notes <span className="msr-optional">(optionnel)</span></label>
                  <textarea className="msr-textarea" placeholder="Ajouter une note..."
                    value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
              </>
            )}

            {/* ── direct_engage (available → engagée) / option_engage (option → engagée) form ── */}
            {(mode === 'direct_engage' || mode === 'option_engage') && (() => {
              return (
                <>
                  {/* Client — choisi en direct, celui de l'option sinon */}
                  {mode === 'direct_engage' ? (
                    <div className="msr-field-group">
                      <label className="msr-label"><IcUser /> Client <span className="msr-required">*</span></label>
                      <div className="msr-client-row">
                        <ClientPicker clients={clients} value={selectedClient} onChange={setSelectedClient} />
                        <button type="button" className="msr-btn-add-client"
                          onClick={() => setShowAddClient(!showAddClient)}>
                          {showAddClient ? <IcClose /> : <IcPlus />}
                          {showAddClient ? 'Annuler' : 'Nouveau'}
                        </button>
                      </div>
                      {showAddClient && (
                        <AddClientPanel onSubmit={handleCreateClient} onCancel={() => setShowAddClient(false)} />
                      )}
                    </div>
                  ) : lot.client_name && (
                    <div className="msr-field-group">
                      <label className="msr-label"><IcUser /> Client</label>
                      <div className="msr-client-locked">
                        <div className="msr-client-locked-monogram">{lot.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                        <div><div className="msr-client-locked-name">{lot.client_name}</div></div>
                      </div>
                    </div>
                  )}

                  {/* Montants : prix total convenu, prix sur l'acte, écart, premier acompte reçu */}
                  <EngagementAmountsFields
                    cataloguePrice={lot.price ?? null}
                    value={amounts}
                    onChange={setAmounts}
                    salePriceHint={salePriceHint}
                    firstPaymentHint={mode === 'option_engage' && validationChoice === 'deduct' && optionDeposit > 0
                      ? `+ acompte de l'option conservé : ${formatPrice(optionDeposit)}`
                      : undefined}
                  />
                  <div className="msr-field-group">
                    <label className="msr-label"><IcPayments /> Mode de paiement <span className="msr-required">*</span></label>
                    <select className="msr-select" value={paymentType} onChange={e => setPaymentType(e.target.value)}>
                      {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>

                  {/* Échéancier de paiement */}
                  <div className="pay-plan-toggle-row">
                    <button type="button" className={`pay-plan-toggle${enablePaymentPlan ? ' active' : ''}`}
                      onClick={() => setEnablePaymentPlan(v => !v)}>
                      <IcPayments />
                      Personnaliser l'échéancier
                      <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                        {enablePaymentPlan
                          ? 'Activé'
                          : projectFinancingPlan
                            ? `Plan projet : ${paymentPlan.deposit_pct}% / ${Math.round(100 - parseFloat(paymentPlan.deposit_pct))}%`
                            : `Plan par défaut : ${paymentPlan.deposit_pct}% acompte / ${Math.round(100 - parseFloat(paymentPlan.deposit_pct))}% solde`}
                      </span>
                    </button>
                  </div>

                  {/* Acompte de l'option — déduit ou remboursé (option_engage) */}
                  {mode === 'option_engage' && optionDeposit > 0 && (
                    <DepositDecisionFields
                      label={`Acompte de l'option : ${formatPrice(optionDeposit)}`}
                      amount={optionDeposit}
                      refundLabel="Rembourser l'acompte"
                      refundDesc="Acompte rendu au client"
                      deductLabel="Déduire l'acompte"
                      deductDesc="Acompte conservé — déduit du prix"
                      choice={validationChoice}
                      onChoiceChange={setValidationChoice}
                      releaseData={releaseData}
                      onReleaseChange={setReleaseData}
                      icons={decisionIcons}
                    />
                  )}

                  {/* Notes */}
                  <div className="msr-field-group">
                    <label className="msr-label">Notes <span className="msr-optional">(optionnel)</span></label>
                    <textarea className="msr-textarea" placeholder="Ajouter une note..."
                      value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                  </div>
                </>
              );
            })()}

            {/* ── cancel_option form ── */}
            {mode === 'cancel_option' && (
              <>
                {lot.client_name && (
                  <div className="msr-field-group">
                    <label className="msr-label"><IcUser /> Client</label>
                    <div className="msr-client-locked">
                      <div className="msr-client-locked-monogram">{lot.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                      <div><div className="msr-client-locked-name">{lot.client_name}</div></div>
                    </div>
                  </div>
                )}
                <div className="msr-field-group">
                  <label className="msr-label">Motif d'annulation <span className="msr-optional">(optionnel)</span></label>
                  <textarea className="msr-textarea" placeholder="Raison de l'annulation..."
                    value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
              </>
            )}

            {/* ── extend_option form ── */}
            {mode === 'extend_option' && (
              <>
                {lot.client_name && (
                  <div className="msr-field-group">
                    <label className="msr-label"><IcUser /> Client</label>
                    <div className="msr-client-locked">
                      <div className="msr-client-locked-monogram">{lot.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                      <div><div className="msr-client-locked-name">{lot.client_name}</div></div>
                    </div>
                  </div>
                )}
                <div className="msr-field-group">
                  <label className="msr-label"><IcCalendar /> Durée de prolongation <span className="msr-required">*</span></label>
                  <div className="msr-stepper">
                    <button type="button" className="msr-stepper-btn"
                      onClick={() => setExtendDays(d => Math.max(1, (parseInt(d) || 7) - 1))}>−</button>
                    <input type="number" className="msr-stepper-input" min="1" max="365"
                      value={extendDays} onChange={e => setExtendDays(e.target.value)} />
                    <span className="msr-stepper-unit">jours</span>
                    <button type="button" className="msr-stepper-btn"
                      onClick={() => setExtendDays(d => Math.min(365, (parseInt(d) || 7) + 1))}>+</button>
                  </div>
                  {lot.expiration_date && (() => {
                    const newExp = new Date(lot.expiration_date);
                    newExp.setDate(newExp.getDate() + (parseInt(extendDays) || 7));
                    return (
                      <div className="msr-expiry-hint"><IcCalendar /> Nouvelle expiration : <strong>{newExp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
                    );
                  })()}
                </div>
                <div className="msr-info-pill">
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    La prolongation sera enregistrée dans l'historique de la réservation.
                  </span>
                </div>
              </>
            )}

            {/* ── to_reservation form ── */}
            {mode === 'to_reservation' && (
              <>
                <div className="msr-field-group">
                  <label className="msr-label"><IcMoney /> Montant de garantie <span className="msr-required">*</span></label>
                  <div className="msr-price-input-wrap">
                    <input type="number" className="msr-price-input" placeholder="Montant reçu"
                      min="0" step="1000" value={guaranteeAmount} onChange={e => setGuaranteeAmount(e.target.value)} />
                    <span className="msr-price-input-currency">MAD</span>
                  </div>
                </div>
                <div className="msr-field-group">
                  <label className="msr-label"><IcCalendar /> Date limite de finalisation <span className="msr-required">*</span></label>
                  <input type="date" className="msr-input" value={finalizationDate} onChange={e => setFinalizationDate(e.target.value)} />
                </div>
                <div className="msr-field-group">
                  <label className="msr-label"><IcPayments /> Mode de paiement garantie <span className="msr-required">*</span></label>
                  <select className="msr-select" value={paymentType} onChange={e => setPaymentType(e.target.value)}>
                    {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="msr-field-group">
                  <label className="msr-label">Notes <span className="msr-optional">(optionnel)</span></label>
                  <textarea className="msr-textarea" placeholder="Ajouter une note..."
                    value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
              </>
            )}

            {/* ── finaliser_refund form ── */}
            {mode === 'finaliser_refund' && (
              <>
                {lot.client_name && (
                  <div className="msr-field-group">
                    <label className="msr-label"><IcUser /> Client</label>
                    <div className="msr-client-locked">
                      <div className="msr-client-locked-monogram">{lot.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                      <div><div className="msr-client-locked-name">{lot.client_name}</div></div>
                    </div>
                  </div>
                )}
                {activeGuarantee > 0 && (
                  <div className="msr-field-group">
                    <label className="msr-label"><IcMoney /> Garantie versée</label>
                    <div className="msr-info-pill">
                      <span className="msr-info-pill-value">{formatPrice(activeGuarantee)}</span>
                    </div>
                  </div>
                )}
                <div className="msr-field-group">
                  <label className="msr-label"><IcMoney /> Montant remboursé <span className="msr-required">*</span></label>
                  <div className="msr-deposit-row">
                    <input type="number" className="msr-input" min="0" step="1000"
                      placeholder={activeGuarantee > 0 ? activeGuarantee.toString() : '0'}
                      value={releaseData.deposit_refund_amount}
                      onChange={e => setReleaseData(d => ({ ...d, deposit_refund_amount: e.target.value }))} />
                    <span className="msr-currency">MAD</span>
                  </div>
                </div>
                <div className="msr-field-group">
                  <label className="msr-label"><IcCalendar /> Date de remboursement <span className="msr-required">*</span></label>
                  <input type="date" className="msr-input"
                    value={releaseData.deposit_refund_date}
                    onChange={e => setReleaseData(d => ({ ...d, deposit_refund_date: e.target.value }))} />
                </div>
                <div className="msr-field-group">
                  <label className="msr-label">Motif d'annulation</label>
                  <textarea className="msr-textarea" rows={3} placeholder="Raison de l'annulation (optionnel)…"
                    value={releaseData.release_reason}
                    onChange={e => setReleaseData(d => ({ ...d, release_reason: e.target.value }))} />
                </div>
              </>
            )}

            {/* ── finaliser_engage — écran de décision (rembourser ou déduire) ── */}
            {mode === 'finaliser_engage' && (() => {
              return (
                <>
                  {lot.client_name && (
                    <div className="msr-field-group">
                      <label className="msr-label"><IcUser /> Client</label>
                      <div className="msr-client-locked">
                        <div className="msr-client-locked-monogram">{lot.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                        <div><div className="msr-client-locked-name">{lot.client_name}</div></div>
                      </div>
                    </div>
                  )}
                  {activeGuarantee > 0 && (
                    <div className="msr-field-group">
                      <label className="msr-label"><IcMoney /> Garantie versée</label>
                      <div className="msr-info-pill">
                        <span className="msr-info-pill-value">{formatPrice(activeGuarantee)}</span>
                        {activePaymentType && (
                          <span className="msr-info-pill-sub">{PAYMENT_TYPES.find(p => p.value === activePaymentType)?.label || activePaymentType}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Montants : la garantie conservée est le premier acompte reçu */}
                  <EngagementAmountsFields
                    cataloguePrice={lot.price ?? null}
                    value={amounts}
                    onChange={setAmounts}
                    salePriceHint={salePriceHint}
                    firstPayment={finaliserFirstPayment}
                    firstPaymentHint={validationChoice === 'deduct'
                      ? 'Garantie conservée'
                      : validationChoice === 'refund' ? 'Garantie rendue : aucun acompte reçu' : 'Selon la décision sur la garantie'}
                  />

                  {/* Échéancier de paiement */}
                  <div className="pay-plan-toggle-row">
                    <button type="button" className={`pay-plan-toggle${enablePaymentPlan ? ' active' : ''}`}
                      onClick={() => setEnablePaymentPlan(v => !v)}>
                      <IcPayments />
                      Personnaliser l'échéancier
                      <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                        {enablePaymentPlan
                          ? 'Activé'
                          : projectFinancingPlan
                            ? `Plan projet : ${paymentPlan.deposit_pct}% / ${Math.round(100 - parseFloat(paymentPlan.deposit_pct))}%`
                            : `Plan par défaut : ${paymentPlan.deposit_pct}% acompte / ${Math.round(100 - parseFloat(paymentPlan.deposit_pct))}% solde`}
                      </span>
                    </button>
                  </div>

                  <DepositDecisionFields
                    label="Décision garantie"
                    amount={activeGuarantee}
                    refundLabel="Rembourser la garantie"
                    refundDesc="Garantie rendue — Passe en Résa. engagée"
                    deductLabel="Déduire la garantie"
                    deductDesc="Garantie conservée — Passe en Résa. engagée"
                    choice={validationChoice}
                    onChoiceChange={setValidationChoice}
                    releaseData={releaseData}
                    onReleaseChange={setReleaseData}
                    icons={decisionIcons}
                  />

                  {validationChoice === 'deduct' && (
                    <div className="msr-info-pill" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        La garantie de <strong>{formatPrice(activeGuarantee)}</strong> est comptée comme premier acompte reçu.
                        {engageAgreed > 0 && (
                          <> L'échéancier portera sur le reste : <strong>{formatPrice(Math.max(0, engageAgreed - activeGuarantee))}</strong>.</>
                        )}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}

            {/* ── to_soldee form ── */}
            {mode === 'to_soldee' && (
              <>
                <div className="msr-field-group">
                  <span className="msr-label"><IcMoney /> Prix total convenu</span>
                  <div className="msr-info-pill" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span className="msr-info-pill-value">
                      {formatPrice(financeSummary?.agreed_total_price ?? reservation?.agreed_total_price ?? lot.price)}
                    </span>
                    <span className="msr-info-pill-sub">La vente est enregistrée au prix total convenu.</span>
                  </div>
                </div>
                <div className="msr-field-group">
                  <label className="msr-label">Notes <span className="msr-optional">(optionnel)</span></label>
                  <textarea className="msr-textarea" placeholder="Ajouter une note..."
                    value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
              </>
            )}

            {/* ── to_notaire / update_notaire form ── */}
            {(mode === 'to_notaire' || mode === 'update_notaire') && (
              <>
                <div className="msr-field-group">
                  <label className="msr-label"><IcUser /> Notaire <span className="msr-required">*</span></label>
                  <div className="msr-client-row">
                    <select className="msr-select"
                      value={selectedNotaire?.id || ''}
                      onChange={e => {
                        const n = notaires.find(n => n.id === parseInt(e.target.value));
                        setSelectedNotaire(n || null);
                      }}>
                      <option value="">Sélectionner un notaire</option>
                      {notaires.map(n => (
                        <option key={n.id} value={n.id}>
                          {n.prenom} {n.nom}{n.telephone ? ` · ${n.telephone}` : ''}{n.ville ? ` — ${n.ville}` : ''}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="msr-btn-add-client"
                      onClick={() => setShowAddNotaire(!showAddNotaire)}>
                      {showAddNotaire ? <IcClose /> : <IcPlus />}
                      {showAddNotaire ? 'Annuler' : 'Nouveau'}
                    </button>
                  </div>
                  {showAddNotaire && (
                    <AddNotairePanel
                      newNotaire={newNotaire}
                      onChange={setNewNotaire}
                      onSave={handleCreateNotaire}
                      onCancel={() => { setShowAddNotaire(false); setNewNotaire({ nom: '', prenom: '', telephone: '', email: '', ville: '', adresse: '' }); }}
                      saving={savingNotaire} />
                  )}
                </div>
                <div className="msr-field-group">
                  <label className="msr-label"><IcCalendar /> Date de l'acte <span className="msr-required">*</span></label>
                  <input type="date" className="msr-input" value={notaryDate} onChange={e => setNotaryDate(e.target.value)} />
                </div>
                {mode === 'to_notaire' && (
                  <div className="msr-field-group">
                    <label className="msr-label">Notes <span className="msr-optional">(optionnel)</span></label>
                    <textarea className="msr-textarea" rows={3} placeholder="Notes sur le passage chez le notaire..."
                      value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                )}
              </>
            )}

            {/* ── to_proprietaire confirmation ── */}
            {mode === 'to_proprietaire' && (
              <div className="msr-field-group">
                <div className="msr-info-pill" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Confirmer la réception des documents notariaux. Le lot passera en <strong>Chez le propriétaire</strong> (état terminal).
                  </span>
                  {lot.client_name && <span style={{ fontWeight: 600 }}>{lot.client_name}</span>}
                  {lot.notary_name && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Notaire : {lot.notary_name}</span>}
                  {lot.notary_date && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Acte du : {formatDate(lot.notary_date)}</span>}
                  {notaryDocuments.length > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
                      <IcFile style={{ color: 'var(--color-primary)' }} />
                      <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        {notaryDocuments.length} document{notaryDocuments.length > 1 ? 's' : ''} joint{notaryDocuments.length > 1 ? 's' : ''}
                      </span>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', color: 'var(--color-warning)' }}>
                      <IcAlertTriangle /> Aucun document joint — vous pouvez quand même confirmer
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── block form ── */}
            {mode === 'block' && (
              <div className="msr-field-group">
                <label className="msr-label">Motif de blocage <span className="msr-optional">(optionnel)</span></label>
                <textarea className="msr-textarea" rows={3} placeholder="Raison du blocage..."
                  value={blockReason} onChange={e => setBlockReason(e.target.value)} />
              </div>
            )}

            {/* ── unblock confirmation ── */}
            {mode === 'unblock' && (
              <div className="msr-field-group">
                <div className="msr-info-pill">
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Le lot sera remis en statut <strong>Disponible</strong>.
                  </span>
                </div>
              </div>
            )}

          </div>

          {/* Sticky action footer */}
          <div className="msr-actions-footer">
            <button type="button" className="msr-btn-cancel" onClick={() => handleSetMode(null)}>
              Annuler
            </button>
            {mode === 'complete_lot' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleCompleteLot} disabled={loading}>
                <IcCheck />{loading ? 'Activation...' : 'Appliquer et activer'}
              </button>
            )}
            {mode === 'start_option' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleStartOption} disabled={loading || !selectedClient}>
                <IcCheck />{loading ? 'En cours...' : 'Confirmer l\'option'}
              </button>
            )}
            {mode === 'direct_reservation' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleDirectReservation} disabled={loading || !selectedClient}>
                <IcCheck />{loading ? 'En cours...' : 'Créer la réservation'}
              </button>
            )}
            {mode === 'direct_engage' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--sell"
                onClick={handleDirectEngage} disabled={loading || !selectedClient}>
                <IcCheck />{loading ? 'En cours...' : 'Engager la réservation'}
              </button>
            )}
            {mode === 'option_engage' && (optionDeposit > 0 && !validationChoice ? (
              <button type="button" className="msr-btn-confirm" disabled>
                Choisir une décision
              </button>
            ) : (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--sell"
                onClick={handleOptionEngage} disabled={loading}>
                <IcCheck />{loading ? 'En cours...' : 'Engager la réservation'}
              </button>
            ))}
            {mode === 'cancel_option' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--release"
                onClick={handleCancelOption} disabled={loading}>
                <IcUnlock />{loading ? 'En cours...' : 'Annuler l\'option'}
              </button>
            )}
            {mode === 'extend_option' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleExtendOption} disabled={loading}>
                <IcCalendar />{loading ? 'En cours...' : 'Prolonger l\'option'}
              </button>
            )}
            {mode === 'to_reservation' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleToReservation} disabled={loading}>
                <IcCheck />{loading ? 'En cours...' : 'Confirmer la réservation'}
              </button>
            )}
            {mode === 'finaliser_refund' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--release"
                onClick={handleFinaliserRefund} disabled={loading}>
                <IcUnlock />{loading ? 'En cours...' : 'Confirmer le remboursement'}
              </button>
            )}
            {mode === 'finaliser_engage' && validationChoice === 'refund' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--sell"
                onClick={handleFinaliserEngageWithRefund} disabled={loading}>
                <IcCheck />{loading ? 'En cours...' : 'Rendre la garantie et engager'}
              </button>
            )}
            {mode === 'finaliser_engage' && validationChoice === 'deduct' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--sell"
                onClick={handleFinaliserEngage} disabled={loading}>
                <IcCheck />{loading ? 'En cours...' : "Confirmer l'engagement"}
              </button>
            )}
            {mode === 'finaliser_engage' && !validationChoice && (
              <button type="button" className="msr-btn-confirm" disabled>
                Choisir une décision
              </button>
            )}
            {mode === 'to_soldee' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--sell"
                onClick={handleToSoldee} disabled={loading}>
                <IcCheck />{loading ? 'En cours...' : 'Confirmer la vente'}
              </button>
            )}
            {mode === 'to_notaire' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleToNotaire} disabled={loading}>
                <IcCalendar />{loading ? 'En cours...' : 'Confirmer'}
              </button>
            )}
            {mode === 'update_notaire' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleUpdateNotaire} disabled={loading}>
                <IcCheck />{loading ? 'En cours...' : 'Mettre à jour'}
              </button>
            )}
            {mode === 'to_proprietaire' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--sell"
                onClick={handleToProprietaire} disabled={loading}>
                <IcHome />{loading ? 'En cours...' : 'Confirmer l\'acte'}
              </button>
            )}
            {mode === 'block' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--release"
                onClick={handleBlock} disabled={loading}>
                <IcLock />{loading ? 'En cours...' : 'Bloquer le lot'}
              </button>
            )}
            {mode === 'unblock' && (
              <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve"
                onClick={handleUnblock} disabled={loading}>
                <IcUnlock />{loading ? 'En cours...' : 'Débloquer'}
              </button>
            )}
          </div>
          </>)}
        </div>

        {/* ── THIRD PANEL: Payment plan (start_option / direct_engage / finaliser_engage) ── */}
        {showThirdPanel && (
          <div className="modal-pay-panel">
            <div className="mpp-header">
              <div className="mpp-header-left">
                <span className="mpp-title">Plan de paiement</span>
                <span className="mpp-subtitle">{previewRowCount} versement{previewRowCount > 1 ? 's' : ''}</span>
              </div>
              <span className="mpp-total">{formatPrice(thirdPanelPrice)}</span>
            </div>
            <div className="mpp-body">
              <PaymentPlanConfigurator lotPrice={thirdPanelPrice} plan={paymentPlan} onChange={setPaymentPlan} panel engage={engagePreview} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
