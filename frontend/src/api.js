import axios from 'axios';

const API_BASE = 'http://127.0.0.1:5000/api';

const getAdminAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchEnvironments = () => axios.get(`${API_BASE}/environments`);
export const fetchLocations = (envId = '') => axios.get(`${API_BASE}/locations`, { params: envId ? { environment_id: envId } : {} });

export const fetchEquipments = (envId = '') => {
  const url = envId ? `${API_BASE}/equipments?environment_id=${envId}` : `${API_BASE}/equipments`;
  return axios.get(url);
};

export const addEquipment = (data) => axios.post(`${API_BASE}/equipments`, data);

export const updateEquipment = (id, data) => axios.put(`${API_BASE}/equipments/${id}`, data);

export const deleteEquipment = (id) => axios.delete(`${API_BASE}/equipments/${id}`);

export const completeMaintenance = (id, data) => axios.post(`${API_BASE}/equipments/${id}/maintenance`, data);

export const fetchSynthesis = (month, year, envId = '', today = false, overdue = false) => {
  let url = `${API_BASE}/synthesis?month=${month}&year=${year}`;
  if (envId) url += `&environment_id=${envId}`;
  if (today) url += `&today=true`;
  if (overdue) url += `&overdue=true`;
  return axios.get(url);
};

export const fetchMaintenanceLogs = (envId = '') => {
  const url = envId ? `${API_BASE}/maintenance/logs?environment_id=${envId}` : `${API_BASE}/maintenance/logs`;
  return axios.get(url);
};

export const uploadDocument = (formData) => axios.post(`${API_BASE}/classify-document`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const verifyClassification = (data) => axios.post(`${API_BASE}/verify-classification`, data);
export const fetchPendingReview = () => axios.get(`${API_BASE}/pending-review`);
export const fetchTaskProgress = (taskId) => axios.get(`${API_BASE}/task-status/${taskId}`);

// NEW ROUTES
export const fetchLogs = (params) => axios.get(`${API_BASE}/logs`, { params });
export const fetchCalendarEvents = (envId = '', month, year) => {
  const params = { month, year };
  if (envId) params.environment_id = envId;
  return axios.get(`${API_BASE}/calendar-events`, { params });
};
export const toggleStandby = (id, standby) => axios.patch(`${API_BASE}/equipments/${id}/standby`, { standby });
export const adminLogin = (username, password) => axios.post(`${API_BASE}/admin/login`, { username, password });
export const fetchAdminEnvironments = () => axios.get(`${API_BASE}/admin/environments`, { headers: getAdminAuthHeaders() });
export const createAdminEnvironment = (data) => axios.post(`${API_BASE}/admin/environments`, data, { headers: getAdminAuthHeaders() });
export const updateAdminEnvironment = (id, data) => axios.patch(`${API_BASE}/admin/environments/${id}`, data, { headers: getAdminAuthHeaders() });
export const deleteAdminEnvironment = (id) => axios.delete(`${API_BASE}/admin/environments/${id}`, { headers: getAdminAuthHeaders() });
export const createAdminLocation = (data) => axios.post(`${API_BASE}/admin/locations`, data, { headers: getAdminAuthHeaders() });
export const updateAdminLocation = (id, data) => axios.patch(`${API_BASE}/admin/locations/${id}`, data, { headers: getAdminAuthHeaders() });
export const deleteAdminLocation = (id) => axios.delete(`${API_BASE}/admin/locations/${id}`, { headers: getAdminAuthHeaders() });
export const fetchAdminEquipments = (search = '') => axios.get(`${API_BASE}/admin/equipments`, { params: { search }, headers: getAdminAuthHeaders() });
export const setCalendarOverride = (id, original_date, new_date) => axios.post(`${API_BASE}/equipments/${id}/calendar/override`, { original_date, new_date });
