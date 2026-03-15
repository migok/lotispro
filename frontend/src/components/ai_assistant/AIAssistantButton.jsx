/**
 * Floating button to toggle AI Assistant — LotisPro brass design.
 */
export function AIAssistantButton({ onClick, isOpen, unreadCount }) {
  return (
    <button
      className={`ai-assistant-toggle ${isOpen ? 'open' : ''}`}
      onClick={onClick}
      aria-label={isOpen ? "Fermer l'assistant" : "Ouvrir l'assistant"}
    >
      {isOpen ? (
        /* Close icon */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      ) : (
        <>
          {/* Spark / intelligence icon */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 2L2 7l10 5 10-5-10-5Z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          {unreadCount > 0 && (
            <span className="ai-assistant-badge">{unreadCount}</span>
          )}
        </>
      )}
    </button>
  );
}
