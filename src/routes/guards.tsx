// src/routes/guards.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { UserRole } from "@/lib/auth/AuthProvider";

function FullPageLoader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="sn-card p-6 text-sm text-gray-600">{label}</div>
    </div>
  );
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <FullPageLoader />;

  if (!user) {
    return <Navigate to="/auth/login" replace state={{ from: loc.pathname + loc.search }} />;
  }

  return <Outlet />;
}

export function RoleGate({ allowed }: { allowed: UserRole[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <FullPageLoader />;

  if (!user) {
    return <Navigate to="/auth/login" replace state={{ from: loc.pathname + loc.search }} />;
  }

  if (!allowed.includes(user.role)) {
    return <Navigate to="/app/forbidden" replace />;
  }

  return <Outlet />;
}
