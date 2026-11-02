const DAY = 86400000;
const businessClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
// Calendar dates include the entire business day. Resolve midnight using IANA offsets,
// rather than assuming Morocco is always UTC+1 (the offset changes during Ramadan).
const endOfBusinessDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day + 1);
  let boundary = target;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(businessClock.formatToParts(boundary).map((p) => [p.type, p.value]));
    const localAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    boundary += target - localAsUtc;
  }
  return boundary - 1;
};
export function deadline(date, now = Date.now(), server) {
  if (!date || !Number.isFinite(Date.parse(date))) return { level: 'undated', rank: 4, label: 'Sans échéance', time: Infinity };
  const time = /^\d{4}-\d{2}-\d{2}$/.test(date) ? endOfBusinessDate(date) : Date.parse(date);
  let remaining = Number.isFinite(server?.daysRemaining) ? server.daysRemaining : (time - now) / DAY;
  // The option feed owns expiration state; browser clock drift must never reverse it.
  if (server?.isExpired === true) remaining = -Math.max(Number.EPSILON, Math.abs(remaining));
  if (server?.isExpired === false) remaining = Math.max(0, remaining);
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
