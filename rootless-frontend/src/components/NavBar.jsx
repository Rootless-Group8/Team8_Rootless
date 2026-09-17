import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import LogoutButton from "../auth/LogoutButton";

export default function NavBar() {
  const { user, loading } = useAuth();

  return (
    <nav className="nav-bar">
      <Link to="/" className="nav-brand">Rootless</Link>
      <div className="nav-links">
        {!loading && user ? (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  );
}