import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../utils/api';

/**
 * Panel de configuration de la grille de prix par combinaison catégorielle.
 * Affiché dans l'onglet Paramètres de ProjectDetailPage (manager uniquement).
 *
 * Pour chaque combinaison (zone × type_lot × type_maison × emplacement) présente
 * dans les lots du projet, le manager saisit :
 *   - prix_m2_acte   : stable, sert de base au prix de vente figé à la réservation
 *   - prix_m2_catalogue : modifiable, recalcule le prix catalogue des lots en création/disponible
 */
export default function LotPricingConfigPanel({ projectId }) {
  const [configs, setConfigs] = useState([]);
  const [unconfigured, setUnconfigured] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/api/projects/${projectId}/pricing-configs`);
      setConfigs(data.configs || []);
      setUnconfigured(data.unconfigured_combinations || []);

      const initialEdits = {};
      (data.configs || []).forEach((cfg) => {
        const key = comboKey(cfg);
        initialEdits[key] = {
          prix_m2_acte: cfg.prix_m2_acte,
          prix_m2_catalogue: cfg.prix_m2_catalogue,
        };
      });
      (data.unconfigured_combinations || []).forEach((combo) => {
        const key = comboKey(combo);
        if (!initialEdits[key]) {
          initialEdits[key] = { prix_m2_acte: '', prix_m2_catalogue: '' };
        }
      });
      setEdits(initialEdits);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement de la grille de prix');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const comboKey = (row) =>
    `${row.zone ?? ''}|${row.type_lot ?? ''}|${row.type_maison ?? ''}|${row.emplacement ?? ''}`;

  const allRows = [
    ...configs,
    ...unconfigured.filter((u) => !configs.some((c) => comboKey(c) === comboKey(u))),
  ];

  const handleChange = (key, field) => (e) => {
    setEdits((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: e.target.value },
    }));
  };

  const handleApply = async () => {
    setError('');
    setSuccess('');
    setApplying(true);
    try {
      const result = await apiPost(`/api/projects/${projectId}/pricing-configs/apply`, {});
      const { lots_updated, lots_activated } = result;
      setSuccess(
        `Grille appliquée — ${lots_updated} lot${lots_updated > 1 ? 's' : ''} mis à jour` +
        (lots_activated > 0 ? `, ${lots_activated} passé${lots_activated > 1 ? 's' : ''} en Disponible` : '')
      );
      await load();
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'application de la grille');
    } finally {
      setApplying(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    const configsPayload = allRows
      .map((row) => {
        const key = comboKey(row);
        const edit = edits[key] || {};
        const acte = parseFloat(edit.prix_m2_acte);
        const catalogue = parseFloat(edit.prix_m2_catalogue);
        if (!acte || !catalogue || acte <= 0 || catalogue <= 0) return null;
        return {
          zone: row.zone ?? null,
          type_lot: row.type_lot ?? null,
          type_maison: row.type_maison ?? null,
          emplacement: row.emplacement ?? null,
          prix_m2_acte: acte,
          prix_m2_catalogue: catalogue,
        };
      })
      .filter(Boolean);

    if (configsPayload.length === 0) {
      setError('Veuillez saisir au moins une combinaison avec des prix valides (> 0).');
      setSaving(false);
      return;
    }

    try {
      const result = await apiPost(
        `/api/projects/${projectId}/pricing-configs/bulk`,
        { configs: configsPayload }
      );
      setConfigs(result.configs || []);
      setUnconfigured(result.unconfigured_combinations || []);
      const totalAffected = (result.configs || []).reduce((sum, c) => sum + (c.lots_affected || 0), 0);
      setSuccess(
        `Grille mise à jour — ${configsPayload.length} combinaison${configsPayload.length > 1 ? 's' : ''} enregistrée${configsPayload.length > 1 ? 's' : ''}` +
        (totalAffected > 0 ? `, ${totalAffected} lot${totalAffected > 1 ? 's' : ''} recalculé${totalAffected > 1 ? 's' : ''}` : '')
      );
    } catch (err) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const ComboCell = ({ row, isConfigured }) => {
    const hasAny = row.zone || row.type_lot || row.type_maison || row.emplacement;
    if (!hasAny) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Combinaison vide</span>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {row.zone && (
          <span style={chipStyles.zone}>
            <span style={chipStyles.zoneLabel}>Z</span>
            {row.zone}
          </span>
        )}
        {row.type_lot && <span style={chipStyles.attr}>{row.type_lot}</span>}
        {row.type_maison && <span style={chipStyles.attr}>{row.type_maison}</span>}
        {row.emplacement && <span style={chipStyles.attr}>{row.emplacement}</span>}
        {!isConfigured && <span style={chipStyles.warning}>Non configuré</span>}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="section-card" style={{ marginTop: 'var(--spacing-lg)' }}>
        <h3>Grille de Prix</h3>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="section-card" style={{ marginTop: 'var(--spacing-lg)' }}>
      <h3>Grille de Prix</h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
        Configurez le <strong>prix au m² acte</strong> (stable, base du prix de vente figé à la réservation)
        et le <strong>prix au m² catalogue</strong> (affiché aux clients, modifiable)
        pour chaque combinaison catégorielle.
        Modifier le prix catalogue met à jour automatiquement les lots en <strong>Création</strong> et <strong>Disponible</strong>.
      </p>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-md)' }}>
          {success}
        </div>
      )}

      {allRows.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--spacing-lg) 0' }}>
          Aucune combinaison détectée dans les lots de ce projet.
          Importez des lots avec des métadonnées (zone, type, emplacement) pour configurer les prix.
        </div>
      ) : (
        <form onSubmit={handleSave}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, borderRadius: '6px 0 0 0' }}>Combinaison</th>
                  <th style={{ ...thStyle, width: 150 }}>
                    Prix/m² acte
                    <span style={{ display: 'block', fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>stable · figé à la réservation</span>
                  </th>
                  <th style={{ ...thStyle, width: 165 }}>
                    Prix/m² catalogue
                    <span style={{ display: 'block', fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>affiché · recalcule le prix lot</span>
                  </th>
                  <th style={{ ...thStyle, width: 110, textAlign: 'center', borderRadius: '0 6px 0 0' }}>Lots</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row) => {
                  const key = comboKey(row);
                  const edit = edits[key] || {};
                  const isConfigured = configs.some((c) => comboKey(c) === key);
                  const lotsAffected = isConfigured
                    ? (configs.find((c) => comboKey(c) === key)?.lots_affected ?? 0)
                    : (row.lot_count ?? 0);

                  return (
                    <tr key={key} style={rowStyle(isConfigured)}>
                      <td style={tdStyle}>
                        <ComboCell row={row} isConfigured={isConfigured} />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="form-input num"
                          style={{ maxWidth: 120 }}
                          value={edit.prix_m2_acte ?? ''}
                          onChange={handleChange(key, 'prix_m2_acte')}
                          placeholder="0.00"
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="form-input num"
                          style={{ maxWidth: 130 }}
                          value={edit.prix_m2_catalogue ?? ''}
                          onChange={handleChange(key, 'prix_m2_catalogue')}
                          placeholder="0.00"
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {lotsAffected > 0 ? (
                          <span className="badge badge-green">{lotsAffected}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)', flexWrap: 'wrap' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || applying}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer la grille de prix'}
            </button>
            {configs.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving || applying}
                onClick={handleApply}
                title="Applique la grille aux lots existants en Création/Disponible (utile si les lots ont été créés avant la grille)"
              >
                {applying ? 'Application...' : 'Appliquer aux lots existants'}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

const thStyle = {
  textAlign: 'left',
  padding: '8px 14px',
  fontWeight: 600,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  background: 'var(--bg-tertiary)',
};

const tdStyle = {
  padding: '12px 14px',
  verticalAlign: 'middle',
};

const rowStyle = (isConfigured) => ({
  borderBottom: '1px solid var(--border-subtle)',
  background: isConfigured ? 'transparent' : 'rgba(245, 158, 11, 0.03)',
  transition: 'background 0.15s',
});

const chipStyles = {
  zone: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px 2px 5px',
    borderRadius: 4,
    fontSize: '0.75rem',
    fontWeight: 600,
    background: 'rgba(212, 151, 58, 0.15)',
    color: 'var(--color-primary)',
    border: '1px solid rgba(212, 151, 58, 0.25)',
  },
  zoneLabel: {
    fontSize: '0.6rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: 'rgba(212, 151, 58, 0.3)',
    color: 'var(--color-primary)',
    borderRadius: 2,
    padding: '0 3px',
    lineHeight: 1.6,
  },
  attr: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: '0.75rem',
    fontWeight: 500,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  },
  warning: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: '0.7rem',
    fontWeight: 600,
    background: 'rgba(245, 158, 11, 0.12)',
    color: '#f59e0b',
    border: '1px solid rgba(245, 158, 11, 0.25)',
  },
};
