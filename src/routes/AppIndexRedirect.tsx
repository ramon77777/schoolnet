import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getDefaultPathByRole } from "@/lib/auth";

export default function AppIndexRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="sn-card p-6">Chargement…</div>;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Navigate to={getDefaultPathByRole(user.role)} replace />;
}