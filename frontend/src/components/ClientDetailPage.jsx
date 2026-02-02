import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/config';
import { formatPrice, formatDate } from '../utils/formatters';
import { CLIENT_TYPES } from '../utils/constants';

const CLIENT_TYPE_LABELS = {
  proprietaire: 'Propriétaire',
  revendeur: 'Revendeur',
  investisseur: 'Investisseur',
  autre: 'Autre',
};

const RESERVATION_STATUS_LABELS = {
  active: 'Active',
  converted: 'Convertie',
  released: 'Libérée',
  expired: 'Expirée',
};

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadClientDetails();
  }, [clientId]);

  const loadClientDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/details`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Client non trouvé');
      }
      const data = await response.json();
      setClient(data);
      setEditForm({
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        cin: data.cin || '',
        client_type: data.client_type || 'autre',
        notes: data.notes || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      await loadClientDetails();
      setIsEditing(false);
    } catch (err) {
      alert('Erreur lors de la mise à jour du client');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
        <h2>Erreur</h2>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/clients')}>
          Retour aux clients
        </button>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="client-detail-page">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/clients')}
          style={{ padding: 'var(--spacing-sm)' }}
        >
          ← Retour
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{client.name}</h1>
          <p className="page-subtitle">
            {CLIENT_TYPE_LABELS[client.client_type] || 'Client'} • Créé le {formatDate(client.created_at)}
          </p>
        </div>
        {!isEditing && (
          <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
            Modifier
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="kpi-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: 'var(--color-success)' }}>
            {formatPrice(client.stats?.total_purchases || 0)}
          </div>
          <div className="kpi-label">CA Total</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{client.stats?.total_lots || 0}</div>
          <div className="kpi-label">Lots achetés</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>
            {formatPrice(client.stats?.total_deposit || 0)}
          </div>
          <div className="kpi-label">Acomptes versés</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>
            {client.stats?.active_reservations || 0}
          </div>
          <div className="kpi-label">Réservations actives</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <button
          className={`tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Informations
        </button>
        <button
          className={`tab ${activeTab === 'purchases' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          Achats ({client.sales_history?.length || 0})
        </button>
        <button
          className={`tab ${activeTab === 'reservations' ? 'active' : ''}`}
          onClick={() => setActiveTab('reservations')}
        >
          Réservations ({client.reservations_history?.length || 0})
        </button>
      </div>

      {/* Tab Content */}
      <div className="section-card">
        {activeTab === 'info' && (
          <div className="client-info-section">
            {isEditing ? (
              <div className="edit-form">
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-md)' }}>
                  <div className="form-group">
                    <label className="form-label">Nom complet *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Téléphone</label>
                    <input
                      type="tel"
                      className="form-input"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CIN</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editForm.cin}
                      onChange={(e) => setEditForm({ ...editForm, cin: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type de client</label>
                    <select
                      className="form-input"
                      value={editForm.client_type}
                      onChange={(e) => setEditForm({ ...editForm, client_type: e.target.value })}
                    >
                      {CLIENT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-input form-textarea"
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-lg)' }}>
                  <button className="btn btn-ghost" onClick={() => setIsEditing(false)}>
                    Annuler
                  </button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="info-display">
                <div className="info-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 'var(--spacing-md)'
                }}>
                  <div className="info-card" style={{
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.02) 100%)',
                    border: '1px solid rgba(59, 130, 246, 0.15)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-lg)',
                    transition: 'all 0.3s ease',
                    cursor: 'default',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.15)';
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        flexShrink: 0
                      }}>
                        📱
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="info-label" style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          marginBottom: '6px',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.5px'
                        }}>
                          Téléphone
                        </div>
                        <div className="info-value" style={{
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-all'
                        }}>
                          {client.phone || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="info-card" style={{
                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(168, 85, 247, 0.02) 100%)',
                    border: '1px solid rgba(168, 85, 247, 0.15)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-lg)',
                    transition: 'all 0.3s ease',
                    cursor: 'default',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(168, 85, 247, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.15)';
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        flexShrink: 0
                      }}>
                        📧
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="info-label" style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          marginBottom: '6px',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.5px'
                        }}>
                          Email
                        </div>
                        <div className="info-value" style={{
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-all'
                        }}>
                          {client.email || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="info-card" style={{
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.02) 100%)',
                    border: '1px solid rgba(34, 197, 94, 0.15)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-lg)',
                    transition: 'all 0.3s ease',
                    cursor: 'default',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(34, 197, 94, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.15)';
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        flexShrink: 0
                      }}>
                        🆔
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="info-label" style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          marginBottom: '6px',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.5px'
                        }}>
                          CIN
                        </div>
                        <div className="info-value" style={{
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-all'
                        }}>
                          {client.cin || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="info-card" style={{
                    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.08) 0%, rgba(249, 115, 22, 0.02) 100%)',
                    border: '1px solid rgba(249, 115, 22, 0.15)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-lg)',
                    transition: 'all 0.3s ease',
                    cursor: 'default',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(249, 115, 22, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.15)';
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        flexShrink: 0
                      }}>
                        👤
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="info-label" style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          marginBottom: '6px',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.5px'
                        }}>
                          Type de client
                        </div>
                        <div className="info-value" style={{
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-all'
                        }}>
                          {CLIENT_TYPE_LABELS[client.client_type] || 'Autre'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {client.created_by && (
                    <div className="info-card" style={{
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%)',
                      border: '1px solid rgba(99, 102, 241, 0.15)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--spacing-lg)',
                      transition: 'all 0.3s ease',
                      cursor: 'default',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.15)';
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: 'var(--radius-md)',
                          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem',
                          flexShrink: 0
                        }}>
                          👨‍💼
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="info-label" style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.75rem',
                            marginBottom: '6px',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            letterSpacing: '0.5px'
                          }}>
                            Ajouté par
                          </div>
                          <div className="info-value" style={{
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            wordBreak: 'break-all'
                          }}>
                            {client.created_by.name}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="info-card" style={{
                    background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(236, 72, 153, 0.02) 100%)',
                    border: '1px solid rgba(236, 72, 153, 0.15)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-lg)',
                    transition: 'all 0.3s ease',
                    cursor: 'default',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(236, 72, 153, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.15)';
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        flexShrink: 0
                      }}>
                        📅
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="info-label" style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          marginBottom: '6px',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.5px'
                        }}>
                          Date de création
                        </div>
                        <div className="info-value" style={{
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-all'
                        }}>
                          {formatDate(client.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {client.notes && (
                  <div className="info-card" style={{
                    marginTop: 'var(--spacing-md)',
                    background: 'linear-gradient(135deg, rgba(156, 163, 175, 0.08) 0%, rgba(156, 163, 175, 0.02) 100%)',
                    border: '1px solid rgba(156, 163, 175, 0.15)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-lg)',
                    transition: 'all 0.3s ease',
                  }}>
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        flexShrink: 0
                      }}>
                        📝
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="info-label" style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          marginBottom: '8px',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.5px'
                        }}>
                          Notes
                        </div>
                        <div className="info-value" style={{
                          fontSize: '1rem',
                          whiteSpace: 'pre-wrap',
                          backgroundColor: 'var(--bg-secondary)',
                          padding: 'var(--spacing-md)',
                          borderRadius: 'var(--radius-md)',
                          lineHeight: 1.6,
                          color: 'var(--text-secondary)'
                        }}>
                          {client.notes}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'purchases' && (
          <div className="purchases-section">
            {client.sales_history?.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🛒</div>
                <div style={{ color: 'var(--text-secondary)' }}>Aucun achat enregistré</div>
              </div>
            ) : (
              <div className="purchases-list">
                {client.sales_history?.map((sale) => (
                  <div
                    key={sale.id}
                    className="purchase-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: 'var(--spacing-md)',
                      borderBottom: '1px solid var(--bg-tertiary)',
                      gap: 'var(--spacing-md)',
                    }}
                  >
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-success)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                      }}
                    >
                      {sale.lot_numero}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        Lot {sale.lot_numero} - {sale.project_name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {sale.lot_surface ? `${sale.lot_surface} m²` : ''}
                        {sale.lot_zone ? ` • Zone ${sale.lot_zone}` : ''}
                        {sale.sold_by_name ? ` • Vendu par ${sale.sold_by_name}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                        {formatPrice(sale.price)}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {formatDate(sale.sale_date)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reservations' && (
          <div className="reservations-section">
            {client.reservations_history?.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>📋</div>
                <div style={{ color: 'var(--text-secondary)' }}>Aucune réservation enregistrée</div>
              </div>
            ) : (
              <div className="reservations-list">
                {client.reservations_history?.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="reservation-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: 'var(--spacing-md)',
                      borderBottom: '1px solid var(--bg-tertiary)',
                      gap: 'var(--spacing-md)',
                    }}
                  >
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor:
                          reservation.status === 'active'
                            ? 'var(--color-warning)'
                            : reservation.status === 'converted'
                            ? 'var(--color-success)'
                            : 'var(--bg-tertiary)',
                        color: reservation.status === 'active' || reservation.status === 'converted' ? 'white' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                      }}
                    >
                      {reservation.lot_numero}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        Lot {reservation.lot_numero} - {reservation.project_name}
                        <span
                          style={{
                            marginLeft: 'var(--spacing-sm)',
                            fontSize: '0.75rem',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor:
                              reservation.status === 'active'
                                ? 'rgba(245, 158, 11, 0.2)'
                                : reservation.status === 'converted'
                                ? 'rgba(16, 185, 129, 0.2)'
                                : 'var(--bg-tertiary)',
                            color:
                              reservation.status === 'active'
                                ? 'var(--color-warning)'
                                : reservation.status === 'converted'
                                ? 'var(--color-success)'
                                : 'var(--text-secondary)',
                          }}
                        >
                          {RESERVATION_STATUS_LABELS[reservation.status] || reservation.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {reservation.lot_surface ? `${reservation.lot_surface} m²` : ''}
                        {reservation.lot_zone ? ` • Zone ${reservation.lot_zone}` : ''}
                        {reservation.reserved_by_name ? ` • Par ${reservation.reserved_by_name}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {reservation.deposit > 0 && (
                        <div style={{ fontWeight: 600, color: 'var(--color-warning)' }}>
                          Acompte: {formatPrice(reservation.deposit)}
                        </div>
                      )}
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {formatDate(reservation.reservation_date)}
                      </div>
                      {reservation.status === 'active' && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Expire: {formatDate(reservation.expiration_date)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
