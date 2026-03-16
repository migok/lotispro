import { useState, useMemo } from 'react';
import { PROMPT_LIBRARY } from './prompts';

/**
 * Bibliothèque de prompts — panneau accordéon avec recherche
 * Props: onSelectPrompt(text: string) — insère le prompt dans le chat
 */
export function PromptLibrary({ onSelectPrompt }) {
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState(
    () => Object.fromEntries(PROMPT_LIBRARY.map(c => [c.id, true]))
  );

  const isSearching = search.trim().length > 0;
  const searchLower = search.toLowerCase();

  const filtered = useMemo(() => {
    if (!isSearching) return PROMPT_LIBRARY;
    return PROMPT_LIBRARY.map(cat => ({
      ...cat,
      prompts: cat.prompts.filter(p =>
        p.text.toLowerCase().includes(searchLower)
      ),
    })).filter(cat => cat.prompts.length > 0);
  }, [isSearching, searchLower]);

  const toggleCategory = (id) => {
    setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const totalCount = PROMPT_LIBRARY.reduce((acc, c) => acc + c.prompts.length, 0);

  return (
    <div className="prompt-library">
      {/* Search */}
      <div className="pl-search-bar">
        <svg className="pl-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          className="pl-search-input"
          type="text"
          placeholder="Rechercher un prompt..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoComplete="off"
        />
        {isSearching && (
          <button className="pl-search-clear" onClick={() => setSearch('')} aria-label="Effacer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Header count */}
      <div className="pl-header">
        <span className="pl-header-label">
          {isSearching
            ? `${filtered.reduce((a, c) => a + c.prompts.length, 0)} résultat${filtered.reduce((a, c) => a + c.prompts.length, 0) > 1 ? 's' : ''}`
            : `${totalCount} prompts disponibles`}
        </span>
      </div>

      {/* Categories */}
      <div className="pl-categories">
        {filtered.length === 0 ? (
          <div className="pl-empty">Aucun prompt ne correspond à votre recherche.</div>
        ) : (
          filtered.map(cat => {
            const isOpen = isSearching || openCategories[cat.id];
            return (
              <div className={`pl-category${isOpen ? ' open' : ''}`} key={cat.id}>
                <button
                  className="pl-category-header"
                  onClick={() => !isSearching && toggleCategory(cat.id)}
                  aria-expanded={isOpen}
                >
                  <span className="pl-category-label">{cat.label}</span>
                  <span className="pl-category-count">{cat.prompts.length}</span>
                  {!isSearching && (
                    <span className="pl-chevron" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="pl-prompts">
                    {cat.prompts.map(prompt => (
                      <button
                        key={prompt.id}
                        className="pl-prompt-item"
                        onClick={() => onSelectPrompt(prompt.text)}
                        title={prompt.text}
                      >
                        <span className="pl-prompt-text">{prompt.text}</span>
                        <span className="pl-prompt-arrow" aria-hidden="true">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
