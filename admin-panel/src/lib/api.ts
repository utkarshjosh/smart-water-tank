import axios from 'axios';
import { auth } from './firebase';
import { getAuthToken } from './cookies';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
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


