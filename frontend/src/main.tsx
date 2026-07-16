import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from '@/react-app/AppRouter';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/components/theme-provider';
import { startAppUpdateWatcher } from '@/lib/appUpdateWatcher';
import '@/app/globals.css';

startAppUpdateWatcher();

// One-time cleanup: earlier builds mirrored the Firebase ID token into a
// 7-day 'auth_token' cookie. Nothing reads it anymore; expire any leftover.
document.cookie = 'auth_token=; max-age=0; path=/; samesite=strict';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
