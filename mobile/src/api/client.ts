import type { ZodType } from 'zod';

import { getIdTokenOrNull } from '@/auth/firebase';
import { env } from '@/env';

/**
 * Thin fetch wrapper. No axios: one interceptor's worth of behaviour does not
 * justify the bundle, and the two things we actually need are explicit here —
 * a bearer token on every call, and exactly one forced-refresh retry on 401.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the device/tank genuinely has no data yet, not a failure. */
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

const TIMEOUT_MS = 12_000;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

async function rawRequest(path: string, options: RequestOptions, forceTokenRefresh: boolean): Promise<Response> {
  const token = await getIdTokenOrNull(forceTokenRefresh);

  // Time out slow requests ourselves: fetch has no timeout, and a hung socket
  // on a patchy connection would otherwise leave the UI on cached data with a
  // spinner that never resolves.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onCallerAbort = () => timeout.abort();
  options.signal?.addEventListener('abort', onCallerAbort);

  try {
    return await fetch(`${env.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}

async function readError(response: Response): Promise<ApiError> {
  let body: unknown;
  let message = `Request failed (${response.status})`;
  try {
    body = await response.json();
    const error = (body as { error?: unknown })?.error;
    if (typeof error === 'string') message = error;
  } catch {
    // Non-JSON error page (nginx, a proxy). The status is all we get.
  }
  return new ApiError(response.status, message, body);
}

/**
 * Request + parse. The schema is not optional: an unvalidated response is how
 * a null reading becomes a crash three screens later.
 */
export async function request<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  let response = await rawRequest(path, options, false);

  // A 401 on a token we just read means it expired between cache and call.
  // Force-refresh and retry exactly once; a second 401 is a real auth failure.
  if (response.status === 401) {
    response = await rawRequest(path, options, true);
  }

  if (!response.ok) throw await readError(response);

  const json = await response.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      `Unexpected response shape from ${path}: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
        .join('; ')}`,
      json
    );
  }
  return parsed.data;
}
