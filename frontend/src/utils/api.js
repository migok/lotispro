/**
 * Utilitaires pour les appels API avec authentification
 */

const API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Récupère le token d'authentification depuis le localStorage
 */
const getAuthToken = () => {
  return localStorage.getItem('auth_token');
};

/**
 * Crée les headers pour une requête authentifiée
 */
const getAuthHeaders = () => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

/**
 * Wrapper pour fetch avec authentification automatique
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const config = {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  // Si 401, le token est invalide - rediriger vers login
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
    throw new Error('Session expirée');
  }

  return response;
};

/**
 * GET request avec authentification
 */
export const apiGet = async (endpoint) => {
  const response = await apiFetch(endpoint);
  return response.json();
};

/**
 * POST request avec authentification
 */
export const apiPost = async (endpoint, data) => {
  const response = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
};

/**
 * PUT request avec authentification
 */
export const apiPut = async (endpoint, data) => {
  const response = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
};

/**
 * DELETE request avec authentification
 */
export const apiDelete = async (endpoint) => {
  const response = await apiFetch(endpoint, {
    method: 'DELETE',
  });
  return response.json();
};

/**
 * Upload file avec authentification
 */
export const apiUploadFile = async (endpoint, file, fieldName = 'file') => {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append(fieldName, file);

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
    throw new Error('Session expirée');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || data.message || `Erreur ${response.status}`);
  }

  return data;
};

export default {
  fetch: apiFetch,
  get: apiGet,
  post: apiPost,
  put: apiPut,
  delete: apiDelete,
  uploadFile: apiUploadFile,
};
