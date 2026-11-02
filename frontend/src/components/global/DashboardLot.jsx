import { useEffect, useState } from 'react';
import { apiGet } from '../../utils/api';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { LoadingSkeleton } from '../ui/skeleton';
import LotDetailModal from '../LotDetailModal';
import ResourceError from './ResourceError';

/** Open the existing lot form with its normal project configuration and reservation data. */
export default function DashboardLot({ lotId, onClose, onRefresh }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      const lot = await apiGet(`/api/lots/${encodeURIComponent(lotId)}`);
      const [project, rows] = await Promise.all([
        apiGet(`/api/projects/${lot.project_id}`),
        apiGet(`/api/dashboard/lots?project_id=${lot.project_id}`),
      ]);
      const detail = rows.find((r) => r.id === lot.id && (lot.current_reservation_id == null || r.reservation_id === lot.current_reservation_id));
      if (!detail) throw new Error('Lot details unavailable');
      if (!cancelled) setResult({ attempt, lot: { ...lot, ...detail, lot_id: lot.numero }, project });
    }).catch(() => { if (!cancelled) setResult({ attempt, error: true }); });
    return () => { cancelled = true; };
  }, [lotId, attempt]);
  const current = result?.attempt === attempt ? result : null;
  const refresh = () => { setAttempt((n) => n + 1); onRefresh(); };
  if (current?.lot) return <LotDetailModal lot={current.lot} enabledOptionalStatuses={current.project.enabled_optional_statuses} onClose={onClose} onRefresh={refresh} />;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogTitle>Fiche du lot</DialogTitle><DialogDescription>Lot {lotId}</DialogDescription>{current?.error ? <ResourceError label="Fiche du lot indisponible" onRetry={() => setAttempt((n) => n + 1)} /> : <LoadingSkeleton label="Chargement de la fiche du lot" rows={4} />}</DialogContent></Dialog>;
}
