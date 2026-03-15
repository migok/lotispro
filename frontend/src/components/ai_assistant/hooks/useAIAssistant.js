import { useState, useCallback } from 'react';
import { apiFetch, apiGet, apiDelete } from '../../../utils/api.js';

const AI_BASE = '/api/ai-assistant';

// Only send debug info in development builds
const IS_DEV = import.meta.env.DEV;

/**
 * Hook for AI Assistant API interactions
 */
export function useAIAssistant() {
  const [conversationId, setConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Send a message to the AI Assistant
   */
  const sendMessage = useCallback(async ({ message, project_id, debug = IS_DEV }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`${AI_BASE}/chat`, {
        method: 'POST',
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
          project_id,
          debug,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 503) {
          throw new Error('Assistant IA non disponible. Veuillez contacter l\'administrateur.');
        }
        if (response.status === 403) {
          throw new Error('Accès refusé. L\'assistant IA est réservé aux managers et commerciaux.');
        }
        if (response.status === 429) {
          throw new Error('Limite de requêtes atteinte. Veuillez patienter avant de réessayer.');
        }
        throw new Error(errorData.detail || 'Erreur lors de la communication avec l\'assistant');
      }

      const data = await response.json();

      // Store conversation ID for continuity
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  /**
   * Get conversation history
   */
  const getConversations = useCallback(async () => {
    try {
      return await apiGet(`${AI_BASE}/conversations`);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  /**
   * Get specific conversation
   */
  const getConversation = useCallback(async (id) => {
    try {
      return await apiGet(`${AI_BASE}/conversations/${id}`);
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  /**
   * Delete a conversation (204 No Content — no JSON body)
   */
  const deleteConversation = useCallback(async (id) => {
    try {
      const response = await apiFetch(`${AI_BASE}/conversations/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      // Clear current conversation ID if it was deleted
      if (conversationId === id) {
        setConversationId(null);
      }

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [conversationId]);

  /**
   * Check if AI Assistant is available
   */
  const checkHealth = useCallback(async () => {
    try {
      const response = await apiFetch(`${AI_BASE}/health`);
      const data = await response.json();
      return data.enabled && data.status === 'ok';
    } catch {
      return false;
    }
  }, []);

  /**
   * Start a new conversation
   */
  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setError(null);
  }, []);

  return {
    conversationId,
    isLoading,
    error,
    sendMessage,
    getConversations,
    getConversation,
    deleteConversation,
    checkHealth,
    startNewConversation,
  };
}
