import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { API_BASE_URL } from '../utils/config';
import { formatDate, formatPrice } from '../utils/formatters';

export default function CommercialsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [commercials, setCommercials] = useState([]);
  const [commercialStats, setCommercialStats] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newCommercial, setNewCommercial] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (token) {
      loadCommercials();
      loadCommercialStats();
    }
  }, [token]);

  const loadCommercials = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users?role=commercial`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setCommercials(data);
    } catch (error) {
      console.error('Error loading commercials:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCommercialStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboard/commercial-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        const statsMap = {};
        data.forEach(stat => {
          statsMap[stat.commercial_id] = stat;
        });
        setCommercialStats(statsMap);
      }
    } catch (error) {
      console.error('Error loading commercial stats:', error);
    }
  };

  const handleCreateCommercial = async () => {
    setError('');

    if (!newCommercial.name.trim()) {
      setError('Le nom est requis');
      return;
    }
    if (!newCommercial.email.trim()) {
      setError('L\'email est requis');
      return;
    }
    if (!newCommercial.password) {
      setError('Le mot de passe est requis');
      return;
    }
    if (newCommercial.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (newCommercial.password !== newCommercial.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCommercial.name,
          email: newCommercial.email,
          password: newCommercial.password,
          role: 'commercial',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Erreur lors de la création');
      }

      setShowModal(false);
      setNewCommercial({ name: '', email: '', password: '', confirmPassword: '' });
      loadCommercials();
      toast.success('Commercial créé avec succès');
    } catch (error) {
      console.error('Error creating commercial:', error);
      setError(error.message || 'Erreur lors de la création du commercial');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCommercial = async (commercialId, commercialName) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le commercial "${commercialName}" ?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${commercialId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Erreur lors de la suppression');
      }

      toast.success('Commercial supprimé avec succès');
      loadCommercials();
    } catch (error) {
      console.error('Error deleting commercial:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const filteredCommercials = commercials.filter((commercial) =>
    commercial.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    commercial.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Calcul des totaux pour les KPIs
  const totalSales = Object.values(commercialStats).reduce((sum, s) => sum + (s.total_sales || 0), 0);
  const totalDeposits = Object.values(commercialStats).reduce((sum, s) => sum + (s.total_deposits || 0), 0);
  const totalRevenue = Object.values(commercialStats).reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  const activeReservations = Object.values(commercialStats).reduce((sum, s) => sum + (s.active_reservations || 0), 0);

  return (
    <div className="commercials-page">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Commerciaux</h1>
        <p className="page-subtitle">Gérez votre équipe commerciale et suivez leurs performances</p>
      </div>

      {/* Search and Actions */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <svg className="search-icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Rechercher un commercial..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Nouveau commercial
        </button>
      </div>

      {/* Stats KPI Grid */}
      <div className="kpi-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: 'var(--color-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
          </div>
          <div className="kpi-value">{commercials.length}</div>
          <div className="kpi-label">Commerciaux actifs</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--color-success)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--color-success)' }}>{totalSales}</div>
          <div className="kpi-label">Ventes totales</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', color: 'var(--color-warning)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>{activeReservations}</div>
          <div className="kpi-label">Réservations actives</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon" style={{ backgroundColor: 'rgba(6, 182, 212, 0.2)', color: 'var(--color-info)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
          </div>
          <div className="kpi-value">{formatPrice(totalDeposits)}</div>
          <div className="kpi-label">Acomptes collectés</div>
        </div>
      </div>

      {/* Commercials List */}
      <div className="section-card">
        <div className="section-header">
          <h2 className="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Équipe commerciale
          </h2>
          <span className="badge-count">{filteredCommercials.length} membre{filteredCommercials.length > 1 ? 's' : ''}</span>
        </div>

        <div className="commercial-list">
          {filteredCommercials.map((commercial) => {
            const stats = commercialStats[commercial.id] || {};
            const performance = stats.total_sales > 5 ? 'excellent' : stats.total_sales > 2 ? 'good' : stats.total_sales > 0 ? 'average' : 'new';

            return (
              <div key={commercial.id} className="commercial-card">
                {/* Left Section - Avatar & Info */}
                <div className="commercial-main-info">
                  <div className="commercial-avatar">
                    {commercial.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                  </div>
                  <div className="commercial-details">
                    <div className="commercial-name-row">
                      <span className="commercial-name">{commercial.name}</span>
                      <span className={`performance-badge ${performance}`}>
                        {performance === 'excellent' && 'Top performer'}
                        {performance === 'good' && 'Performant'}
                        {performance === 'average' && 'Actif'}
                        {performance === 'new' && 'Nouveau'}
                      </span>
                    </div>
                    <div className="commercial-contact-row">
                      <span className="contact-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        {commercial.email}
                      </span>
                      <span className="contact-item muted">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        Depuis {formatDate(commercial.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Middle Section - Activity Stats */}
                <div className="commercial-activity-stats">
                  <div className="activity-stat purchase">
                    <span className="stat-number">{stats.total_sales || 0}</span>
                    <span className="stat-label">Vente{(stats.total_sales || 0) > 1 ? 's' : ''}</span>
                  </div>
                  <div className="activity-stat reservation">
                    <span className="stat-number">{stats.active_reservations || 0}</span>
                    <span className="stat-label">Réserv.</span>
                  </div>
                </div>

                {/* Financial Section */}
                <div className="commercial-financial-section">
                  {(stats.total_deposits > 0 || stats.total_revenue > 0) ? (
                    <>
                      <div className="financial-item deposit">
                        <div className="financial-label">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                          </svg>
                          Acomptes
                        </div>
                        <div className="financial-value">{formatPrice(stats.total_deposits || 0)}</div>
                      </div>
                      <div className="financial-item total">
                        <div className="financial-label">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="1" x2="12" y2="23"/>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                          </svg>
                          CA généré
                        </div>
                        <div className="financial-value">{formatPrice(stats.total_revenue || 0)}</div>
                      </div>
                    </>
                  ) : (
                    <div className="financial-empty">
                      <span>Pas encore de ventes</span>
                    </div>
                  )}
                </div>

                {/* Right Section - Actions */}
                <div className="commercial-actions-section">
                  <button
                    className="btn-delete"
                    onClick={() => handleDeleteCommercial(commercial.id, commercial.name)}
                    title="Supprimer ce commercial"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      <line x1="10" y1="11" x2="10" y2="17"/>
                      <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredCommercials.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="empty-state-title">Aucun commercial trouvé</div>
            <div className="empty-state-description">
              {searchQuery ? 'Essayez une autre recherche' : 'Ajoutez votre premier commercial pour commencer'}
            </div>
            {!searchQuery && (
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Ajouter un commercial
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create Commercial Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setShowPassword(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Nouveau commercial</h2>
              <button className="modal-close" onClick={() => { setShowModal(false); setShowPassword(false); }}>×</button>
            </div>
            <div className="modal-body">
              {error && (
                <div style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-danger)',
                  marginBottom: 'var(--spacing-md)',
                  fontSize: '0.875rem',
                }}>
                  {error}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nom complet *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Jean Dupont"
                  value={newCommercial.name}
                  onChange={(e) => setNewCommercial({ ...newCommercial, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="jean@example.com"
                  value={newCommercial.email}
                  onChange={(e) => setNewCommercial({ ...newCommercial, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mot de passe *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Minimum 6 caractères"
                    value={newCommercial.password}
                    onChange={(e) => setNewCommercial({ ...newCommercial, password: e.target.value })}
                    style={{ paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      padding: '4px',
                    }}
                    title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirmer le mot de passe *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Confirmer le mot de passe"
                    value={newCommercial.confirmPassword}
                    onChange={(e) => setNewCommercial({ ...newCommercial, confirmPassword: e.target.value })}
                    style={{ paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      padding: '4px',
                    }}
                    title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); setError(''); setShowPassword(false); }}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={handleCreateCommercial} disabled={saving}>
                {saving ? 'Création...' : 'Créer le commercial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
