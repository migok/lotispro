import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, allowedRoles = null }) {
  const { isAuthenticated, loading, hasAnyRole, user } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "3rem",
              marginBottom: "var(--spacing-md)",
              animation: "spin 2s linear infinite",
            }}
          >
            🏘️
          </div>
          <p style={{ color: "var(--text-muted)" }}>Chargement...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Check role-based access if allowedRoles is specified
  if (allowedRoles && !hasAnyRole(allowedRoles)) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary)",
          padding: "var(--spacing-lg)",
        }}
      >
        <div
          className="section-card"
          style={{
            maxWidth: "500px",
            textAlign: "center",
            padding: "var(--spacing-xl)",
          }}
        >
          <div style={{ fontSize: "4rem", marginBottom: "var(--spacing-lg)" }}>
            🚫
          </div>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "var(--spacing-md)",
            }}
          >
            Accès refusé
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: "var(--spacing-lg)",
            }}
          >
            Vous n'avez pas les permissions nécessaires pour accéder à cette page.
          </p>
          <p
            style={{
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              marginBottom: "var(--spacing-lg)",
            }}
          >
            Votre rôle actuel : <strong>{user?.role}</strong>
            <br />
            Rôles requis : <strong>{allowedRoles.join(", ")}</strong>
          </p>
          <a href="/dashboard" className="btn btn-primary">
            Retour au Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Render children if authenticated and authorized
  return children;
}
