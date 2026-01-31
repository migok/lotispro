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
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/dashboard/clients-pipeline`);
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

  const filteredClients = clients.filter((client) =>
    client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.phone?.includes(searchQuery) ||
    client.cin?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      {/* Stats */}
      <div className="kpi-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpi-card">
          <div className="kpi-value">{clients.length}</div>
          <div className="kpi-label">Total clients</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>
            {clients.filter(c => c.pipeline_status === 'active_reservation').length}
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
        <div className="client-list">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="client-card"
              onClick={() => handleClientClick(client.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="client-avatar">
                {client.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
              </div>
              <div className="client-info" style={{ flex: 1 }}>
                <div className="client-name">
                  {client.name}
                  {client.client_type && client.client_type !== 'autre' && (
                    <span
                      className="client-type-badge"
                      style={{
                        marginLeft: 'var(--spacing-sm)',
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {CLIENT_TYPE_LABELS[client.client_type] || client.client_type}
                    </span>
                  )}
                </div>
                <div className="client-details">
                  {client.phone && <span>📞 {client.phone}</span>}
                  {client.email && <span>📧 {client.email}</span>}
                  {client.cin && <span>🪪 {client.cin}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', marginRight: 'var(--spacing-md)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {client.active_reservations > 0 && (
                    <span style={{ color: 'var(--color-warning)' }}>
                      {client.active_reservations} réserv.
                    </span>
                  )}
                  {client.total_sales > 0 && (
                    <span style={{ color: 'var(--color-success)', marginLeft: 'var(--spacing-sm)' }}>
                      {client.total_sales} achat(s)
                    </span>
                  )}
                </div>
                {client.total_deposit > 0 && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Acompte: {formatPrice(client.total_deposit)}
                  </div>
                )}
                {client.total_purchases > 0 && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-success)' }}>
                    Total: {formatPrice(client.total_purchases)}
                  </div>
                )}
              </div>
              <span className={`pipeline-badge ${client.pipeline_status}`}>
                {PIPELINE_LABELS[client.pipeline_status] || client.pipeline_status}
              </span>
              <div className="flex gap-sm" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-sm btn-primary" onClick={() => handleClientClick(client.id)}>
                  Voir
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
