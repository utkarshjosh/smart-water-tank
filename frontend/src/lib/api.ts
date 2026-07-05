import axios from 'axios';
import { auth } from './firebase';
import { getAuthToken } from './cookies';
import { getEnv } from './env';

export const API_BASE_URL = getEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    // Try to get fresh token from Firebase
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      // Fallback to cookie token if Firebase token fails
      const cookieToken = getAuthToken();
      if (cookieToken) {
        config.headers.Authorization = `Bearer ${cookieToken}`;
      }
    }
  } else {
    // If no Firebase user, try to use cookie token
    const cookieToken = getAuthToken();
    if (cookieToken) {
      config.headers.Authorization = `Bearer ${cookieToken}`;
    }
  }
  return config;
});

export default api;
