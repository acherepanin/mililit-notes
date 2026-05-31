import { Loader2 } from 'lucide-react';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../features/auth/useAuth';

function BootScreen() {
  return (
    <main className="auth-stage">
      <Loader2 className="boot-spinner" size={28} />
    </main>
  );
}

export function RequireAdmin() {
  const auth = useAuth();

  if (auth.isChecking) {
    return <BootScreen />;
  }

  if (auth.user?.role !== 'admin') {
    return <Navigate to="/notes" replace />;
  }

  return <Outlet />;
}
