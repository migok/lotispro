import { useEffect, useId, useMemo, useRef, useState } from 'react';

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

const MAX_RESULTS = 50;

const initials = (name) =>
  String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('') || '?';

/**
 * Searchable client dropdown (name, CIN or phone).
 * `value` is the selected client or null; `onChange(client | null)`.
 */
export default function ClientPicker({ clients, value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i) => `${baseId}-opt-${i}`;

  const results = useMemo(() => clients.filter(c => matches(c, query)), [clients, query]);
  const shown = results.slice(0, MAX_RESULTS);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = document.getElementById(`${baseId}-opt-${activeIndex}`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, baseId]);

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

  const select = (c) => {
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    onChange(c);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (!shown.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(i => (i < 0
        ? (step === 1 ? 0 : shown.length - 1)
        : (i + step + shown.length) % shown.length));
    } else if (e.key === 'Enter') {
      if (open && shown[activeIndex]) { e.preventDefault(); select(shown[activeIndex]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    }
  };

  return (
    <div className="msr-client-picker" ref={rootRef}>
      <div className="msr-client-picker-field">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open && results.length > 0 ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[activeIndex] ? optionId(activeIndex) : undefined}
          className="msr-input msr-client-picker-input"
          placeholder="Rechercher par nom, CIN ou téléphone"
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIndex(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={`msr-client-picker-toggle${open ? ' is-open' : ''}`}
          aria-label="Afficher les clients"
          tabIndex={-1}
          onClick={() => {
            if (open) { setOpen(false); return; }
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="msr-client-picker-panel">
          <div className="msr-client-picker-header">
            {results.length} client{results.length > 1 ? 's' : ''}
          </div>
          {results.length === 0 ? (
            <div role="presentation" className="msr-client-picker-empty">Aucun client trouvé</div>
          ) : (
            <ul id={listId} role="listbox" className="msr-client-picker-list">
              {shown.map((c, i) => (
                <li
                  key={c.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`msr-client-picker-option${i === activeIndex ? ' is-active' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => select(c)}
                >
                  <span className="msr-client-picker-avatar" aria-hidden="true">{initials(c.name)}</span>
                  <span className="msr-client-picker-text">
                    <span className="msr-client-picker-name">{c.name}</span>
                    <span className="msr-client-picker-sub">
                      {[c.phone, c.cin ? `CIN ${c.cin}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {results.length > MAX_RESULTS && (
            <div role="presentation" className="msr-client-picker-more">
              Affinez la recherche pour voir plus de clients…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
