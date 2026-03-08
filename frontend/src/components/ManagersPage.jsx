import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { API_BASE_URL } from '../utils/config';

/* ─── inline style tokens ─── */
const S = {
  page: {
    padding: '32px 40px',
    maxWidth: 1100,
    margin: '0 auto',
  },
  /* Header */
  headerWrap: {
    marginBottom: 40,
  },
  eyebrow: {
    fontSize: '0.68rem',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--color-primary)',
    fontWeight: 600,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(2rem, 4vw, 2.8rem)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.1,
    marginBottom: 8,
  },
  titleAccent: {
    display: 'inline-block',
    borderBottom: '2px solid var(--color-primary)',
    paddingBottom: 2,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  /* Stat strip */
  statStrip: {
    display: 'flex',
    gap: 12,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  statTile: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: '14px 22px',
    minWidth: 110,
    flex: '0 0 auto',
  },
  statTileAccent: {
    background: 'var(--color-primary-subtle)',
    border: '1px solid var(--border-gold)',
    borderRadius: 8,
    padding: '14px 22px',
    minWidth: 110,
    flex: '0 0 auto',
  },
  statValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1.9rem',
    fontWeight: 500,
    color: 'var(--text-primary)',
    lineHeight: 1,
    marginBottom: 4,
    fontVariantNumeric: 'tabular-nums lining-nums',
  },
  statValueAccent: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1.9rem',
    fontWeight: 500,
    color: 'var(--color-primary)',
    lineHeight: 1,
    marginBottom: 4,
    fontVariantNumeric: 'tabular-nums lining-nums',
  },
  statLabel: {
    fontSize: '0.68rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  /* Search */
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: '0 14px',
    marginBottom: 24,
    transition: 'border-color 0.15s',
  },
  searchInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    padding: '12px 0',
    fontFamily: 'var(--font-body)',
  },
  /* Roster table */
  roster: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  rosterHead: {
    display: 'grid',
    gridTemplateColumns: '44px 1fr 200px 200px 44px',
    gap: 16,
    padding: '0 20px 10px',
    borderBottom: '1px solid var(--border-subtle)',
    marginBottom: 4,
  },
  rosterHeadCell: {
    fontSize: '0.65rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    fontWeight: 600,
  },
  rosterRow: {
    display: 'grid',
    gridTemplateColumns: '44px 1fr 200px 200px 44px',
    gap: 16,
    alignItems: 'center',
    padding: '16px 20px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    transition: 'border-color 0.15s, background 0.15s',
    cursor: 'default',
  },
  /* Monogram */
  monogram: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: 'var(--color-primary)',
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1.1rem',
    flexShrink: 0,
    letterSpacing: '-0.02em',
  },
  /* Identity */
  identity: {
    minWidth: 0,
  },
  fullName: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emailLine: {
    fontSize: '0.78rem',
    color: 'var(--text-muted)',
    marginTop: 2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  metaCell: {
    minWidth: 0,
  },
  metaMain: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  metaSub: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    marginTop: 2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    padding: 6,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s, background 0.15s',
    marginLeft: 'auto',
  },
  /* CTA button */
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    background: 'var(--color-primary)',
    color: '#111827',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    letterSpacing: '0.01em',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap',
  },
  /* Empty state */
  emptyWrap: {
    textAlign: 'center',
    padding: '80px 40px',
    border: '1px dashed var(--border-subtle)',
    borderRadius: 12,
  },
  emptyNum: {
    fontFamily: 'var(--font-display)',
    fontSize: '6rem',
    fontWeight: 700,
    color: 'var(--bg-surface)',
    lineHeight: 1,
    marginBottom: 12,
    userSelect: 'none',
  },
  emptyLabel: {
    fontSize: '0.9rem',
    color: 'var(--text-muted)',
    marginBottom: 24,
  },
  /* Modal */
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13,18,32,0.82)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalTop: {
    padding: '24px 28px 20px',
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalEye: {
    fontSize: '0.65rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--color-primary)',
    fontWeight: 600,
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    padding: 6,
    borderRadius: 6,
    display: 'flex',
  },
  modalBody: {
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  row2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: '0.72rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    fontWeight: 600,
  },
  input: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  inputWrap: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    display: 'flex',
    padding: 2,
  },
  errorBox: {
    padding: '10px 14px',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.22)',
    borderRadius: 6,
    color: 'var(--color-blocked)',
    fontSize: '0.82rem',
  },
  modalFooter: {
    padding: '16px 28px 24px',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btnGhost: {
    padding: '9px 18px',
    background: 'none',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontWeight: 500,
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    transition: 'border-color 0.15s, color 0.15s',
  },
  btnDanger: {
    padding: '9px 18px',
    background: 'var(--color-blocked)',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
};

/* ─── helper ─── */
function getInitials(m) {
  const fn = (m.first_name || '')[0] || '';
  const ln = (m.last_name || m.name || '')[0] || '';
  return (fn + ln).toUpperCase() || '?';
}

function getDisplayName(m) {
  if (m.first_name && m.last_name) return `${m.first_name} ${m.last_name}`;
  return m.name;
}

/* ─── component ─── */
export default function ManagersPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [managers, setManagers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);

  const emptyForm = { first_name: '', last_name: '', email: '', address: '', company: '', password: '', confirmPassword: '' };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { if (token) loadManagers(); }, [token]);

  const loadManagers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users?role=manager`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setManagers(await res.json());
    } catch {
      toast.error('Erreur lors du chargement des managers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.first_name.trim() || !form.last_name.trim()) return setFormError('Le prénom et le nom sont requis.');
    if (!form.email.trim()) return setFormError("L'email est requis.");
    if (form.password.length < 6) return setFormError('Mot de passe minimum 6 caractères.');
    if (form.password !== form.confirmPassword) return setFormError('Les mots de passe ne correspondent pas.');
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          name: `${form.first_name.trim()} ${form.last_name.trim()}`,
          email: form.email.trim(),
          address: form.address.trim() || null,
          company: form.company.trim() || null,
          password: form.password,
          role: 'manager',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erreur lors de la création');
      }
      toast.success('Manager créé avec succès');
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
      const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success('Manager supprimé');
      setDeleteConfirm(null);
      loadManagers();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const filtered = managers.filter(m =>
    `${m.first_name || ''} ${m.last_name || ''} ${m.name} ${m.email} ${m.company || ''}`
      .toLowerCase().includes(searchQuery.toLowerCase())
  );

  const withCompany = managers.filter(m => m.company).length;

  /* ─── derived stats ─── */
  const companies = [...new Set(managers.map(m => m.company).filter(Boolean))].length;

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={S.headerWrap}>
        <div style={S.headerRow}>
          <div>
            <p style={S.eyebrow}>Administration</p>
            <h1 style={S.title}>
              <span style={S.titleAccent}>Managers</span>
            </h1>
          </div>
          <button
            style={S.btnPrimary}
            onClick={() => { setShowModal(true); setForm(emptyForm); setFormError(''); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
            </svg>
            Nouveau manager
          </button>
        </div>
      </div>

      {/* ── Stat strip ── */}
      <div style={S.statStrip}>
        <div style={S.statTileAccent}>
          <div style={S.statValueAccent}>{managers.length}</div>
          <div style={S.statLabel}>Managers</div>
        </div>
        <div style={S.statTile}>
          <div style={S.statValue}>{companies}</div>
          <div style={S.statLabel}>Entreprises</div>
        </div>
        <div style={S.statTile}>
          <div style={S.statValue}>{withCompany}</div>
          <div style={S.statLabel}>Avec entreprise</div>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={S.searchWrap}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10L13 13"/>
        </svg>
        <input
          style={S.searchInput}
          placeholder="Rechercher par nom, email, entreprise…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Roster ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div style={S.emptyWrap}>
          <div style={S.emptyNum}>0</div>
          <p style={S.emptyLabel}>
            {searchQuery ? 'Aucun résultat pour cette recherche.' : 'Aucun manager enregistré.'}
          </p>
          {!searchQuery && (
            <button style={S.btnPrimary} onClick={() => setShowModal(true)}>
              Ajouter le premier manager
            </button>
          )}
        </div>
      ) : (
        <div style={S.roster}>
          {/* Column headers */}
          <div style={S.rosterHead}>
            <div />
            <div style={S.rosterHeadCell}>Identité</div>
            <div style={S.rosterHeadCell}>Entreprise</div>
            <div style={S.rosterHeadCell}>Adresse</div>
            <div />
          </div>

          {filtered.map(m => (
            <div
              key={m.id}
              style={{
                ...S.rosterRow,
                borderColor: hoveredRow === m.id ? 'var(--border-gold)' : 'var(--border-subtle)',
                background: hoveredRow === m.id ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
              }}
              onMouseEnter={() => setHoveredRow(m.id)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* Monogram */}
              <div style={S.monogram}>{getInitials(m)}</div>

              {/* Identity */}
              <div style={S.identity}>
                <div style={S.fullName}>{getDisplayName(m)}</div>
                <div style={S.emailLine}>{m.email}</div>
              </div>

              {/* Company */}
              <div style={S.metaCell}>
                {m.company ? (
                  <>
                    <div style={S.metaMain}>{m.company}</div>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>—</span>
                )}
              </div>

              {/* Address */}
              <div style={S.metaCell}>
                {m.address ? (
                  <div style={S.metaMain}>{m.address}</div>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>—</span>
                )}
              </div>

              {/* Delete */}
              <button
                style={S.deleteBtn}
                onClick={() => setDeleteConfirm(m)}
                title="Supprimer"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-blocked)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 4 13 4"/><path d="M5 4V2.5h5V4"/><path d="M2.5 4l.9 9h8.2l.9-9"/>
                  <line x1="5.5" y1="6.5" x2="5.5" y2="10.5"/><line x1="9.5" y1="6.5" x2="9.5" y2="10.5"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Create Modal ── */}
      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalTop}>
              <div>
                <p style={S.modalEye}>Nouveau compte</p>
                <h2 style={S.modalTitle}>Créer un manager</h2>
              </div>
              <button style={S.closeBtn} onClick={() => setShowModal(false)}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={S.modalBody}>
                <div style={S.row2}>
                  <div style={S.fieldGroup}>
                    <label style={S.label}>Prénom *</label>
                    <input
                      style={S.input}
                      type="text"
                      placeholder="Jean"
                      value={form.first_name}
                      onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div style={S.fieldGroup}>
                    <label style={S.label}>Nom *</label>
                    <input
                      style={S.input}
                      type="text"
                      placeholder="Dupont"
                      value={form.last_name}
                      onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={S.fieldGroup}>
                  <label style={S.label}>Email *</label>
                  <input
                    style={S.input}
                    type="email"
                    placeholder="jean.dupont@entreprise.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>

                <div style={S.fieldGroup}>
                  <label style={S.label}>Entreprise</label>
                  <input
                    style={S.input}
                    type="text"
                    placeholder="Nom de l'entreprise"
                    value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  />
                </div>

                <div style={S.fieldGroup}>
                  <label style={S.label}>Adresse</label>
                  <input
                    style={S.input}
                    type="text"
                    placeholder="12 rue de la Paix, Casablanca"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

                <div style={S.fieldGroup}>
                  <label style={S.label}>Mot de passe *</label>
                  <div style={S.inputWrap}>
                    <input
                      style={{ ...S.input, paddingRight: 40 }}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 6 caractères"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    />
                    <button type="button" style={S.eyeBtn} onClick={() => setShowPassword(v => !v)}>
                      {showPassword ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="1.8"/>
                          <line x1="2" y1="2" x2="14" y2="14"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="1.8"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div style={S.fieldGroup}>
                  <label style={S.label}>Confirmer le mot de passe *</label>
                  <input
                    style={S.input}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Répéter le mot de passe"
                    value={form.confirmPassword}
                    onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  />
                </div>

                {formError && <div style={S.errorBox}>{formError}</div>}
              </div>

              <div style={S.modalFooter}>
                <button type="button" style={S.btnGhost} onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" style={S.btnPrimary} disabled={saving}>
                  {saving ? 'Création…' : 'Créer le manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div style={S.overlay} onClick={() => setDeleteConfirm(null)}>
          <div style={{ ...S.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalTop}>
              <div>
                <p style={{ ...S.modalEye, color: 'var(--color-blocked)' }}>Action irréversible</p>
                <h2 style={S.modalTitle}>Supprimer le manager</h2>
              </div>
            </div>
            <div style={{ padding: '24px 28px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                Êtes-vous sûr de vouloir supprimer{' '}
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                  {getDisplayName(deleteConfirm)}
                </strong>{' '}
                ?
              </p>
            </div>
            <div style={S.modalFooter}>
              <button style={S.btnGhost} onClick={() => setDeleteConfirm(null)}>Annuler</button>
              <button style={S.btnDanger} onClick={() => handleDelete(deleteConfirm.id)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
