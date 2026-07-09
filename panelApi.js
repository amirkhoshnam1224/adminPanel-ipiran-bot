const axios = require('axios');

const PANEL_URL = process.env.PANEL_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: `${PANEL_URL}/api` });

let token = null;

const login = async () => {
  const { data } = await axios.post(`${PANEL_URL}/api/auth/login`, {
    username: process.env.PANEL_USERNAME,
    password: process.env.PANEL_PASSWORD,
  });
  token = data.token;
  return token;
};

api.interceptors.request.use(async (config) => {
  if (!token) await login();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      token = null;
      await login();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    }
    return Promise.reject(err);
  }
);

module.exports = {
  getHealth: () => axios.get(`${PANEL_URL}/api/health`).then((r) => r.data),
  getGroups: () => api.get('/groups').then((r) => r.data),
  getPlans: () => api.get('/plans').then((r) => r.data),
  getNextUsername: () => api.get(`/settings/next-username?t=${Date.now()}`).then((r) => r.data),
  createUser: (payload) => api.post('/users', payload).then((r) => r.data),
  getUserDetail: (name) => api.get(`/users/${name}/detail`).then((r) => r.data),
  getUserUsage: (name) => api.get(`/users/${name}/usage`).then((r) => r.data),
};