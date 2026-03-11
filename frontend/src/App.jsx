import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";
import { useTheme } from "./hooks/useTheme";

// Import contexts
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";

// Import components
import ClientsPage from "./components/ClientsPage";
import ClientDetailPage from "./components/ClientDetailPage";
import CommercialsPage from "./components/CommercialsPage";
import ManagersPage from "./components/ManagersPage";
import Login from "./components/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import ProjectsPage from "./components/ProjectsPage";
import ProjectDetailPage from "./components/ProjectDetailPage";

// Logo — location pin with lot grid (real estate concept)
const LogoIcon = ({ size = 28 }) => (
  <svg width={size} height={Math.round(size * 1.14)} viewBox="0 0 28 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Pin body */}
    <path
      d="M14 1C7.925 1 3 5.925 3 12c0 8.25 11 19 11 19S25 20.25 25 12C25 5.925 20.075 1 14 1z"
      fill="var(--color-primary)"
      fillOpacity="0.12"
      stroke="var(--color-primary)"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* 2×2 lot grid — bird's-eye view of parcels */}
    <rect x="8.5" y="7" width="5" height="3.5" rx="0.75" fill="var(--color-primary)" fillOpacity="0.9"/>
    <rect x="15" y="7" width="5" height="3.5" rx="0.75" fill="var(--color-primary)" fillOpacity="0.9"/>
    <rect x="8.5" y="11.5" width="5" height="3.5" rx="0.75" fill="var(--color-primary)" fillOpacity="0.55"/>
    <rect x="15" y="11.5" width="5" height="3.5" rx="0.75" fill="var(--color-primary)" fillOpacity="0.55"/>
  </svg>
);

// SVG Icons
const IconProjects = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="7" height="6" rx="1"/>
    <rect x="11" y="4" width="7" height="6" rx="1"/>
    <rect x="2" y="12" width="7" height="4" rx="1"/>
    <rect x="11" y="12" width="7" height="4" rx="1"/>
  </svg>
);

const IconClients = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="6" r="3"/>
    <path d="M1 17c0-3.3 2.9-6 6.5-6"/>
    <circle cx="14" cy="7" r="2.5"/>
    <path d="M19 17c0-2.8-2.2-5-5-5s-5 2.2-5 5"/>
  </svg>
);

const IconCommerciaux = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="14" height="10" rx="1"/>
    <path d="M7 7V5a3 3 0 016 0v2"/>
    <path d="M10 12v2"/>
    <circle cx="10" cy="11" r="1" fill="currentColor" stroke="none"/>
  </svg>
);

const IconManagers = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="6" r="3.5"/>
    <path d="M3 18c0-3.9 3.1-7 7-7s7 3.1 7 7"/>
    <path d="M14 3l1.5 1.5L18 2"/>
  </svg>
);

const IconLogout = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 3h4a1 1 0 011 1v12a1 1 0 01-1 1h-4"/>
    <path d="M8 14l4-4-4-4"/>
    <path d="M12 10H3"/>
  </svg>
);

// Navigation items with role-based access
const NAV_ITEMS = [
  {
    id: "projects",
    path: "/projects",
    label: "Projets",
    Icon: IconProjects,
    allowedRoles: ["manager", "commercial"]
  },
  {
    id: "clients",
    path: "/clients",
    label: "Clients",
    Icon: IconClients,
    allowedRoles: ["manager", "commercial"]
  },
  {
    id: "commerciaux",
    path: "/commerciaux",
    label: "Commerciaux",
    Icon: IconCommerciaux,
    allowedRoles: ["manager"]
  },
  {
    id: "managers",
    path: "/managers",
    label: "Managers",
    Icon: IconManagers,
    allowedRoles: ["manager"]
  },
];

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

      {/* Sidebar re-open tab (visible when collapsed) */}
      {sidebarCollapsed && (
        <button
          className="sidebar-reopen-tab"
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Afficher la sidebar"
          title="Afficher la sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-mobile-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <LogoIcon size={28} />
            <span className="sidebar-logo-text">LotisPro</span>
          </div>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Afficher la sidebar' : 'Masquer la sidebar'}
            title={sidebarCollapsed ? 'Afficher la sidebar' : 'Masquer la sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed
                ? <path d="M9 18l6-6-6-6"/>
                : <path d="M15 18l-6-6 6-6"/>}
            </svg>
          </button>
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
              <item.Icon />
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div style={{ padding: 'var(--spacing-md)', borderTop: '1px solid var(--border-subtle)' }}>
          {/* User Info */}
          {user && (
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                {user.email}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--color-primary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
                {user.role}
              </div>
            </div>
          )}

          {/* Theme Toggle */}
          <button onClick={toggleTheme} className="theme-toggle" title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
            <span>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
            <div className={`theme-toggle-track ${theme === 'light' ? 'on' : ''}`}>
              <div className="theme-toggle-thumb" />
            </div>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="nav-item"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 'var(--spacing-sm)' }}
          >
            <IconLogout />
            <span className="nav-label">Déconnexion</span>
          </button>

          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            v2.0
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${sidebarCollapsed ? 'main-content-expanded' : ''}`}>
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
          <Route
            path="/managers"
            element={
              <ProtectedRoute allowedRoles={["manager"]}>
                <ManagersPage />
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
