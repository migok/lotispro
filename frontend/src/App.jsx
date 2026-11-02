import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";
import "./styles/shell.css";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from './components/ui/dialog';
import AccountMenu from './components/AccountMenu';
import { useTheme } from "./hooks/useTheme";

// Import contexts
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/authHooks";
import { ToastProvider } from "./contexts/ToastContext";

// Import components
import ClientsPage from "./components/ClientsPage";
import ClientDetailPage from "./components/ClientDetailPage";
import CommercialsPage from "./components/CommercialsPage";
import ManagersPage from "./components/ManagersPage";
import Login from "./components/Login";
import SetPassword from "./components/SetPassword";
import ForgotPassword from "./components/ForgotPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import ProjectsPage from "./components/ProjectsPage";
import ProjectDetailPage from "./components/ProjectDetailPage";
import LandingPage from "./components/LandingPage";
import ContactPage from "./components/ContactPage";
import GlobalDashboard from "./components/GlobalDashboard";

// Dashboard icon
const IconDashboard = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="7" height="9" rx="1"/>
    <rect x="11" y="2" width="7" height="5" rx="1"/>
    <rect x="2" y="13" width="7" height="5" rx="1"/>
    <rect x="11" y="9" width="7" height="9" rx="1"/>
  </svg>
);

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

// Navigation items with role-based access
const NAV_ITEMS = [
  {
    id: "dashboard",
    path: "/app/dashboard",
    label: "Tableau de bord",
    Icon: IconDashboard,
    allowedRoles: ["manager", "commercial"]
  },
  {
    id: "projects",
    path: "/app/projects",
    label: "Projets",
    Icon: IconProjects,
    allowedRoles: ["manager", "commercial"]
  },
  {
    id: "clients",
    path: "/app/clients",
    label: "Clients",
    Icon: IconClients,
    allowedRoles: ["manager", "commercial"]
  },
  {
    id: "commerciaux",
    path: "/app/commerciaux",
    label: "Commerciaux",
    Icon: IconCommerciaux,
    allowedRoles: ["manager"]
  },
  {
    id: "managers",
    path: "/app/managers",
    label: "Gestionnaires",
    Icon: IconManagers,
    allowedRoles: ["manager"]
  },
];

export function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const currentPage = location.pathname.split('/')[2] || 'dashboard';
  const handleLogout = () => { logout(); navigate('/'); };
  const navigation = (close) => <>
    <nav className="sidebar-nav" aria-label="Rubriques">
      {NAV_ITEMS.filter((item) => item.allowedRoles.includes(user?.role)).map((item) => <Link
        key={item.id} to={item.path} className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
        aria-current={currentPage === item.id ? 'page' : undefined} onClick={close}>
        <item.Icon /><span className="nav-label">{item.label}</span>
      </Link>)}
    </nav>
    <AccountMenu user={user} theme={theme} toggleTheme={toggleTheme} onLogout={handleLogout} />
  </>;
  return (
    <div className={`app-container app-shell${sidebarCollapsed ? ' shell-collapsed' : ''}`}>
      <a className="shell-skip-link" href="#main-content">Aller au contenu</a>
      <button type="button" className="shell-sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? 'Afficher la navigation' : 'Masquer la navigation'} aria-expanded={!sidebarCollapsed}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18" /></svg>
      </button>
      {!sidebarCollapsed && <aside className="sidebar shell-sidebar" aria-label="Navigation principale">
        <div className="sidebar-header"><Link className="sidebar-logo" to="/app/dashboard" aria-label="LotisPro, tableau de bord"><LogoIcon /><span>LotisPro</span></Link></div>
        {navigation()}
      </aside>}
      <div className="shell-mobile-bar">
        <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <DialogTrigger asChild><button type="button" className="shell-mobile-toggle" aria-label="Ouvrir le menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button></DialogTrigger>
          <DialogContent className="shell-mobile-panel">
            <DialogTitle>Navigation</DialogTitle><DialogDescription className="ui-sr-only">Rubriques et compte LotisPro</DialogDescription>
            {navigation(() => setMobileMenuOpen(false))}
          </DialogContent>
        </Dialog>
        <span>LotisPro</span>
      </div>
      <main id="main-content" tabIndex={-1} className="main-content shell-main">
        <Routes>
          <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["manager", "commercial"]}>
                <GlobalDashboard />
              </ProtectedRoute>
            }
          />
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
      <Route path="/" element={<LandingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/app/*" element={<AppContent />} />
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
