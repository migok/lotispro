import { useState, useRef } from 'react';
import { apiUploadFile } from '../utils/api';

const IconImage = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <path d="M21 15l-5-5L5 21"/>
  </svg>
);

const IconUpload = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3v9M7 6l3-3 3 3"/>
    <path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2"/>
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h14M7 5V3h6v2M6 5v11a1 1 0 001 1h6a1 1 0 001-1V5"/>
  </svg>
);

export default function UploadProjectImageModal({ project, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(project.image_url || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(f.type)) {
      setError('Format non supporté. Utilisez JPG, PNG, WebP ou GIF.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Fichier trop grand. Maximum 5 Mo.');
      return;
    }
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const updated = await apiUploadFile(`/api/projects/${project.id}/upload-image`, file);
      onUploaded(updated);
    } catch (err) {
      setError(err.message || "Erreur lors de l'upload");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2 className="modal-title">Image du projet</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          {error && <div className="error-box">{error}</div>}

          {/* Drop zone */}
          <div
            className={`img-upload-zone ${dragOver ? 'img-upload-zone--over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {preview ? (
              <img src={preview} alt="Aperçu" className="img-upload-preview" />
            ) : (
              <div className="img-upload-placeholder">
                <IconImage />
                <p>Glissez une image ici<br /><span>ou cliquez pour parcourir</span></p>
                <p className="img-upload-hint">JPG · PNG · WebP · GIF — max 5 Mo</p>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {preview && (
            <button
              type="button"
              className="btn-text-danger"
              style={{ alignSelf: 'flex-start', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => { setFile(null); setPreview(null); }}
            >
              <IconTrash /> Supprimer l'aperçu
            </button>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!file || loading}
          >
            {loading ? 'Upload…' : <><IconUpload /> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  );
}
