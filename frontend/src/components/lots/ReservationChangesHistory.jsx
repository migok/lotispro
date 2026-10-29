import { useEffect, useState } from 'react';
import { formatDate, formatMad } from '../../utils/formatters';
import { installmentLabel, listReservationChanges } from '../../services/reservationFinanceService';

const GAP_TIMING_LABELS = { debut: 'Au début', fin: 'À la fin', date: 'À une date' };

const orDash = (value) => (value === null || value === undefined || value === '' ? '—' : value);

/** Changed scalar fields, in display order: label + formatter (spec E4-T5 labels). */
const FIELDS = [
  ['agreed_total_price', 'Prix total convenu', formatMad],
  ['sale_price', "Prix figurant sur l'acte", formatMad],
  ['gap_due_timing', "Échéance de l'écart", (v) => GAP_TIMING_LABELS[v] ?? orDash(v)],
  ['gap_due_date', "Date de l'écart", (v) => (v ? formatDate(v) : '—')],
  ['notes', 'Notes', orDash],
];

const formatChangedAt = (value) =>
  new Date(value).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const installmentText = (inst) => (inst ? `${formatMad(inst.amount)}, ${formatDate(inst.due_date)}` : '—');

/** « Libellé : avant → après » lines of one change. */
function changeLines(change, labelById) {
  const before = change.before ?? {};
  const after = change.after ?? {};
  const lines = FIELDS
    .filter(([key]) => key in before || key in after)
    .map(([key, label, format]) => `${label} : ${format(before[key])} → ${format(after[key])}`);

  // installments: matched by id; one only in `after` was created, one only in `before` deleted
  const beforeById = new Map((before.installments ?? []).map((i) => [i.id, i]));
  const afterById = new Map((after.installments ?? []).map((i) => [i.id, i]));
  for (const instId of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const label = labelById.get(instId) ?? 'Échéance';
    lines.push(`${label} : ${installmentText(beforeById.get(instId))} → ${installmentText(afterById.get(instId))}`);
  }
  return lines;
}

/**
 * Historique des modifications d'une réservation engagée (spec E4-T5), le plus récent d'abord :
 * date, auteur, motif et les champs changés « avant → après ».
 * `installments` (facultatif, `financial-summary.installments`) nomme les échéances
 * (« Solde 2 », « Écart à régulariser ») ; une échéance absente de l'échéancier actuel
 * s'affiche « Échéance ».
 */
export default function ReservationChangesHistory({ reservationId, installments = [] }) {
  const [changes, setChanges] = useState(null); // null = chargement
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listReservationChanges(reservationId)
      .then((data) => { if (!cancelled) { setChanges(Array.isArray(data) ? data : []); setFailed(false); } })
      .catch(() => { if (!cancelled) { setChanges([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [reservationId]);

  if (changes === null) return <div className="ldm-documents-empty">Chargement de l'historique…</div>;
  if (failed) return <div className="ldm-documents-empty">Historique indisponible.</div>;
  if (changes.length === 0) return <div className="ldm-documents-empty">Aucune modification enregistrée.</div>;

  const labelById = new Map(installments.map((inst) => [inst.id, installmentLabel(inst)]));

  return (
    <ul className="rch-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {changes.map((change) => (
        <li key={change.id} className="rch-entry"
          style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>{formatChangedAt(change.changed_at)}</span>
            <span>{change.user_name || '—'}</span>
          </div>
          <div style={{ fontWeight: 600, margin: '4px 0' }}>{change.reason}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem' }}>
            {changeLines(change, labelById).map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  );
}
