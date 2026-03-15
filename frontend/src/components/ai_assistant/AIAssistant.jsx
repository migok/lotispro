import { useState, useRef, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { AIAssistantButton } from './AIAssistantButton';
import './styles/ai-assistant.css';

/**
 * AI Assistant Widget — LotisPro
 * Floating intelligence panel for manager queries.
 */
export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const widgetRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (widgetRef.current && !widgetRef.current.contains(event.target)) {
        // Intentionally not auto-closing on outside click
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOpen = () => {
    setIsOpen(prev => !prev);
    if (!isOpen) setUnreadCount(0);
  };

  return (
    <div ref={widgetRef} className="ai-assistant-widget">
      {isOpen && (
        <div className="ai-assistant-container">
          <div className="ai-assistant-header">
            <div className="ai-assistant-title">
              {/* Geometric AI icon — no emoji */}
              <div className="ai-assistant-avatar-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5Z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="ai-header-text">
                <h3>Assistant Manager</h3>
                <span className="ai-assistant-status">
                  <span className="ai-status-dot" />
                  Ventes · Lots · Commerciaux
                </span>
              </div>
            </div>
            <button
              className="ai-assistant-close"
              onClick={() => setIsOpen(false)}
              aria-label="Fermer l'assistant"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <ChatInterface />
        </div>
      )}

      <AIAssistantButton
        onClick={toggleOpen}
        isOpen={isOpen}
        unreadCount={unreadCount}
      />
    </div>
  );
}
