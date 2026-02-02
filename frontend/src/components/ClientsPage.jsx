import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API_URL = 'http://localhost:8000';

const CLIENT_TYPES = [
  { value: 'proprietaire', label: 'Propriétaire' },
  { value: 'revendeur', label: 'Revendeur' },
  { value: 'investisseur', label: 'Investisseur' },
  { value: 'autre', label: 'Autre' },
];

const CLIENT_TYPE_LABELS = {
  proprietaire: 'Propriétaire',
  revendeur: 'Revendeur',
  investisseur: 'Investisseur',
  autre: 'Autre',
};

const formatPrice = (price) => {
  if (!price) return '0 MAD';
  return new Intl.NumberFormat('fr-MA', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(price) + ' MAD';
};

const PIPELINE_LABELS = {
  buyer: 'Acheteur',
  active_reservation: 'Reservation active',
  past_reservation: 'Ancienne reservation',
  prospect: 'Prospect',
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientType, setSelectedClientType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    phone: '',
    email: '',
    cin: '',
    client_type: 'autre',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token) {
      loadClients();
    }
  }, [token]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/dashboard/clients-pipeline`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClient.name.trim()) {
      alert('Le nom est requis');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newClient),
      });

      if (!response.ok) throw new Error('Erreur lors de la création');

      setShowModal(false);
      setNewClient({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });
      loadClients();
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Erreur lors de la création du client');
    } finally {
      setSaving(false);
    }
  };

  const handleClientClick = (clientId) => {
    navigate(`/clients/${clientId}`);
  };

  const filteredClients = clients.filter((client) => {
    // Filtre par recherche
    const matchesSearch = !searchQuery || (
      client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.phone?.includes(searchQuery) ||
      client.cin?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Filtre par type de client
    const matchesType = !selectedClientType || client.client_type === selectedClientType;

    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="clients-page">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Clients</h1>
        <p className="page-subtitle">Gérez votre portefeuille clients</p>
      </div>

      {/* Search and Actions */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Rechercher un client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nouveau client
        </button>
      </div>

      {/* Filtres par type de client */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-md)',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <span style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--text-secondary)'
        }}>
          Type de client:
        </span>
        <button
          className={`btn btn-sm ${!selectedClientType ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setSelectedClientType(null)}
          style={{ padding: '0.375rem 0.75rem' }}
        >
          Tous
        </button>
        {CLIENT_TYPES.map((type) => (
          <button
            key={type.value}
            className={`btn btn-sm ${selectedClientType === type.value ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedClientType(type.value)}
            style={{ padding: '0.375rem 0.75rem' }}
          >
            {type.label}
          </button>
        ))}
        {(searchQuery || selectedClientType) && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setSearchQuery('');
              setSelectedClientType(null);
            }}
            style={{
              padding: '0.375rem 0.75rem',
              marginLeft: 'auto',
              color: 'var(--color-danger)'
            }}
          >
            ✕ Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="kpi-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpi-card">
          <div className="kpi-value">{clients.length}</div>
          <div className="kpi-label">Total clients</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>
            {clients.reduce((sum, c) => sum + (c.active_reservations || 0), 0)}
          </div>
          <div className="kpi-label">Réservations actives</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: 'var(--color-success)' }}>
            {clients.filter(c => c.pipeline_status === 'buyer').length}
          </div>
          <div className="kpi-label">Acheteurs</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">
            {formatPrice(clients.reduce((sum, c) => sum + (c.total_purchases || 0), 0))}
          </div>
          <div className="kpi-label">CA Total</div>
        </div>
      </div>

      {/* Clients List */}
      <div className="section-card">
        <div className="client-list-v2">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="client-card-v2"
              onClick={() => handleClientClick(client.id)}
            >
              {/* Left Section - Avatar & Info */}
              <div className="client-main-info">
                <div className="client-avatar-v2">
                  {client.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                </div>
                <div className="client-details-v2">
                  <div className="client-name-row">
                    <span className="client-name-v2">{client.name}</span>
                    {client.client_type && client.client_type !== 'autre' && (
                      <span className="client-type-tag">
                        {CLIENT_TYPE_LABELS[client.client_type] || client.client_type}
                      </span>
                    )}
                  </div>
                  <div className="client-contact-row">
                    {client.phone && (
                      <span className="contact-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        {client.phone}
                      </span>
                    )}
                    {client.email && (
                      <span className="contact-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        {client.email}
                      </span>
                    )}
                    {client.cin && (
                      <span className="contact-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="16" rx="2"/>
                          <line x1="7" y1="8" x2="17" y2="8"/>
                          <line x1="7" y1="12" x2="12" y2="12"/>
                        </svg>
                        {client.cin}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Middle Section - Activity Stats */}
              <div className="client-activity-stats">
                {client.active_reservations > 0 && (
                  <div className="activity-stat reservation">
                    <span className="stat-number">{client.active_reservations}</span>
                    <span className="stat-label">Réserv.</span>
                  </div>
                )}
                {client.total_sales > 0 && (
                  <div className="activity-stat purchase">
                    <span className="stat-number">{client.total_sales}</span>
                    <span className="stat-label">Achat{client.total_sales > 1 ? 's' : ''}</span>
                  </div>
                )}
                {!client.active_reservations && !client.total_sales && (
                  <div className="activity-stat empty">
                    <span className="stat-label">-</span>
                  </div>
                )}
              </div>

              {/* Financial Section */}
              <div className="client-financial-section">
                {(client.total_deposit > 0 || client.total_purchases > 0) ? (
                  <>
                    {client.total_deposit > 0 && (
                      <div className="financial-item deposit">
                        <div className="financial-label">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                          </svg>
                          Acompte versé
                        </div>
                        <div className="financial-value">{formatPrice(client.total_deposit)}</div>
                      </div>
                    )}
                    {client.total_purchases > 0 && (
                      <div className="financial-item total">
                        <div className="financial-label">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="1" x2="12" y2="23"/>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                          </svg>
                          Total achats
                        </div>
                        <div className="financial-value">{formatPrice(client.total_purchases)}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="financial-empty">
                    <span>Aucune transaction</span>
                  </div>
                )}
              </div>

              {/* Right Section - Status & Action */}
              <div className="client-actions-section">
                <span className={`pipeline-badge-v2 ${client.pipeline_status}`}>
                  {PIPELINE_LABELS[client.pipeline_status] || client.pipeline_status}
                </span>
                <button
                  className="btn-view"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClientClick(client.id);
                  }}
                >
                  Voir
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredClients.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-title">Aucun client trouvé</div>
            <div className="empty-state-description">
              {searchQuery ? 'Essayez une autre recherche' : 'Ajoutez votre premier client'}
            </div>
            {!searchQuery && (
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                + Ajouter un client
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create Client Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Nouveau client</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nom complet *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Jean Dupont"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="0612345678"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="jean@example.com"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">CIN</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="AB123456"
                  value={newClient.cin}
                  onChange={(e) => setNewClient({ ...newClient, cin: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Type de client</label>
                <select
                  className="form-input"
                  value={newClient.client_type}
                  onChange={(e) => setNewClient({ ...newClient, client_type: e.target.value })}
                >
                  {CLIENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Informations complémentaires..."
                  value={newClient.notes}
                  onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={handleCreateClient} disabled={saving}>
                {saving ? 'Création...' : 'Créer le client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
