import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageBubble } from './MessageBubble';
import { useAIAssistant } from './hooks/useAIAssistant';

const IS_DEV = import.meta.env.DEV;

const SUGGESTED_QUESTIONS = [
  "Combien de ventes cette semaine ?",
  "Quel est mon meilleur commercial ce mois ?",
  "Liste des lots disponibles",
  "Analyse la performance de mes commerciaux",
  "Paiements en retard",
  "Réservations qui expirent bientôt",
];

/**
 * Main chat interface component
 */
export function ChatInterface() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant manager. Comment puis-je vous aider aujourd\'hui ?\n\nVoici quelques exemples de questions que vous pouvez me poser :',
      suggestedQuestions: SUGGESTED_QUESTIONS,
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  const { sendMessage, conversationId, error } = useAIAssistant();

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea as user types
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [input]);

  const handleSend = useCallback(async (messageText = input) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendMessage({
        message: messageText,
        conversation_id: conversationId,
        debug: IS_DEV,
      });

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        chartUrl: response.chart_url,
        chartData: response.chart_data,
        sqlQueries: response.sql_queries,
        type: response.type,
        excelExport: response.excel_export,
        debug: response.debug, // Include debug info for development
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err.message || 'Désolé, une erreur s\'est produite. Veuillez réessayer.',
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, conversationId, sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedQuestion = (question) => {
    handleSend(question);
  };

  return (
    <div className="chat-interface">
      <div className="chat-messages">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onSuggestedQuestionClick={handleSuggestedQuestion}
          />
        ))}
        
        {isLoading && (
          <div className="message assistant loading">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        {error && (
          <div className="chat-error">
            {error}
          </div>
        )}
        
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question sur les ventes, lots, commerciaux..."
            rows={1}
            disabled={isLoading}
            className="chat-input"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="chat-send-button"
            aria-label="Envoyer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
        
        <div className="chat-hint">
          Appuyez sur Entrée pour envoyer, Maj+Entrée pour nouvelle ligne
        </div>
      </div>
    </div>
  );
}
