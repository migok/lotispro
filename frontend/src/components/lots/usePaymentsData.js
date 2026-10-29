import { useCallback, useEffect, useState } from 'react';
import { getFinancialSummary, listPayments } from '../../services/reservationFinanceService';

const isSummary = (data) => data != null && Array.isArray(data.installments);

/**
 * Montants et encaissements d'une réservation (E4-T5), lus dans `financial-summary` et
 * `payments` ; partagé par `PaymentsPanel` et la grande fenêtre « Échéancier et encaissements ».
 *
 * - `withPayments` (défaut true) : false quand l'hôte n'affiche pas la liste des encaissements ;
 * - `onSummaryChange(summary)` : chaque résumé chargé ; `onSummaryError()` si le résumé ne peut
 *   pas être chargé.
 *
 * Renvoie `{ summary, payments, failed, reload }` : `summary` null tant qu'il n'est pas chargé ;
 * `payments` null si la liste n'a pas pu être chargée (jamais présentée comme vide) ;
 * `reload()` relit les deux (après un encaissement), en gardant l'affichage précédent.
 */
export default function usePaymentsData(reservationId, { withPayments = true, onSummaryChange, onSummaryError } = {}) {
  const [data, setData] = useState(null); // null = chargement
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getFinancialSummary(reservationId),
      withPayments ? listPayments(reservationId).catch(() => null) : Promise.resolve([]),
    ])
      .then(([summary, payments]) => {
        if (cancelled) return;
        if (!isSummary(summary)) throw new Error('summary');
        setData({ summary, payments: Array.isArray(payments) ? payments : null });
        setFailed(false);
      })
      .catch(() => { if (!cancelled) { setData(null); setFailed(true); } });
    return () => { cancelled = true; };
  }, [reservationId, withPayments, version]);

  const summary = data?.summary ?? null;
  useEffect(() => {
    if (summary) onSummaryChange?.(summary);
  }, [summary, onSummaryChange]);
  useEffect(() => {
    if (failed) onSummaryError?.();
  }, [failed, onSummaryError]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { summary, payments: data ? data.payments : null, failed, reload };
}
