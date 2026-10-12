import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { ConfirmProvider, Spinner, ToastProvider } from './components/ui';
import { BonusTypesPage } from './pages/BonusTypes';
import { DashboardPage } from './pages/Dashboard';
import { DataPage } from './pages/Data';
import { ItemEditorPage } from './pages/ItemEditor';
import { ItemListPage } from './pages/ItemList';
import { LoginPage } from './pages/Login';
import './index.css';

function App() {
  const { username, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gold-400">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!username) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="items" element={<ItemListPage />} />
        <Route path="items/new" element={<ItemEditorPage />} />
        <Route path="items/:id" element={<ItemEditorPage />} />
        <Route path="bonuses" element={<BonusTypesPage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
