const DAY = 86400000;
export function deadline(date, now = Date.now()) {
  if (!date || !Number.isFinite(Date.parse(date))) return { level: 'undated', rank: 4, label: 'Sans échéance', time: Infinity };
  const time = Date.parse(date);
  const remaining = (time - now) / DAY;
  if (remaining < 0) return { level: 'overdue', rank: 0, label: `Dépassé de ${Math.max(1, Math.ceil(-remaining))} j`, time };
  if (remaining <= 1) return { level: 'critical', rank: 1, label: 'Sous 1 jour', time };
  if (remaining <= 3) return { level: 'soon', rank: 2, label: 'Sous 3 jours', time };
  return { level: 'later', rank: 3, label: `Dans ${Math.ceil(remaining)} j`, time };
}
/** One expiration per lot; distinct rows for unpaid installments. Options enrich the risk feed. */
export function treatmentRows({ options = [], alerts = [], payments = [], notaires = [] }, now = Date.now()) {
  const expirations = new Map();
  for (const row of [...alerts, ...options]) {
    const key = `expiration:${row.lot_id}`;
    expirations.set(key, { ...expirations.get(key), ...row, id: key, kind: 'expiration', type: row.lot_status === 'reservation_a_finaliser' ? 'Réservation à finaliser' : 'Option', due: row.expiration_date });
  }
  return [...expirations.values(),
    ...payments.map((r) => ({ ...r, id: `payment:${r.installment_id}`, kind: 'payment', type: 'Paiement en retard', due: r.due_date })),
    ...notaires.map((r) => ({ ...r, id: `notaire:${r.lot_id}`, kind: 'notaire', type: 'Passage chez le notaire', due: r.notary_date })),
  ].map((r) => ({ ...r, urgency: deadline(r.due, now) }))
    .sort((a, b) => a.urgency.rank - b.urgency.rank || a.urgency.time - b.urgency.time || a.id.localeCompare(b.id));
}
