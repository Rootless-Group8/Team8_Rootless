import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/" className="nav-brand">
        rootless
      </Link>
      <div className="site-footer-links">
        <Link to="/">Home</Link>
        <Link to="/visa-explorer">Visa Explorer</Link>
        <Link to="/dashboard">Dashboard</Link>
      </div>
    </footer>
  );
}
