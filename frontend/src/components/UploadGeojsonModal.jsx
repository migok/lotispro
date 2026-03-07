import { useState } from 'react';
import { API_BASE_URL } from '../utils/config';

export default function UploadGeojsonModal({ project, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setError('');
    setResult(null);

    if (!selectedFile) {
      setFile(null);
      return;
    }

    // Validate file extension
    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith('.geojson') && !fileName.endsWith('.json')) {
      setError('Le fichier doit être au format .geojson ou .json');
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!file) {
      setError('Veuillez sélectionner un fichier GeoJSON');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${project.id}/upload-geojson-file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de l\'upload');
      }

      const data = await response.json();
      setResult(data);

      // Auto-close after success (with delay)
      setTimeout(() => {
        onUploaded();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'upload du fichier');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload GeoJSON</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="info-box" style={{ marginBottom: 'var(--spacing-md)' }}>
              <strong>Projet:</strong> {project.name}
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                {error}
              </div>
            )}

            {result && (
              <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div>
                  <strong>✓ Upload réussi!</strong>
                </div>
                <div style={{ marginTop: 'var(--spacing-xs)' }}>
                  {result.lots_created} lot(s) créé(s) avec succès
                </div>
                {result.errors && result.errors.length > 0 && (
                  <div style={{ marginTop: 'var(--spacing-xs)', color: 'var(--warning)' }}>
                    Attention: {result.errors.length} erreur(s) lors de l'import
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                Fichier GeoJSON <span className="text-danger">*</span>
              </label>
              <input
                type="file"
                accept=".geojson,.json"
                onChange={handleFileChange}
                className="form-input"
                disabled={loading || result}
              />
              <p className="form-help">
                Formats acceptés: .geojson, .json
              </p>
            </div>

            {file && (
              <div className="info-box">
                <div className="flex items-center gap-sm">
                  <span>📄</span>
                  <div>
                    <div className="font-semibold">{file.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                      {(file.size / 1024).toFixed(2)} KB
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="info-box" style={{ marginTop: 'var(--spacing-md)' }}>
              <h4 style={{ marginBottom: 'var(--spacing-xs)', fontSize: '0.9rem' }}>
                ℹ️ Format attendu:
              </h4>
              <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', paddingLeft: 'var(--spacing-md)' }}>
                <li>Le fichier doit être un FeatureCollection</li>
                <li>Chaque feature représente un lot (polygone)</li>
                <li>Propriétés optionnelles: lot_id, parcelid, Shape_Area, zone, price</li>
                <li>Les lots seront automatiquement créés dans le projet</li>
              </ul>
            </div>

            {result && result.errors && result.errors.length > 0 && (
              <div style={{ marginTop: 'var(--spacing-md)' }}>
                <h4 style={{ marginBottom: 'var(--spacing-xs)', fontSize: '0.9rem', color: 'var(--warning)' }}>
                  ⚠️ Erreurs détectées:
                </h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.85rem' }}>
                  {result.errors.map((err, index) => (
                    <div key={index} style={{ padding: 'var(--spacing-xs)', borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <strong>Lot {err.lot_numero}:</strong> {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              {result ? 'Fermer' : 'Annuler'}
            </button>
            {!result && (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !file}
              >
                {loading ? 'Upload en cours...' : 'Uploader'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
