import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <p className="loading-message">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}