import axios, { type AxiosRequestConfig } from 'axios';
import type { z } from 'zod';
import { auth, waitForAuthState } from './firebase';
import { getEnv } from './env';
import { parseResponse } from './contract';

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
  // On a full-page refresh Firebase restores its persisted user
  // asynchronously. Waiting here makes auth correct for every API consumer,
  // including components that issue requests as soon as they mount.
  await waitForAuthState();

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

/**
 * GET a response and parse it against its contract. `api.get<T>()` was a type
 * assertion — it compiled to nothing and TypeScript simply believed the
 * server. This validates instead: the schema is the only source of the type.
 */
export const get = <S extends z.ZodType>(url: string, schema: S, config?: AxiosRequestConfig) =>
  api.get(url, config).then((r) => parseResponse(schema, r.data, url));

/** POST and parse the response the same way. */
export const post = <S extends z.ZodType>(url: string, schema: S, body?: unknown, config?: AxiosRequestConfig) =>
  api.post(url, body, config).then((r) => parseResponse(schema, r.data, url));

export default api;
