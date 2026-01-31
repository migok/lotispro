import { useState } from 'react';
import { apiPost } from '../utils/api';

export default function CreateProjectModal({ onClose, onCreated }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    visibility: 'private',
    ca_objectif: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Le nom du projet est requis');
      return;
    }

    setLoading(true);

    try {
      // Prepare data
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        visibility: formData.visibility,
        ca_objectif: formData.ca_objectif ? parseFloat(formData.ca_objectif) : null,
      };

      await apiPost('/api/projects', payload);
      onCreated();
    } catch (err) {
      setError(err.message || 'Erreur lors de la création du projet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Créer un nouveau projet</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                Nom du projet <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ex: Lotissement Al Amal"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                name="description"
                className="form-input"
                value={formData.description}
                onChange={handleChange}
                placeholder="Description du projet..."
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Visibilité</label>
              <select
                name="visibility"
                className="form-input"
                value={formData.visibility}
                onChange={handleChange}
              >
                <option value="private">🔒 Privé (visible uniquement par les managers et commerciaux assignés)</option>
                <option value="public">🌐 Public (visible par tous les clients)</option>
              </select>
              <p className="form-help">
                Les projets publics sont visibles par les clients sur leur interface.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Objectif de CA (MAD)</label>
              <input
                type="number"
                name="ca_objectif"
                className="form-input"
                value={formData.ca_objectif}
                onChange={handleChange}
                placeholder="Ex: 5000000"
                min="0"
                step="1000"
              />
              <p className="form-help">
                Objectif de chiffre d'affaires pour ce projet (optionnel).
              </p>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Création...' : 'Créer le projet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
