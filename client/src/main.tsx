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
import { WikiCategory } from './wiki/WikiCategory';
import { WikiHome } from './wiki/WikiHome';
import { WikiItem } from './wiki/WikiItem';
import { WikiLayout } from './wiki/WikiLayout';
import './index.css';

function AdminApp() {
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

function App() {
  return (
    <Routes>
      {/* Oyunculara açık item wiki'si — giriş gerektirmez */}
      <Route path="wiki" element={<WikiLayout />}>
        <Route index element={<WikiHome />} />
        <Route path="c/:type/:subtype" element={<WikiCategory />} />
        <Route path="ara" element={<WikiCategory searchMode />} />
        <Route path="item/:vnum" element={<WikiItem />} />
        <Route path="*" element={<Navigate to="/wiki" replace />} />
      </Route>
      <Route path="*" element={<AdminApp />} />
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
