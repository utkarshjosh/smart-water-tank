import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/client';
import { appStore } from '@/storage';

/**
 * Query client + a synchronous persisted cache.
 *
 * The persisted cache is what makes Law 1 of the plan possible: the Tanks
 * screen paints last-known values on the very first frame, before any network
 * call resolves, and revalidates underneath. MMKV is synchronous, so the
 * restore happens without an async gap that would show an empty shell first.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Dates survive the round trip.
 *
 * Schemas parse timestamps into `Date`, but JSON.stringify turns those into
 * strings — so a restored cache would hand `formatAge` a string and silently
 * render "never". Reviving anything shaped exactly like an ISO-8601 instant is
 * safe for these DTOs: every other string field is an id, enum or message.
 */
function reviveDates(_key: string, value: unknown): unknown {
  return typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;
}

export const persister = createSyncStoragePersister({
  storage: {
    getItem: (key) => appStore.getString(key) ?? null,
    setItem: (key, value) => appStore.set(key, value),
    removeItem: (key) => appStore.remove(key),
  },
  key: 'query-cache.v1',
  deserialize: (cached) => JSON.parse(cached, reviveDates),
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cached data is shown immediately and revalidated; a week of retention
      // means a phone that has been in a drawer still opens with context.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => {
        // 4xx is an answer, not a blip. Retrying an auth or access failure just
        // delays the message the user needs to see.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

/** Called on sign-out: the next account must not see the previous one's tanks. */
export function clearPersistedCache(): void {
  queryClient.clear();
  appStore.remove('query-cache.v1');
}
