import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const CLIENT_TYPES = [
  { value: 'proprietaire', label: 'Propriétaire' },
  { value: 'revendeur', label: 'Revendeur' },
  { value: 'investisseur', label: 'Investisseur' },
  { value: 'autre', label: 'Autre' },
];

const formatPrice = (price) => {
  if (!price) return '0 MAD';
  return new Intl.NumberFormat('fr-MA', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(price) + ' MAD';
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const STATUS_LABELS = {
  available: 'Disponible',
  reserved: 'Réservé',
  sold: 'Vendu',
  blocked: 'Bloqué',
};

const STATUS_COLORS = {
  available: 'var(--color-available)',
  reserved: 'var(--color-warning)',
  sold: 'var(--color-danger)',
  blocked: 'var(--color-blocked)',
};

export default function LotDetailModal({ lot, onClose, onRefresh }) {
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState(null); // 'reserve' | 'sell' | null
  const [loading, setLoading] = useState(false);

  // State for adding new client
  const [showAddClient, setShowAddClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    phone: '',
    email: '',
    cin: '',
    client_type: 'autre',
    notes: '',
  });

  useEffect(() => {
    loadClients();
    if (lot?.price) {
      setFinalPrice(lot.price.toString());
    }
  }, [lot]);

  const loadClients = async () => {
    try {
      const data = await apiGet('/api/clients');
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const handleCreateClient = async () => {
    if (!newClient.name.trim()) {
      alert('Le nom est requis');
      return;
    }

    setSavingClient(true);
    try {
      const response = await fetch('http://localhost:8000/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newClient),
      });

      if (!response.ok) throw new Error('Erreur lors de la création');

      const createdClient = await response.json();

      // Refresh clients list and select the new client
      await loadClients();
      setSelectedClient(createdClient);

      // Reset form and close
      setNewClient({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });
      setShowAddClient(false);
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Erreur lors de la création du client');
    } finally {
      setSavingClient(false);
    }
  };

  const resetFormState = () => {
    setShowAddClient(false);
    setNewClient({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });
    setSelectedClient(null);
    setDepositAmount('');
    setNotes('');
  };

  const handleSetMode = (newMode) => {
    resetFormState();
    setMode(newMode);
    if (newMode === 'sell' && lot?.price) {
      setFinalPrice(lot.price.toString());
    }
  };

  const handleReserve = async () => {
    if (!selectedClient) {
      alert('Veuillez sélectionner un client');
      return;
    }

    setLoading(true);
    try {
      await apiPost('/api/reservations', {
        lot_id: lot.id,
        client_id: selectedClient.id,
        deposit: depositAmount ? parseFloat(depositAmount) : 0,
        notes: notes || undefined,
      });

      alert('Lot réservé avec succès!');
      setMode(null);
      onRefresh && onRefresh();
      onClose();
    } catch (error) {
      console.error('Error reserving lot:', error);
      alert(error.message || 'Erreur lors de la réservation');
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!finalPrice) {
      alert('Veuillez entrer le prix final');
      return;
    }

    // Si le lot est réservé, on utilise le client de la réservation
    const clientId = lot.status === 'reserved' ? lot.client_id : selectedClient?.id;

    if (!clientId) {
      alert('Veuillez sélectionner un client');
      return;
    }

    setLoading(true);
    try {
      await apiPost('/api/sales', {
        lot_id: lot.id,
        client_id: clientId,
        price: parseFloat(finalPrice),
        reservation_id: lot.reservation_id || undefined,
        notes: notes || undefined,
      });

      alert('Vente enregistrée avec succès!');
      setMode(null);
      onRefresh && onRefresh();
      onClose();
    } catch (error) {
      console.error('Error selling lot:', error);
      alert(error.message || 'Erreur lors de la vente');
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async () => {
    if (!confirm('Êtes-vous sûr de vouloir libérer cette réservation?')) return;

    setLoading(true);
    try {
      await apiPost(`/api/reservations/${lot.reservation_id}/release`, {});

      alert('Réservation libérée avec succès!');
      onRefresh && onRefresh();
      onClose();
    } catch (error) {
      console.error('Error releasing reservation:', error);
      alert(error.message || 'Erreur lors de la libération');
    } finally {
      setLoading(false);
    }
  };

  if (!lot) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Lot {lot.numero}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Header with status */}
          <div className="lot-detail-header">
            <div>
              <div className="lot-detail-number">{lot.numero}</div>
              <div className="lot-detail-zone">Zone {lot.zone || '-'}</div>
            </div>
            <div className="lot-detail-price">
              <div className="lot-price-main">{formatPrice(lot.price)}</div>
              {lot.surface && lot.price && (
                <div className="lot-price-per-m2">
                  {formatPrice(lot.price / lot.surface)}/m²
                </div>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <span
              className={`status-badge ${lot.status}`}
              style={{ fontSize: '0.875rem', padding: '8px 16px' }}
            >
              <span className="status-dot"></span>
              {STATUS_LABELS[lot.status]}
            </span>
          </div>

          {/* Characteristics */}
          <div className="lot-detail-grid">
            <div className="lot-detail-item">
              <div className="lot-detail-item-icon">📐</div>
              <div className="lot-detail-item-value">{lot.surface ? `${lot.surface} m²` : '-'}</div>
              <div className="lot-detail-item-label">Surface</div>
            </div>
            <div className="lot-detail-item">
              <div className="lot-detail-item-icon">📍</div>
              <div className="lot-detail-item-value">{lot.zone || '-'}</div>
              <div className="lot-detail-item-label">Zone</div>
            </div>
            <div className="lot-detail-item">
              <div className="lot-detail-item-icon">📅</div>
              <div className="lot-detail-item-value">{lot.days_in_status ? Math.round(lot.days_in_status) : 0}j</div>
              <div className="lot-detail-item-label">Dans ce statut</div>
            </div>
          </div>

          {/* Reservation Info */}
          {lot.status === 'reserved' && lot.client_name && (
            <div className="section-card" style={{ background: 'var(--bg-tertiary)', marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: 'var(--spacing-md)', color: 'var(--color-warning)' }}>
                📋 Réservation en cours
              </h3>
              <div style={{ display: 'grid', gap: 'var(--spacing-sm)' }}>
                <div className="flex justify-between">
                  <span className="text-muted">Client:</span>
                  <span className="font-semibold">{lot.client_name}</span>
                </div>
                {lot.client_phone && (
                  <div className="flex justify-between">
                    <span className="text-muted">Téléphone:</span>
                    <span>{lot.client_phone}</span>
                  </div>
                )}
                {lot.reservation_date && (
                  <div className="flex justify-between">
                    <span className="text-muted">Date réservation:</span>
                    <span>{formatDate(lot.reservation_date)}</span>
                  </div>
                )}
                {lot.expiration_date && (
                  <div className="flex justify-between">
                    <span className="text-muted">Expire le:</span>
                    <span style={{ color: 'var(--color-warning)' }}>{formatDate(lot.expiration_date)}</span>
                  </div>
                )}
                {lot.deposit > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Acompte:</span>
                    <span className="font-semibold">{formatPrice(lot.deposit)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reserve Form */}
          {mode === 'reserve' && (
            <div className="section-card" style={{ background: 'var(--bg-tertiary)', marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: 'var(--spacing-md)' }}>
                Réserver le lot
              </h3>
              <div className="form-group">
                <label className="form-label">Client *</label>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <select
                    className="form-input"
                    style={{ flex: 1 }}
                    value={selectedClient?.id || ''}
                    onChange={(e) => {
                      const client = clients.find(c => c.id === parseInt(e.target.value));
                      setSelectedClient(client);
                    }}
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} {client.phone ? `- ${client.phone}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowAddClient(!showAddClient)}
                    title="Ajouter un nouveau client"
                  >
                    {showAddClient ? '✕' : '+ Client'}
                  </button>
                </div>
              </div>

              {/* Add Client Form */}
              {showAddClient && (
                <div style={{
                  background: 'var(--bg-secondary)',
                  padding: 'var(--spacing-md)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--spacing-md)',
                  border: '1px solid var(--bg-tertiary)'
                }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: 'var(--spacing-md)', color: 'var(--color-primary)' }}>
                    Nouveau client
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-sm)' }}>
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Nom *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Nom complet"
                        value={newClient.name}
                        onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Téléphone</label>
                      <input
                        type="tel"
                        className="form-input"
                        placeholder="0612345678"
                        value={newClient.phone}
                        onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Email</label>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="email@example.com"
                        value={newClient.email}
                        onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>CIN</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="AB123456"
                        value={newClient.cin}
                        onChange={(e) => setNewClient({ ...newClient, cin: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)', gridColumn: 'span 2' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Type de client</label>
                      <select
                        className="form-input"
                        value={newClient.client_type}
                        onChange={(e) => setNewClient({ ...newClient, client_type: e.target.value })}
                      >
                        {CLIENT_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setShowAddClient(false);
                        setNewClient({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });
                      }}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleCreateClient}
                      disabled={savingClient}
                    >
                      {savingClient ? 'Création...' : 'Créer et sélectionner'}
                    </button>
                  </div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Montant acompte (optionnel)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Ex: 50000"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-sm">
                <button className="btn btn-ghost" onClick={() => handleSetMode(null)}>Annuler</button>
                <button className="btn btn-warning" onClick={handleReserve} disabled={loading}>
                  {loading ? 'Réservation...' : 'Confirmer la réservation'}
                </button>
              </div>
            </div>
          )}

          {/* Sell Form */}
          {mode === 'sell' && (
            <div className="section-card" style={{ background: 'var(--bg-tertiary)', marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: 'var(--spacing-md)' }}>
                {lot.status === 'reserved' ? 'Finaliser la vente' : 'Vendre le lot'}
              </h3>

              {lot.status !== 'reserved' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Client *</label>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                      <select
                        className="form-input"
                        style={{ flex: 1 }}
                        value={selectedClient?.id || ''}
                        onChange={(e) => {
                          const client = clients.find(c => c.id === parseInt(e.target.value));
                          setSelectedClient(client);
                        }}
                      >
                        <option value="">Sélectionner un client</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name} {client.phone ? `- ${client.phone}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setShowAddClient(!showAddClient)}
                        title="Ajouter un nouveau client"
                      >
                        {showAddClient ? '✕' : '+ Client'}
                      </button>
                    </div>
                  </div>

                  {/* Add Client Form */}
                  {showAddClient && (
                    <div style={{
                      background: 'var(--bg-secondary)',
                      padding: 'var(--spacing-md)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: 'var(--spacing-md)',
                      border: '1px solid var(--bg-tertiary)'
                    }}>
                      <h4 style={{ fontSize: '0.9rem', marginBottom: 'var(--spacing-md)', color: 'var(--color-primary)' }}>
                        Nouveau client
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-sm)' }}>
                        <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>Nom *</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Nom complet"
                            value={newClient.name}
                            onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>Téléphone</label>
                          <input
                            type="tel"
                            className="form-input"
                            placeholder="0612345678"
                            value={newClient.phone}
                            onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>Email</label>
                          <input
                            type="email"
                            className="form-input"
                            placeholder="email@example.com"
                            value={newClient.email}
                            onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>CIN</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="AB123456"
                            value={newClient.cin}
                            onChange={(e) => setNewClient({ ...newClient, cin: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)', gridColumn: 'span 2' }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>Type de client</label>
                          <select
                            className="form-input"
                            value={newClient.client_type}
                            onChange={(e) => setNewClient({ ...newClient, client_type: e.target.value })}
                          >
                            {CLIENT_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setShowAddClient(false);
                            setNewClient({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });
                          }}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleCreateClient}
                          disabled={savingClient}
                        >
                          {savingClient ? 'Création...' : 'Créer et sélectionner'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {lot.status === 'reserved' && lot.client_name && (
                <div className="form-group">
                  <label className="form-label">Client</label>
                  <div className="form-input" style={{ background: 'var(--bg-secondary)' }}>
                    {lot.client_name} (client de la réservation)
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Prix final *</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Prix de vente"
                  value={finalPrice}
                  onChange={(e) => setFinalPrice(e.target.value)}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Prix catalogue: {formatPrice(lot.price)}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-sm">
                <button className="btn btn-ghost" onClick={() => handleSetMode(null)}>Annuler</button>
                <button className="btn btn-success" onClick={handleSell} disabled={loading}>
                  {loading ? 'Vente...' : 'Confirmer la vente'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        {!mode && (
          <div className="modal-footer">
            {lot.status === 'available' && (
              <>
                <button className="btn btn-warning" onClick={() => handleSetMode('reserve')}>
                  📋 Réserver
                </button>
                <button className="btn btn-success" onClick={() => handleSetMode('sell')}>
                  ✅ Vendre
                </button>
              </>
            )}
            {lot.status === 'reserved' && (
              <>
                <button className="btn btn-ghost" onClick={handleRelease} disabled={loading}>
                  🔓 Libérer
                </button>
                <button className="btn btn-success" onClick={() => handleSetMode('sell')}>
                  ✅ Finaliser la vente
                </button>
              </>
            )}
            <button className="btn btn-ghost" onClick={onClose}>
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
