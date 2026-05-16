import axios from 'axios';

const API_BASE = 'http://127.0.0.1:5000/api';

export const fetchEnvironments = () => axios.get(`${API_BASE}/environments`);

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
