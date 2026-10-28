import { useEffect, useState } from 'react';
import { listNotifications } from '../../services/notificationsService';
import { NOTIFICATION_CHANNEL_LABELS } from '../../utils/clientProfile';
import {
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_RECIPIENT_LABELS,
  NOTIFICATION_STATUS_LABELS,
} from './constants';

const STATUS_BADGE = { sent: 'badge-green', failed: 'badge-red', not_configured: 'badge-gray' };

const formatSentAt = (value) =>
  new Date(value).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/** Historique des notifications d'un client et/ou d'un lot. */
export default function NotificationHistory({ clientId, lotId }) {
  const [rows, setRows] = useState(null); // null = chargement
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listNotifications({ clientId, lotId })
      .then((data) => { if (!cancelled) { setRows(Array.isArray(data) ? data : []); setFailed(false); } })
      .catch(() => { if (!cancelled) { setRows([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [clientId, lotId]);

  if (rows === null) return <div className="empty-state">Chargement…</div>;
  if (failed) return <div className="empty-state">Impossible de charger les notifications</div>;
  if (rows.length === 0) return <div className="empty-state">Aucune notification</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Canal</th>
            <th>Destinataire</th>
            <th>Statut</th>
            <th>Auteur</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => (
            <tr key={n.id}>
              <td>{formatSentAt(n.sent_at)}</td>
              <td>{NOTIFICATION_KIND_LABELS[n.kind] ?? n.kind}</td>
              <td>{NOTIFICATION_CHANNEL_LABELS[n.channel] ?? n.channel}</td>
              <td>{NOTIFICATION_RECIPIENT_LABELS[n.recipient] ?? n.recipient}</td>
              <td>
                <span className={`badge ${STATUS_BADGE[n.status] ?? 'badge-gray'}`}>
                  {NOTIFICATION_STATUS_LABELS[n.status] ?? n.status}
                </span>
                {n.status === 'failed' && n.error && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{n.error}</div>
                )}
              </td>
              <td>{n.sent_by_name || 'Automatique'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
