import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      navigate("/dashboard");
    } else {
      setError(result.error || "Email ou mot de passe incorrect");
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "var(--spacing-lg)",
      }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          maxWidth: "420px",
          width: "100%",
          padding: "var(--spacing-xl)",
        }}
      >
        {/* Logo & Title */}
        <div style={{ textAlign: "center", marginBottom: "var(--spacing-xl)" }}>
          <div
            style={{
              fontSize: "3rem",
              marginBottom: "var(--spacing-md)",
            }}
          >
            🏗️
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "var(--spacing-xs)",
            }}
          >
            LotisPro
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Connectez-vous pour gérer vos lots
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div
            style={{
              padding: "var(--spacing-md)",
              background: "#fee",
              border: "1px solid #fcc",
              borderRadius: "var(--radius-md)",
              color: "#c33",
              marginBottom: "var(--spacing-lg)",
              fontSize: "0.9rem",
            }}
          >
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "var(--spacing-lg)" }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                marginBottom: "var(--spacing-xs)",
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              style={{
                width: "100%",
                padding: "var(--spacing-md)",
                fontSize: "1rem",
              }}
            />
          </div>

          <div style={{ marginBottom: "var(--spacing-xl)" }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                marginBottom: "var(--spacing-xs)",
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "var(--spacing-md)",
                fontSize: "1rem",
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: "100%",
              padding: "var(--spacing-md)",
              fontSize: "1rem",
              fontWeight: 600,
              background: loading
                ? "var(--bg-tertiary)"
                : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        {/* Footer Info */}
        <div
          style={{
            marginTop: "var(--spacing-xl)",
            paddingTop: "var(--spacing-lg)",
            borderTop: "1px solid var(--bg-tertiary)",
            textAlign: "center",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Comptes de test disponibles :
          </p>
          <div
            style={{
              marginTop: "var(--spacing-sm)",
              fontSize: "0.8rem",
              color: "var(--text-muted)",
            }}
          >
            <div>Manager : manager@test.com</div>
            <div>Commercial : commercial@test.com</div>
            <div>Client : client@test.com</div>
            <div style={{ marginTop: "var(--spacing-xs)", fontStyle: "italic" }}>
              Mot de passe : password123
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
