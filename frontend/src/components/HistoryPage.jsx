import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../utils/config';
import { formatDate } from '../utils/formatters';
import { ACTION_ICONS, ACTION_LABELS, ENTITY_LABELS, STATUS_LABELS } from '../utils/constants';

export default function HistoryPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    entity_type: '',
    action: '',
  });

  useEffect(() => {
    loadLogs();
  }, [filter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.entity_type) params.append('entity_type', filter.entity_type);
      if (filter.action) params.append('action', filter.action);
      params.append('limit', '100');

      const response = await fetch(`${API_BASE_URL}/api/audit-logs?${params}`);
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusChange = (log) => {
    const oldStatus = log.old_data?.status;
    const newStatus = log.new_data?.status;

    if (oldStatus && newStatus && oldStatus !== newStatus) {
      return `${STATUS_LABELS[oldStatus] || oldStatus} → ${STATUS_LABELS[newStatus] || newStatus}`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="history-page">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Historique</h1>
        <p className="page-subtitle">Journal de toutes les modifications</p>
      </div>

      {/* Filters */}
      <div className="section-card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="flex gap-md items-center">
          <select
            className="form-input"
            style={{ width: 'auto' }}
            value={filter.entity_type}
            onChange={(e) => setFilter({ ...filter, entity_type: e.target.value })}
          >
            <option value="">Tous les types</option>
            <option value="lot">Lots</option>
            <option value="client">Clients</option>
            <option value="reservation">Réservations</option>
            <option value="sale">Ventes</option>
          </select>

          <select
            className="form-input"
            style={{ width: 'auto' }}
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value })}
          >
            <option value="">Toutes les actions</option>
            <option value="create">Créations</option>
            <option value="update">Modifications</option>
            <option value="status_change">Changements de statut</option>
          </select>

          <button className="btn btn-ghost" onClick={() => setFilter({ entity_type: '', action: '' })}>
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Logs List */}
      <div className="section-card">
        <div className="history-list">
          {logs.map((log) => {
            const statusChange = getStatusChange(log);

            return (
              <div key={log.id} className="history-item">
                <div className={`history-icon ${log.action}`}>
                  {ACTION_ICONS[log.action] || '📝'}
                </div>
                <div className="history-content">
                  <div className="history-header">
                    <span className="history-action">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                    <span className="history-time">{formatDate(log.created_at, true)}</span>
                  </div>
                  <div className="history-entity">
                    {ENTITY_LABELS[log.entity_type] || log.entity_type} #{log.entity_id}
                  </div>

                  {statusChange && (
                    <div className="history-change">
                      <span>🔄</span>
                      {statusChange}
                    </div>
                  )}

                  {log.user_id && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--spacing-xs)' }}>
                      Par: {log.user_id === 'system' ? 'Système (automatique)' : log.user_id}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {logs.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">Aucun historique</div>
            <div className="empty-state-description">
              Les modifications seront enregistrées ici.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
