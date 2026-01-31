import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";

// Import contexts
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Import components
import ClientsPage from "./components/ClientsPage";
import ClientDetailPage from "./components/ClientDetailPage";
import Login from "./components/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import ProjectsPage from "./components/ProjectsPage";
import ProjectDetailPage from "./components/ProjectDetailPage";

// Navigation items with role-based access
const NAV_ITEMS = [
  {
    id: "projects",
    path: "/projects",
    label: "Projets",
    icon: "📁",
    allowedRoles: ["manager", "commercial"]
  },
  {
    id: "clients",
    path: "/clients",
    label: "Clients",
    icon: "👥",
    allowedRoles: ["manager", "commercial"]
  },
];

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Déterminer la page actuelle depuis l'URL
  const currentPage = location.pathname.split('/')[1] || 'dashboard';

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span>🏗️</span>
            <span>LotisPro</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.filter(item =>
            !item.allowedRoles || item.allowedRoles.includes(user?.role)
          ).map((item) => (
            <Link
              key={item.id}
              to={item.path}
              className={`nav-item ${currentPage === item.id ? "active" : ""}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div style={{ padding: "var(--spacing-md)", borderTop: "1px solid var(--bg-tertiary)" }}>
          {/* User Info */}
          {user && (
            <div style={{ marginBottom: "var(--spacing-md)" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                {user.name}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {user.email}
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  marginTop: "var(--spacing-xs)",
                  textTransform: "uppercase",
                }}
              >
                {user.role}
              </div>
            </div>
          )}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="btn btn-ghost"
            style={{
              width: "100%",
              fontSize: "0.85rem",
              padding: "var(--spacing-sm)",
              marginBottom: "var(--spacing-md)",
            }}
          >
            🚪 Déconnexion
          </button>

          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            LotisPro v2.0
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/dashboard" element={<Navigate to="/projects" replace />} />
          <Route
            path="/projects"
            element={
              <ProtectedRoute allowedRoles={["manager", "commercial"]}>
                <ProjectsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <ProtectedRoute allowedRoles={["manager", "commercial"]}>
                <ProjectDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute allowedRoles={["manager", "commercial"]}>
                <ClientsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:clientId"
            element={
              <ProtectedRoute allowedRoles={["manager", "commercial"]}>
                <ClientDetailPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

// Wrapper component for routes
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<AppContent />} />
    </Routes>
  );
}

// Composant principal avec BrowserRouter et AuthProvider
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
