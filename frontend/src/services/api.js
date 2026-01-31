const API_BASE = "http://127.0.0.1:8000";

/**
 * Helper function to get auth headers
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem("auth_token");
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

/**
 * Generic API request handler
 */
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      // Clear auth data
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      // Redirect to login
      window.location.href = "/login";
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }

    // Handle other errors
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
};

/**
 * API service methods
 */
export const api = {
  // Auth
  login: (email, password) =>
    apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (userData) =>
    apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  getMe: () => apiRequest("/api/auth/me"),

  // Projects
  getProjects: () => apiRequest("/api/projects"),

  getProject: (id) => apiRequest(`/api/projects/${id}`),

  createProject: (data) =>
    apiRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateProject: (id, data) =>
    apiRequest(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteProject: (id) =>
    apiRequest(`/api/projects/${id}`, {
      method: "DELETE",
    }),

  // Lots
  getLots: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/api/lots${queryString ? `?${queryString}` : ""}`);
  },

  getLot: (id) => apiRequest(`/api/lots/${id}`),

  createLot: (data) =>
    apiRequest("/api/lots", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateLot: (id, data) =>
    apiRequest(`/api/lots/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteLot: (id) =>
    apiRequest(`/api/lots/${id}`, {
      method: "DELETE",
    }),

  // Clients
  getClients: (search = "") => {
    const queryString = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiRequest(`/api/clients${queryString}`);
  },

  getClient: (id) => apiRequest(`/api/clients/${id}`),

  createClient: (data) =>
    apiRequest("/api/clients", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateClient: (id, data) =>
    apiRequest(`/api/clients/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Reservations
  getReservations: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/api/reservations${queryString ? `?${queryString}` : ""}`);
  },

  getReservation: (id) => apiRequest(`/api/reservations/${id}`),

  createReservation: (data) =>
    apiRequest("/api/reservations", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  releaseReservation: (id) =>
    apiRequest(`/api/reservations/${id}/release`, {
      method: "POST",
    }),

  convertReservationToSale: (id, data) =>
    apiRequest(`/api/reservations/${id}/convert-to-sale`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Sales
  getSales: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/api/sales${queryString ? `?${queryString}` : ""}`);
  },

  createSale: (data) =>
    apiRequest("/api/sales", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Dashboard
  getDashboardStats: () => apiRequest("/api/dashboard/stats"),

  getDashboardLots: () => apiRequest("/api/dashboard/lots"),

  getDashboardAlerts: (daysThreshold = 3) =>
    apiRequest(`/api/dashboard/alerts?days_threshold=${daysThreshold}`),

  getDashboardPerformance: (period = "month") =>
    apiRequest(`/api/dashboard/performance?period=${period}`),

  getClientsPipeline: () => apiRequest("/api/dashboard/clients-pipeline"),

  // Audit Logs
  getAuditLogs: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/api/audit-logs${queryString ? `?${queryString}` : ""}`);
  },

  // Check expirations
  checkExpirations: () =>
    apiRequest("/api/check-expirations", {
      method: "POST",
    }),
};

export default api;
