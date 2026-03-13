import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiPost } from '../utils/api';

const IconEye = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="1.8"/>
  </svg>
);
const IconEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="1.8"/>
    <line x1="2" y1="2" x2="14" y2="14"/>
  </svg>
);
const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 10 8 14 16 6"/>
  </svg>
);

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const isReset = searchParams.get('mode') === 'reset';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("Lien invalide — aucun token trouvé.");
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères.');
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');
    setLoading(true);
    try {
      await apiPost('/api/users/set-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Une erreur est survenue. Le lien est peut-être expiré.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--bg-tertiary)', padding: '28px 36px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.68rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-primary)', fontWeight: 600 }}>
            LotisPro
          </p>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'var(--font-display)', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
            {isReset ? 'Réinitialiser mon mot de passe' : 'Créer mon mot de passe'}
          </h1>
        </div>

        {/* Body */}
        <div style={{ padding: '28px 36px' }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48,
                borderRadius: '50%',
                background: 'rgba(16,185,129,0.12)',
                color: '#10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <IconCheck />
              </div>
              <p style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isReset ? 'Mot de passe réinitialisé' : 'Mot de passe créé'}
              </p>
              <p style={{ margin: '0 0 24px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {isReset
                  ? 'Votre mot de passe a été mis à jour. Vous pouvez maintenant vous connecter.'
                  : 'Votre compte est activé. Vous pouvez maintenant vous connecter.'}
              </p>
              <button
                className="btn-primary"
                style={{ width: '100%' }}
                onClick={() => navigate('/login')}
              >
                Aller à la connexion
              </button>
            </div>
          ) : (
            <>
              {!token ? (
                <div className="error-box">{error}</div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {isReset
                      ? 'Définissez un nouveau mot de passe pour votre compte LotisPro.'
                      : 'Définissez un mot de passe sécurisé pour activer votre compte LotisPro.'}
                  </p>

                  <div className="field-group">
                    <label className="field-label">Mot de passe *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="field-input"
                        type={showPwd ? 'text' : 'password'}
                        placeholder="Minimum 6 caractères"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoFocus
                        style={{ paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(v => !v)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                      >
                        {showPwd ? <IconEyeOff /> : <IconEye />}
                      </button>
                    </div>
                  </div>

                  <div className="field-group" style={{ marginTop: 12 }}>
                    <label className="field-label">Confirmer *</label>
                    <input
                      className="field-input"
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Répéter le mot de passe"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                    />
                  </div>

                  {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading}
                    style={{ width: '100%', marginTop: 20 }}
                  >
                    {loading ? 'Enregistrement…' : isReset ? 'Réinitialiser mon mot de passe' : 'Activer mon compte'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 36px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {isReset
              ? 'Ce lien est valable 1 heure après réception de l\u2019email.'
              : 'Ce lien est valable 48 heures après réception de l\u2019invitation.'}
          </p>
        </div>
      </div>
    </div>
  );
}
