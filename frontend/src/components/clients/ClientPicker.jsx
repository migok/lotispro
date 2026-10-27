import { useMemo, useState } from 'react';

const stripSeparators = (s) => String(s ?? '').replace(/[\s.-]/g, '').toLowerCase();

// Moroccan numbers: +212612345678 / 00212612345678 / 0612345678 -> 612345678
const normalizePhone = (s) => stripSeparators(s).replace(/^(\+212|00212|0)/, '');

function matches(client, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((client.name || '').toLowerCase().includes(q)) return true;
  const qId = stripSeparators(q);
  if (qId && stripSeparators(client.cin).includes(qId)) return true;
  const qPhone = normalizePhone(q);
  return !!qPhone && normalizePhone(client.phone).includes(qPhone);
}

/**
 * Searchable client selector (name, CIN or phone).
 * `value` is the selected client or null; `onChange(client | null)`.
 */
export default function ClientPicker({ clients, value, onChange }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => clients.filter(c => matches(c, query)), [clients, query]);

  if (value) {
    return (
      <div className="msr-client-locked">
        <div className="msr-client-locked-name">
          {value.name}
          {value.phone ? ` · ${value.phone}` : ''}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
          Changer
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="client-picker-list"
        className="msr-input"
        placeholder="Rechercher par nom, CIN ou téléphone"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <ul id="client-picker-list" role="listbox" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, maxHeight: 180, overflowY: 'auto' }}>
        {results.length === 0 ? (
          <li style={{ padding: '6px 8px', fontSize: '0.8rem', opacity: 0.7 }}>Aucun client trouvé</li>
        ) : results.map(c => (
          <li key={c.id} role="option" aria-selected="false" tabIndex={0}
            style={{ padding: '6px 8px', cursor: 'pointer', fontSize: '0.85rem' }}
            onClick={() => { setQuery(''); onChange(c); }}
            onKeyDown={e => { if (e.key === 'Enter') { setQuery(''); onChange(c); } }}>
            {c.name}{c.phone ? ` · ${c.phone}` : ''}{c.cin ? ` · ${c.cin}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
