import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiGet, apiDelete } from '../utils/api';
import { formatPrice, formatDate, formatCompactPrice } from '../utils/formatters';
import CreateProjectModal from './CreateProjectModal';
import UploadGeojsonModal from './UploadGeojsonModal';
import AssignCommercialsModal from './AssignCommercialsModal';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

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

  const handleDeleteProject = async (projectId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce projet ?')) {
      return;
    }

    try {
      await apiDelete(`/api/projects/${projectId}`);
      await loadProjects();
      toast.success('Projet supprimé avec succès');
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la suppression du projet');
    }
  };

  const handleUploadGeojson = (project) => {
    setSelectedProject(project);
    setShowUploadModal(true);
  };

  const handleAssignCommercials = (project) => {
    setSelectedProject(project);
    setShowAssignModal(true);
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

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="projects-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestion des Projets</h1>
          <p className="page-subtitle">
            {projects.length} projet{projects.length > 1 ? 's' : ''} en cours
          </p>
        </div>
        {isManager() && (
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + Nouveau projet
          </button>
        )}
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="section-card">
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <div className="empty-state-title">Aucun projet</div>
            <div className="empty-state-description">
              Créez votre premier projet pour commencer à gérer vos lots.
            </div>
            {isManager() && (
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                + Créer un projet
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => {
            const tauxVente = project.total_lots > 0
              ? ((project.sold_lots / project.total_lots) * 100).toFixed(1)
              : 0;

            return (
              <div
                key={project.id}
                className="project-card"
                onClick={() => navigate(`/projects/${project.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="project-card-header">
                  <div>
                    <h3 className="project-card-title">{project.name}</h3>
                    <p className="project-card-subtitle">
                      {project.description || 'Aucune description'}
                    </p>
                  </div>
                  <span
                    className={`visibility-badge ${project.visibility}`}
                    title={project.visibility === 'public' ? 'Visible par les clients' : 'Privé'}
                  >
                    {project.visibility === 'public' ? '🌐 Public' : '🔒 Privé'}
                  </span>
                </div>

                {/* Mini KPIs */}
                <div className="project-kpis">
                  <div className="project-kpi">
                    <div className="project-kpi-icon">📦</div>
                    <div>
                      <div className="project-kpi-value">{project.total_lots}</div>
                      <div className="project-kpi-label">Total lots</div>
                    </div>
                  </div>

                  <div className="project-kpi">
                    <div className="project-kpi-icon sold">✅</div>
                    <div>
                      <div className="project-kpi-value">{project.sold_lots}</div>
                      <div className="project-kpi-label">Vendus</div>
                    </div>
                  </div>

                  <div className="project-kpi">
                    <div className="project-kpi-icon chart">📊</div>
                    <div>
                      <div className="project-kpi-value">{tauxVente}%</div>
                      <div className="project-kpi-label">Taux vente</div>
                    </div>
                  </div>

                  {project.ca_objectif && (
                    <div className="project-kpi">
                      <div className="project-kpi-icon money">💰</div>
                      <div>
                        <div className="project-kpi-value" style={{ fontSize: '0.9rem' }}>
                          {formatCompactPrice(project.ca_objectif)}
                        </div>
                        <div className="project-kpi-label">Objectif CA</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Project Info */}
                <div className="project-info">
                  <div className="project-info-item">
                    <span className="text-muted">Créé le:</span>
                    <span>{formatDate(project.created_at)}</span>
                  </div>
                  <div className="project-info-item">
                    <span className="text-muted">Dernière MAJ:</span>
                    <span>{formatDate(project.updated_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                {isManager() && (
                  <div className="project-card-actions">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUploadGeojson(project);
                      }}
                      title="Uploader un fichier GeoJSON"
                    >
                      📤 Upload GeoJSON
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAssignCommercials(project);
                      }}
                      title="Assigner des commerciaux"
                    >
                      👥 Commerciaux
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      title="Supprimer le projet"
                    >
                      🗑️
                    </button>
                  </div>
                )}
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

      {showUploadModal && selectedProject && (
        <UploadGeojsonModal
          project={selectedProject}
          onClose={() => {
            setShowUploadModal(false);
            setSelectedProject(null);
          }}
          onUploaded={handleGeojsonUploaded}
        />
      )}

      {showAssignModal && selectedProject && (
        <AssignCommercialsModal
          project={selectedProject}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedProject(null);
          }}
          onAssigned={handleCommercialsAssigned}
        />
      )}
    </div>
  );
}
