import { useState } from 'react';
import { useToast } from '../../contexts/toastHooks';
import { notifyReservation } from '../../services/notificationsService';
import { NOTIFICATION_CHANNEL_LABELS } from '../../utils/clientProfile';
import { AVAILABLE_CHANNELS, NOTIFICATION_KIND_LABELS } from './constants';

const CHANNELS = Object.keys(NOTIFICATION_CHANNEL_LABELS);
const DEFAULT_CHANNELS = ['email'];

/**
 * Panneau « Notifier le client » affiché après une étape de réservation.
 * Les cases sont pré-cochées depuis les préférences du client ; les canaux non
 * disponibles restent cochés mais désactivés et ne sont jamais envoyés.
 */
export default function NotifyClientPanel({ reservationId, kind, client, onClose }) {
  const toast = useToast();
  const [checked, setChecked] = useState(() =>
    client?.notification_channels?.length ? client.notification_channels : DEFAULT_CHANNELS
  );
  const [sending, setSending] = useState(false);

  const toSend = checked.filter((c) => AVAILABLE_CHANNELS.includes(c));

  const toggle = (channel) =>
    setChecked((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));

  const toastFor = (row) => {
    const label = NOTIFICATION_CHANNEL_LABELS[row.channel] ?? row.channel;
    if (row.status === 'sent') toast.success(`${label} envoyé`);
    else if (row.status === 'failed') toast.error(`Échec : ${row.error}`);
    else toast.warning('Canal non configuré');
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const rows = await notifyReservation(reservationId, { channels: toSend, kind });
      rows.forEach(toastFor);
      onClose();
    } catch (error) {
      toast.error(error.message || "Erreur lors de l'envoi");
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Notifier le client"
        style={{ maxWidth: '460px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">Notifier le client</h2>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>
            {NOTIFICATION_KIND_LABELS[kind]}
            {client?.name ? ` — ${client.name}` : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CHANNELS.map((channel) => {
              const available = AVAILABLE_CHANNELS.includes(channel);
              return (
                <label key={channel} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: available ? 1 : 0.6 }}>
                  <input
                    type="checkbox"
                    checked={checked.includes(channel)}
                    disabled={!available || sending}
                    onChange={() => toggle(channel)}
                  />
                  <span>{NOTIFICATION_CHANNEL_LABELS[channel]}</span>
                  {!available && <span style={{ color: 'var(--text-muted)' }}>bientôt disponible</span>}
                </label>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Fermer</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={toSend.length === 0 || sending}
            onClick={handleSend}
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}
