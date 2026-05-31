import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../features/auth/useAuth';

function BootScreen() {
  return (
    <main className="auth-stage">
      <Loader2 className="boot-spinner" size={28} />
    </main>
  );
}

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isChecking) {
    return <BootScreen />;
  }

  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
