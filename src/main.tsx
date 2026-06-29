import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { inject } from '@vercel/analytics';
import App from './App.tsx';
import { AdminApp } from './pages/admin/AdminApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

inject();

const isAdminRoute = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isAdminRoute ? <AdminApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
