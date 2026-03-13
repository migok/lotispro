import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../hooks/useTheme";

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

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      navigate("/app/projects");
    } else {
      setError(result.error || "Identifiants invalides");
    }

    setLoading(false);
  };

  return (
    <div className="login-page">
      {/* Left panel — architectural pattern */}
      <div className="login-left">
        <div className="login-grid" aria-hidden="true">
          {Array.from({ length: 120 }).map((_, i) => (
            <div key={i} className="login-cell" />
          ))}
        </div>

        <div className="login-left-content">
          <div className="login-brand-mark">
            {/* Location pin + lot grid logo */}
            <svg width="72" height="82" viewBox="0 0 28 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M14 1C7.925 1 3 5.925 3 12c0 8.25 11 19 11 19S25 20.25 25 12C25 5.925 20.075 1 14 1z"
                fill="var(--color-primary)"
                fillOpacity="0.15"
                stroke="var(--color-primary)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <rect x="8.5" y="7" width="5" height="3.5" rx="0.75" fill="var(--color-primary)" fillOpacity="0.9"/>
              <rect x="15" y="7" width="5" height="3.5" rx="0.75" fill="var(--color-primary)" fillOpacity="0.9"/>
              <rect x="8.5" y="11.5" width="5" height="3.5" rx="0.75" fill="var(--color-primary)" fillOpacity="0.55"/>
              <rect x="15" y="11.5" width="5" height="3.5" rx="0.75" fill="var(--color-primary)" fillOpacity="0.55"/>
            </svg>
          </div>
          <div className="login-brand-title">LotisPro</div>
          <div className="login-brand-tagline">
            Gestion de projets<br />immobiliers
          </div>

          <div className="login-divider" />

          <div className="login-features">
            {["Suivi des lots en temps réel", "Cartographie GeoJSON interactive", "Pipeline de réservations", "KPIs et tableaux de bord"].map((f, i) => (
              <div key={i} className="login-feature-item">
                <div className="login-feature-dot" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="login-left-footer">
          Plateforme professionnelle · v2.0
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="login-right">
        {/* Theme toggle top-right */}
        <button onClick={toggleTheme} className="login-theme-btn" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}>
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="10" cy="10" r="4"/>
              <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M17.5 12A7.5 7.5 0 0 1 8 2.5a7.5 7.5 0 1 0 9.5 9.5z"/>
            </svg>
          )}
          {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
        </button>

        <div className="login-form-card">
          <div className="login-form-header">
            <h1 className="login-form-title">Connexion</h1>
            <p className="login-form-subtitle">Accédez à votre espace de gestion</p>
          </div>

          {error && (
            <div className="login-error">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="8" cy="8" r="7" stroke="var(--color-danger)" strokeWidth="1.5"/>
                <path d="M8 5v3" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="var(--color-danger)"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-form-group">
              <label htmlFor="email" className="login-label">Adresse e-mail</label>
              <input
                id="email"
                type="email"
                className="login-input"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="login-form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <label htmlFor="password" className="login-label" style={{ marginBottom: 0 }}>Mot de passe</label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: '0.78rem', padding: 0, fontFamily: 'inherit' }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  className="login-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
                  tabIndex={-1}
                >
                  {showPwd ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="login-submit"
              style={{ opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? (
                <span className="login-dots">
                  <span className="login-dot" style={{ animationDelay: '0ms' }} />
                  <span className="login-dot" style={{ animationDelay: '150ms' }} />
                  <span className="login-dot" style={{ animationDelay: '300ms' }} />
                </span>
              ) : "Se connecter"}
            </button>
          </form>

          <div className="login-separator">
            <div className="login-sep-line" />
            <span className="login-sep-text">comptes de test</span>
            <div className="login-sep-line" />
          </div>

          <div className="login-test-accounts">
            {[
              { role: "Manager", email: "manager@test.com" },
              { role: "Commercial", email: "commercial@test.com" },
            ].map(({ role, email: e }) => (
              <button
                key={role}
                type="button"
                className="login-test-btn"
                onClick={() => { setEmail(e); setPassword("password123"); }}
              >
                <span className="login-test-role">{role}</span>
                <span className="login-test-email">{e}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
