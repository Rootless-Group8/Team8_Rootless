import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import LogoutButton from "../auth/LogoutButton";

export default function NavBar() {
  const { user, loading } = useAuth();

  return (
    <nav className="nav-bar">
      <Link to="/" className="nav-brand">
        rootless
      </Link>

      <div className="nav-links">
        <Link to="/">Home</Link>
        <Link to="/visa-explorer">Visa Explorer</Link>
        {!loading && user && <Link to="/dashboard">Dashboard</Link>}
      </div>

      <div className="nav-links">
        {!loading && user ? (
          <LogoutButton />
        ) : (
          <>
            <Link to="/register">Sign up</Link>
            <Link to="/login" className="nav-cta">
              Log In
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
