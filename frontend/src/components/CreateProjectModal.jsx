import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
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
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent className="global-create-project" onEscapeKeyDown={(event) => { if (loading) event.preventDefault(); }} onPointerDownOutside={(event) => { if (loading) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Créer un nouveau projet</DialogTitle>
          <DialogDescription>Les champs marqués d’un astérisque sont obligatoires.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body">
            {error && (
              <div role="alert" className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="project-name">
                Nom du projet <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                id="project-name"
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
              <label className="form-label" htmlFor="project-description">Description</label>
              <textarea
                id="project-description"
                name="description"
                className="form-input"
                value={formData.description}
                onChange={handleChange}
                placeholder="Description du projet..."
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="project-visibility">Visibilité</label>
              <select
                id="project-visibility"
                name="visibility"
                className="form-input"
                value={formData.visibility}
                onChange={handleChange}
              >
                <option value="private">Privé (visible uniquement par les managers et commerciaux assignés)</option>
                <option value="public">Public (visible par tous les clients)</option>
              </select>
              <p className="form-help">
                Les projets publics sont visibles par les clients sur leur interface.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="project-ca_objectif">Objectif de CA (MAD)</label>
              <input
                type="number"
                id="project-ca_objectif"
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
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={loading}
            >
              {loading ? 'Création...' : 'Créer le projet'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
