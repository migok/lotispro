import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../utils/api';

const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="16" height="12" rx="2"/>
    <path d="M2 7l8 5 8-5"/>
  </svg>
);

const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 10 8 14 16 6"/>
  </svg>
);

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3L5 8l5 5"/>
  </svg>
);

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiPost('/api/auth/forgot-password', { email });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Une erreur est survenue. Veuillez réessayer.');
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
            Mot de passe oublié
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
                Email envoyé
              </p>
              <p style={{ margin: '0 0 24px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Un lien de réinitialisation a été envoyé à <strong>{email}</strong>.
                Vérifiez votre boîte mail et suivez les instructions.
              </p>
              <button
                className="btn-primary"
                style={{ width: '100%' }}
                onClick={() => navigate('/login')}
              >
                Retour à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Saisissez l'adresse email associée à votre compte. Vous recevrez un lien pour réinitialiser votre mot de passe.
              </p>

              <div className="field-group">
                <label className="field-label">Adresse email *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="field-input"
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoFocus
                    required
                    style={{ paddingLeft: 40 }}
                  />
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
                    <IconMail />
                  </span>
                </div>
              </div>

              {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ width: '100%', marginTop: 20 }}
              >
                {loading ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 36px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          {!done && (
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <IconArrowLeft />
              Retour à la connexion
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
