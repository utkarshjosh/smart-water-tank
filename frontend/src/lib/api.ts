import axios from 'axios';
import { auth } from './firebase';
import { getEnv } from './env';

export const API_BASE_URL = getEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the current Firebase user's ID token. getIdToken() returns the
// cached token and only refreshes over the network when it is near expiry.
// There is deliberately no fallback credential store: a request either
// carries the *current* user's token or none at all, so a previous user's
// session can never leak into API calls.
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.error('Failed to get auth token for request:', error);
    }
  }
  return config;
});

export default api;
