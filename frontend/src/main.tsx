import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import AppRouter from '@/react-app/AppRouter';
import { AuthProvider } from '@/lib/auth-context';
import { startAppUpdateWatcher } from '@/lib/appUpdateWatcher';
import '@/app/globals.css';

startAppUpdateWatcher();

// One-time cleanup: earlier builds mirrored the Firebase ID token into a
// 7-day 'auth_token' cookie. Nothing reads it anymore; expire any leftover.
document.cookie = 'auth_token=; max-age=0; path=/; samesite=strict';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Telemetry is worth re-reading when the user comes back to the tab, but
      // not on every remount within half a minute of the last read.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
          <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{ className: 'text-label' }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
