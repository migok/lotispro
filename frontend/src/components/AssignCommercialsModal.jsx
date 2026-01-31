import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiDelete } from '../utils/api';

export default function AssignCommercialsModal({ project, onClose, onAssigned }) {
  const [commercials, setCommercials] = useState([]);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [project.id]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      // Load all commercials and assigned users
      const [commercialsData, assignedData] = await Promise.all([
        apiGet('/api/users?role=commercial'),
        apiGet(`/api/projects/${project.id}/users`),
      ]);

      setCommercials(commercialsData);
      setAssignedUsers(assignedData);
    } catch (err) {
      setError('Erreur lors du chargement des données');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (userId) => {
    setActionLoading(true);
    setError('');

    try {
      await apiPost(`/api/projects/${project.id}/assign`, {
        user_id: userId,
        project_id: project.id,
      });

      await loadData();
      onAssigned();
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'assignation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnassign = async (userId) => {
    if (!confirm('Retirer ce commercial du projet ?')) {
      return;
    }

    setActionLoading(true);
    setError('');

    try {
      await apiDelete(`/api/projects/${project.id}/users/${userId}`);
      await loadData();
      onAssigned();
    } catch (err) {
      setError(err.message || 'Erreur lors du retrait');
    } finally {
      setActionLoading(false);
    }
  };

  const assignedUserIds = new Set(assignedUsers.map((u) => u.id));
  const availableCommercials = commercials.filter((c) => !assignedUserIds.has(c.id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Assigner des commerciaux</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="info-box" style={{ marginBottom: 'var(--spacing-md)' }}>
            <strong>Projet:</strong> {project.name}
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <>
              {/* Assigned Users */}
              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                  Commerciaux assignés ({assignedUsers.length})
                </h3>

                {assignedUsers.length === 0 ? (
                  <div className="empty-state" style={{ padding: 'var(--spacing-md)' }}>
                    <div style={{ fontSize: '2rem' }}>👥</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Aucun commercial assigné
                    </div>
                  </div>
                ) : (
                  <div className="user-list">
                    {assignedUsers.map((user) => (
                      <div key={user.id} className="user-card">
                        <div className="user-avatar">
                          {user.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                        </div>
                        <div className="user-info">
                          <div className="user-name">{user.name}</div>
                          <div className="user-email">{user.email}</div>
                        </div>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleUnassign(user.id)}
                          disabled={actionLoading}
                          title="Retirer du projet"
                        >
                          ✕ Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Available Commercials */}
              <div>
                <h3 style={{ fontSize: '0.95rem', marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                  Commerciaux disponibles ({availableCommercials.length})
                </h3>

                {availableCommercials.length === 0 ? (
                  <div className="empty-state" style={{ padding: 'var(--spacing-md)' }}>
                    <div style={{ fontSize: '2rem' }}>✓</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Tous les commerciaux sont déjà assignés
                    </div>
                  </div>
                ) : (
                  <div className="user-list">
                    {availableCommercials.map((user) => (
                      <div key={user.id} className="user-card">
                        <div className="user-avatar">
                          {user.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                        </div>
                        <div className="user-info">
                          <div className="user-name">{user.name}</div>
                          <div className="user-email">{user.email}</div>
                        </div>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleAssign(user.id)}
                          disabled={actionLoading}
                        >
                          + Assigner
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {commercials.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">👥</div>
                  <div className="empty-state-title">Aucun commercial</div>
                  <div className="empty-state-description">
                    Créez d'abord des utilisateurs avec le rôle "commercial".
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
