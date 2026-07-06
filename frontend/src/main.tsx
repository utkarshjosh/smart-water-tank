import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from '@/react-app/AppRouter';
import { ThemeProvider } from '@/components/theme-provider';
import { startAppUpdateWatcher } from '@/lib/appUpdateWatcher';
import '@/app/globals.css';

startAppUpdateWatcher();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
