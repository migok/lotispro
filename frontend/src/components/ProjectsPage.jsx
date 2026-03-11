import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiGet, apiDelete } from '../utils/api';
import { formatDate, formatCompactPrice } from '../utils/formatters';
import CreateProjectModal from './CreateProjectModal';
import UploadGeojsonModal from './UploadGeojsonModal';
import AssignCommercialsModal from './AssignCommercialsModal';
import UploadProjectImageModal from './UploadProjectImageModal';

const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10L13 13"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
  </svg>
);
const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/>
  </svg>
);

const IconBuilding = () => (
  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="16" width="22" height="32" rx="1"/>
    <rect x="28" y="22" width="14" height="26" rx="1"/>
    <path d="M6 22h22M6 28h22M6 34h22M6 40h22"/>
    <rect x="10" y="19" width="5" height="5" rx="0.5"/>
    <rect x="19" y="19" width="5" height="5" rx="0.5"/>
    <rect x="32" y="26" width="4" height="4" rx="0.5"/>
    <rect x="32" y="33" width="4" height="4" rx="0.5"/>
    <rect x="32" y="40" width="4" height="4" rx="0.5"/>
    <path d="M2 48h48"/>
    <path d="M20 48V42"/>
    <path d="M34 48V40"/>
  </svg>
);

const IconArrowRight = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10h12M11 5l5 5-5 5"/>
  </svg>
);

const IconUpload = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3v9M7 6l3-3 3 3"/>
    <path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2"/>
  </svg>
);

const IconUsers = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="6" r="3"/>
    <path d="M1 17c0-3 2.5-5 6-5"/>
    <circle cx="14" cy="7" r="2.5"/>
    <path d="M19 17c0-2.5-2-4.5-5-4.5s-5 2-5 4.5"/>
  </svg>
);

const IconImage = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="16" height="16" rx="2"/>
    <circle cx="7" cy="7" r="1.5"/>
    <path d="M18 13l-4-4L6 18"/>
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h14M7 5V3h6v2M6 5v11a1 1 0 001 1h6a1 1 0 001-1V5"/>
  </svg>
);

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/projects');
      setProjects(data);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/projects/${projectToDelete.id}`);
      setProjectToDelete(null);
      await loadProjects();
      toast.success('Projet supprimé avec succès');
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la suppression du projet');
    } finally {
      setDeleting(false);
    }
  };

  const handleProjectCreated = () => {
    setShowCreateModal(false);
    loadProjects();
  };

  const handleGeojsonUploaded = () => {
    setShowUploadModal(false);
    setSelectedProject(null);
    loadProjects();
  };

  const handleCommercialsAssigned = () => {
    setShowAssignModal(false);
    setSelectedProject(null);
  };

  const handleImageUploaded = (updatedProject) => {
    setProjects((prev) => prev.map((p) => p.id === updatedProject.id ? updatedProject : p));
    setShowImageModal(false);
    setSelectedProject(null);
    toast.success('Image mise à jour');
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="cp-page page-container">

      {/* ── Header ── */}
      <div className="cp-header">
        <div>
          <p className="page-eyebrow">Immobilier</p>
          <h1 className="cp-title">Projets</h1>
          <p className="cp-subtitle">
            {projects.length} projet{projects.length !== 1 ? 's' : ''} en cours
          </p>
        </div>
        {isManager() && (
          <div className="cp-header-actions">
            <button className="cp-btn-primary" onClick={() => setShowCreateModal(true)}>
              <IconPlus /> Nouveau projet
            </button>
          </div>
        )}
      </div>

      {/* ── Search ── */}
      <div className="search-bar" style={{ marginBottom: 'var(--spacing-md)' }}>
        <IconSearch />
        <input
          placeholder="Rechercher un projet (nom, description)…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}
          >
            <IconX />
          </button>
        )}
      </div>

      {/* ── Projects Grid ── */}
      {loading ? (
        <div className="loading-state">Chargement…</div>
      ) : filteredProjects.length === 0 ? (
        <div className="empty-state">
          <p>
            {searchQuery
              ? `Aucun projet ne correspond à "${searchQuery}"`
              : 'Aucun projet enregistré.'}
          </p>
          {!searchQuery && isManager() && (
            <button className="cp-btn-primary" onClick={() => setShowCreateModal(true)}>
              <IconPlus /> Créer le premier projet
            </button>
          )}
        </div>
      ) : (
        <div className="projects-grid">
          {filteredProjects.map((project) => {
            const available = project.total_lots - project.sold_lots - (project.reserved_lots || 0);

            return (
              <div
                key={project.id}
                className="project-card"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                {/* Cover */}
                <div className="project-card-cover">
                  {project.image_url ? (
                    <img
                      src={project.image_url}
                      alt={project.name}
                      className="project-card-cover-img"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="project-card-cover-fallback"
                    style={{ display: project.image_url ? 'none' : 'flex' }}
                  >
                    <div className="project-card-cover-bg" aria-hidden="true" />
                    <div className="project-card-cover-icon">
                      <IconBuilding />
                    </div>
                  </div>
                  <span className={`visibility-badge ${project.visibility}`}>
                    {project.visibility === 'public' ? 'Public' : 'Privé'}
                  </span>
                </div>

                {/* Card body */}
                <div className="project-card-body">
                  <div>
                    <h3 className="project-card-title">{project.name}</h3>
                    <p className="project-card-subtitle">
                      {project.description || 'Aucune description'}
                    </p>
                  </div>

                  {/* Stat row — colored numbers inspired by PromoteImmo */}
                  <div className="project-stat-row">
                    <div className="project-stat">
                      <span className="project-stat-value">{project.total_lots}</span>
                      <span className="project-stat-label">total</span>
                    </div>
                    <div className="project-stat-divider" />
                    <div className="project-stat">
                      <span className="project-stat-value" style={{ color: 'var(--color-available)' }}>
                        {available < 0 ? 0 : available}
                      </span>
                      <span className="project-stat-label">dispos</span>
                    </div>
                    <div className="project-stat-divider" />
                    <div className="project-stat">
                      <span className="project-stat-value" style={{ color: 'var(--color-reserved)' }}>
                        {project.reserved_lots || 0}
                      </span>
                      <span className="project-stat-label">réservés</span>
                    </div>
                    <div className="project-stat-divider" />
                    <div className="project-stat">
                      <span className="project-stat-value" style={{ color: 'var(--color-sold)' }}>
                        {project.sold_lots}
                      </span>
                      <span className="project-stat-label">vendus</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="project-card-footer">
                    {isManager() ? (
                      <div className="project-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="card-action-btn"
                          onClick={(e) => { e.stopPropagation(); setSelectedProject(project); setShowImageModal(true); }}
                          title="Image du projet"
                        >
                          <IconImage />
                        </button>
                        <button
                          className="card-action-btn"
                          onClick={(e) => { e.stopPropagation(); setSelectedProject(project); setShowUploadModal(true); }}
                          title="Upload GeoJSON"
                        >
                          <IconUpload />
                        </button>
                        <button
                          className="card-action-btn"
                          onClick={(e) => { e.stopPropagation(); setSelectedProject(project); setShowAssignModal(true); }}
                          title="Assigner commerciaux"
                        >
                          <IconUsers />
                        </button>
                        <button
                          className="card-action-btn danger"
                          onClick={(e) => { e.stopPropagation(); setProjectToDelete(project); }}
                          title="Supprimer"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {formatDate(project.created_at)}
                      </span>
                    )}
                    <span className="project-card-voir">
                      Voir le projet <IconArrowRight />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleProjectCreated}
        />
      )}

      {showImageModal && selectedProject && (
        <UploadProjectImageModal
          project={selectedProject}
          onClose={() => { setShowImageModal(false); setSelectedProject(null); }}
          onUploaded={handleImageUploaded}
        />
      )}

      {showUploadModal && selectedProject && (
        <UploadGeojsonModal
          project={selectedProject}
          onClose={() => { setShowUploadModal(false); setSelectedProject(null); }}
          onUploaded={handleGeojsonUploaded}
        />
      )}

      {showAssignModal && selectedProject && (
        <AssignCommercialsModal
          project={selectedProject}
          onClose={() => { setShowAssignModal(false); setSelectedProject(null); }}
          onAssigned={handleCommercialsAssigned}
        />
      )}

      {/* Delete Confirmation */}
      {projectToDelete && (
        <div
          className="modal-overlay"
          onClick={() => !deleting && setProjectToDelete(null)}
          style={{ backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.75)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '400px',
              background: 'var(--bg-secondary)',
              border: '1px solid rgba(224, 85, 85, 0.25)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(224,85,85,0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Red danger band at top */}
            <div style={{
              height: '3px',
              background: 'linear-gradient(90deg, transparent, #e05555 30%, #e05555 70%, transparent)',
            }} />

            {/* Icon + title */}
            <div style={{ padding: '2rem 2rem 1.25rem', textAlign: 'center' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(224, 85, 85, 0.08)',
                border: '1px solid rgba(224, 85, 85, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                boxShadow: '0 0 28px rgba(224, 85, 85, 0.12)',
              }}>
                <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="#e05555" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h14M7 5V3h6v2M6 5v11a1 1 0 001 1h6a1 1 0 001-1V5"/>
                  <path d="M9 9v4M11 9v4"/>
                </svg>
              </div>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '0.5rem',
                letterSpacing: '0.01em',
              }}>
                Supprimer le projet
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, margin: 0 }}>
                Vous êtes sur le point de supprimer
              </p>
              <p style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.15rem',
                color: 'var(--color-primary)',
                fontWeight: 600,
                margin: '0.3rem 0 0',
                letterSpacing: '0.02em',
              }}>
                "{projectToDelete.name}"
              </p>
            </div>

            {/* Warning box */}
            <div style={{
              margin: '0 1.5rem 1.5rem',
              padding: '0.75rem 1rem',
              background: 'rgba(224, 85, 85, 0.05)',
              border: '1px solid rgba(224, 85, 85, 0.15)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-start',
            }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#e05555" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                <path d="M10 2L2 17h16L10 2z"/>
                <path d="M10 9v4M10 15h.01"/>
              </svg>
              <p style={{ fontSize: '0.8rem', color: '#c0524e', lineHeight: 1.6, margin: 0 }}>
                Action <strong style={{ color: '#e05555' }}>irréversible</strong> — lots, réservations et ventes seront définitivement supprimés.
              </p>
            </div>

            {/* Footer */}
            <div style={{
              padding: '1rem 1.5rem 1.5rem',
              display: 'flex',
              gap: '0.75rem',
              borderTop: '1px solid var(--bg-tertiary)',
            }}>
              <button
                className="btn btn-ghost"
                onClick={() => setProjectToDelete(null)}
                disabled={deleting}
                style={{ flex: 1 }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '0.625rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(224,85,85,0.35)',
                  background: 'rgba(224,85,85,0.12)',
                  color: '#e05555',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  opacity: deleting ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!deleting) { e.currentTarget.style.background = 'rgba(224,85,85,0.22)'; e.currentTarget.style.borderColor = 'rgba(224,85,85,0.55)'; }}}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(224,85,85,0.12)'; e.currentTarget.style.borderColor = 'rgba(224,85,85,0.35)'; }}
              >
                {deleting ? (
                  'Suppression...'
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M3 5h14M7 5V3h6v2M6 5v11a1 1 0 001 1h6a1 1 0 001-1V5"/>
                    </svg>
                    Supprimer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
