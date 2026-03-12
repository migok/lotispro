import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';

/* ─── Icons ─── */
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
  </svg>
);
const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10L13 13"/>
  </svg>
);
const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/>
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 4 13 4"/><path d="M5 4V2.5h5V4"/><path d="M2.5 4l.9 9h8.2l.9-9"/>
    <line x1="5.5" y1="6.5" x2="5.5" y2="10.5"/><line x1="9.5" y1="6.5" x2="9.5" y2="10.5"/>
  </svg>
);
const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="12" height="8" rx="1"/>
    <polyline points="1 3 7 8 13 3"/>
  </svg>
);
const IconBuilding = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="1.5" width="9" height="9" rx="1"/>
    <line x1="4" y1="1.5" x2="4" y2="10.5"/>
    <line x1="8" y1="1.5" x2="8" y2="10.5"/>
    <line x1="1.5" y1="5" x2="10.5" y2="5"/>
    <line x1="1.5" y1="8" x2="10.5" y2="8"/>
  </svg>
);
const IconPin = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 1a3 3 0 0 1 3 3c0 2.5-3 7-3 7S3 6.5 3 4a3 3 0 0 1 3-3z"/>
    <circle cx="6" cy="4" r="1"/>
  </svg>
);

/* ─── Helpers ─── */
function getInitials(m) {
  const fn = (m.first_name || '')[0] || '';
  const ln = (m.last_name || m.name || '')[0] || '';
  return (fn + ln).toUpperCase() || '?';
}

function getDisplayName(m) {
  if (m.first_name && m.last_name) return `${m.first_name} ${m.last_name}`;
  return m.name;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── Component ─── */
export default function ManagersPage() {
  const toast = useToast();
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const emptyForm = { first_name: '', last_name: '', email: '', address: '', company: '' };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadManagers(); }, []);

  const loadManagers = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/users?role=manager');
      setManagers(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erreur lors du chargement des managers');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.first_name.trim() || !form.last_name.trim()) return setFormError('Le prénom et le nom sont requis.');
    if (!form.email.trim()) return setFormError("L'email est requis.");
    setSaving(true);
    try {
      await apiPost('/api/users/invite', {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        address: form.address.trim() || null,
        company: form.company.trim() || null,
        role: 'manager',
      });
      toast.success('Invitation envoyée par email');
      setShowModal(false);
      setForm(emptyForm);
      loadManagers();
    } catch (err) {
      setFormError(err.message || 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiDelete(`/api/users/${id}`);
      toast.success('Manager supprimé');
      setDeleteConfirm(null);
      loadManagers();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  /* ── Derived ── */
  const thisMonth = useMemo(() => {
    const now = new Date();
    return managers.filter(m => {
      const d = new Date(m.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [managers]);

  const companies = useMemo(() => {
    const map = {};
    managers.forEach(m => { if (m.company) map[m.company] = (map[m.company] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [managers]);

  const withoutCompany = managers.filter(m => !m.company).length;
  const maxCompanyCount = Math.max(companies[0]?.[1] || 0, withoutCompany, 1);

  const recentManagers = useMemo(() =>
    [...managers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5),
    [managers]
  );

  const displayList = useMemo(() => {
    let list = managers.filter(m => {
      const q = searchQuery.toLowerCase();
      return `${m.first_name || ''} ${m.last_name || ''} ${m.name} ${m.email} ${m.company || ''}`.toLowerCase().includes(q);
    });
    if (sortBy === 'name')         list = [...list].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    else if (sortBy === 'date')    list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sortBy === 'company') list = [...list].sort((a, b) => (a.company || '').localeCompare(b.company || ''));
    return list;
  }, [managers, searchQuery, sortBy]);

  return (
    <div className="page-container">

      {/* ── Header ── */}
      <div className="cp-header">
        <div>
          <p className="page-eyebrow">Administration</p>
          <h1 className="page-title-accent">Managers</h1>
        </div>
        <button className="cp-btn-primary" onClick={() => { setShowModal(true); setForm(emptyForm); setFormError(''); }}>
          <IconPlus /> Nouveau manager
        </button>
      </div>

      {/* ── KPI Strip ── */}
      <div className="stat-strip">
        <div className="stat-tile stat-tile-accent">
          <div className="stat-tile-value">{managers.length}</div>
          <div className="stat-tile-label">Managers</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{companies.length}</div>
          <div className="stat-tile-label">Entreprises</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{thisMonth}</div>
          <div className="stat-tile-label">Ce mois</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="cp-body">

        {/* ── Left: Roster ── */}
        <div className="cp-team">
          <div className="cp-controls">
            <div className="search-bar">
              <IconSearch />
              <input
                className="search-input"
                placeholder="Rechercher par nom, email, entreprise…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="cp-clear-btn" onClick={() => setSearchQuery('')}><IconClose /></button>
              )}
            </div>
            <select className="cp-filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="name">Nom A→Z</option>
              <option value="date">Plus récents</option>
              <option value="company">Entreprise</option>
            </select>
          </div>

          {loading ? (
            <div className="loading-state">Chargement…</div>
          ) : displayList.length === 0 ? (
            <div className="empty-state">
              <p>{searchQuery ? 'Aucun résultat pour cette recherche.' : 'Aucun manager enregistré.'}</p>
              {!searchQuery && (
                <button className="cp-btn-primary" onClick={() => setShowModal(true)}>
                  <IconPlus /> Ajouter le premier manager
                </button>
              )}
            </div>
          ) : (
            <div className="cp-roster">
              {displayList.map((m, idx) => (
                <div
                  key={m.id}
                  className="cp-card"
                  style={{ animationDelay: `${idx * 0.06}s` }}
                >
                  {/* Identity row */}
                  <div className="cp-card-top">
                    <div className="monogram monogram-lg">{getInitials(m)}</div>
                    <div className="cp-identity">
                      <div className="cp-identity-row">
                        <span className="identity-name">{getDisplayName(m)}</span>
                        {m.is_pending
                          ? <span className="cp-perf-badge cp-badge-gray">En attente</span>
                          : <span className="cp-perf-badge cp-badge-gold">Manager</span>
                        }
                      </div>
                      <div className="identity-email">{m.email}</div>
                    </div>
                    <button className="cp-delete-btn" onClick={() => setDeleteConfirm(m)} title="Supprimer">
                      <IconTrash />
                    </button>
                  </div>

                  {/* Meta row */}
                  <div className="mg-meta-row">
                    {m.company && (
                      <span className="mg-meta-item">
                        <IconBuilding /> {m.company}
                      </span>
                    )}
                    {m.address && (
                      <span className="mg-meta-item">
                        <IconPin /> {m.address}
                      </span>
                    )}
                    {!m.company && !m.address && (
                      <span className="mg-meta-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Aucune info supplémentaire
                      </span>
                    )}
                  </div>

                  {/* Invitation link (dev fallback when email not received) */}
                  {m.is_pending && m.invitation_token && (
                    <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-subtle)' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-primary)', fontWeight: 600 }}>Lien d&apos;invitation</p>
                      <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all', lineHeight: 1.4 }}>
                        {`${window.location.origin}/set-password?token=${m.invitation_token}`}
                      </p>
                      <button
                        type="button"
                        style={{ fontSize: '0.72rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/set-password?token=${m.invitation_token}`); }}
                      >
                        Copier le lien
                      </button>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mg-card-footer">
                    <span className="mg-since">Depuis {formatDate(m.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right Panel ── */}
        <aside className="cp-perf-panel card">
          <div className="cp-panel-header">
            <p className="page-eyebrow" style={{ marginBottom: 4 }}>Vue d&apos;ensemble</p>
            <h3 className="cp-panel-title">Organisation</h3>
          </div>

          {/* Companies breakdown */}
          <div className="mg-panel-section">
            <p className="mg-section-label">Répartition par entreprise</p>
            <div className="mg-companies">
              {companies.slice(0, 6).map(([name, count]) => (
                <div key={name} className="mg-company-row">
                  <div className="mg-company-info">
                    <span className="mg-company-name">{name}</span>
                    <span className="mg-company-count num">{count}</span>
                  </div>
                  <div className="mg-company-track">
                    <div className="mg-company-bar" style={{ width: `${(count / maxCompanyCount) * 100}%` }} />
                  </div>
                </div>
              ))}
              {withoutCompany > 0 && (
                <div className="mg-company-row">
                  <div className="mg-company-info">
                    <span className="mg-company-name mg-company-none">Sans entreprise</span>
                    <span className="mg-company-count num">{withoutCompany}</span>
                  </div>
                  <div className="mg-company-track">
                    <div className="mg-company-bar mg-bar-muted" style={{ width: `${(withoutCompany / maxCompanyCount) * 100}%` }} />
                  </div>
                </div>
              )}
              {companies.length === 0 && withoutCompany === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucune donnée</p>
              )}
            </div>
          </div>

          {/* Recently added */}
          <div className="mg-panel-section">
            <p className="mg-section-label">Récemment ajoutés</p>
            <div className="cp-leaderboard">
              {recentManagers.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucun manager</p>
              ) : recentManagers.map((m) => (
                <div key={m.id} className="cp-lb-row">
                  <div className="monogram monogram-sm">{getInitials(m)}</div>
                  <div className="cp-lb-identity">
                    <span className="cp-lb-name">{getDisplayName(m)}</span>
                    <span className="cp-lb-sub">{m.company || m.email}</span>
                  </div>
                  <span className="cp-lb-value mg-date-val">{formatDate(m.created_at)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer stats */}
          <div className="cp-panel-footer">
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{managers.length}</span>
              <span className="cp-panel-stat-lbl">Total</span>
            </div>
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{companies.length}</span>
              <span className="cp-panel-stat-lbl">Entreprises</span>
            </div>
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{thisMonth}</span>
              <span className="cp-panel-stat-lbl">Ce mois</span>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Create Modal ── */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-top">
              <div>
                <p className="cp-modal-eyebrow">Nouveau compte</p>
                <h2 className="cp-modal-title">Créer un manager</h2>
              </div>
              <button className="cp-modal-close" onClick={() => setShowModal(false)}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="cp-modal-body">
                <div className="form-2col">
                  <div className="field-group">
                    <label className="field-label">Prénom *</label>
                    <input className="field-input" type="text" placeholder="Jean"
                      value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} autoFocus />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Nom *</label>
                    <input className="field-input" type="text" placeholder="Dupont"
                      value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">Email *</label>
                  <input className="field-input" type="email" placeholder="jean.dupont@entreprise.com"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>

                <div className="field-group">
                  <label className="field-label">Entreprise</label>
                  <input className="field-input" type="text" placeholder="Nom de l'entreprise"
                    value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
                </div>

                <div className="field-group">
                  <label className="field-label">Adresse</label>
                  <input className="field-input" type="text" placeholder="12 rue de la Paix, Casablanca"
                    value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                  Un email d&apos;invitation sera envoyé pour que le manager crée son propre mot de passe.
                </p>

                {formError && <div className="error-box">{formError}</div>}
              </div>

              <div className="cp-modal-footer">
                <button type="button" className="cp-btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="cp-btn-primary" disabled={saving}>
                  {saving ? 'Envoi…' : <><IconMail /> &nbsp;Envoyer l&apos;invitation</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-top">
              <div>
                <p className="cp-modal-eyebrow" style={{ color: 'var(--color-blocked)' }}>Action irréversible</p>
                <h2 className="cp-modal-title">Supprimer le manager</h2>
              </div>
            </div>
            <div className="cp-modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                Êtes-vous sûr de vouloir supprimer{' '}
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                  {getDisplayName(deleteConfirm)}
                </strong>{' '}?
              </p>
            </div>
            <div className="cp-modal-footer">
              <button className="cp-btn-ghost" onClick={() => setDeleteConfirm(null)}>Annuler</button>
              <button className="btn-text-danger" onClick={() => handleDelete(deleteConfirm.id)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
