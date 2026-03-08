import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../hooks/useTheme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      navigate("/projects");
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
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="1" y="1" width="46" height="46" rx="6" stroke="var(--border-gold)" strokeWidth="1"/>
              <path d="M10 38L24 10L38 38" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15.5 30H32.5" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round"/>
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
              <label htmlFor="password" className="login-label">Mot de passe</label>
              <input
                id="password"
                type="password"
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
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
