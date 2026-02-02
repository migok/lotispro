import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";

// Import contexts
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";

// Import components
import ClientsPage from "./components/ClientsPage";
import ClientDetailPage from "./components/ClientDetailPage";
import CommercialsPage from "./components/CommercialsPage";
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
  {
    id: "commerciaux",
    path: "/commerciaux",
    label: "Commerciaux",
    icon: "👔",
    allowedRoles: ["manager"]
  },
];

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Déterminer la page actuelle depuis l'URL
  const currentPage = location.pathname.split('/')[1] || 'dashboard';

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-container">
      {/* Mobile Menu Toggle Button */}
      <button
        className="mobile-menu-toggle"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-mobile-open' : ''}`}>
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
              onClick={closeMobileMenu}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-md border-top">
          {/* User Info */}
          {user && (
            <div className="mb-md">
              <div className="text-sm text-secondary font-semibold">
                {user.name}
              </div>
              <div className="text-xs text-muted">
                {user.email}
              </div>
              <div className="text-xs text-muted mt-xs uppercase">
                {user.role}
              </div>
            </div>
          )}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="btn btn-ghost w-full text-sm p-sm mb-md"
          >
            🚪 Déconnexion
          </button>

          <div className="text-xs text-muted">
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
          <Route
            path="/commerciaux"
            element={
              <ProtectedRoute allowedRoles={["manager"]}>
                <CommercialsPage />
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

// Composant principal avec BrowserRouter, AuthProvider et ToastProvider
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
