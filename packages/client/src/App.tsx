import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store';
import { CommandPalette } from './components/CommandPalette';

// Code-split routes: the heavy editor chunk (TipTap + Yjs) loads only when the
// editor route is visited, keeping the initial bundle small.
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DocumentsPage = lazy(() =>
  import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));

export function App() {
  const { status, bootstrap } = useAuth();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') {
    return <div className="center muted">Loading…</div>;
  }

  return (
    <Suspense fallback={<div className="center muted">Loading…</div>}>
      {status === 'authenticated' && <CommandPalette />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={status === 'authenticated' ? <DocumentsPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/doc/:id"
          element={status === 'authenticated' ? <EditorPage /> : <Navigate to="/login" />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}
