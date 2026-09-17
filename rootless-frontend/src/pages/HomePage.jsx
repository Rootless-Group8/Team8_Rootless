import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="home-page">
      <h1>Plan your move, step by step.</h1>
      <p>Rootless helps you figure out which visas you qualify for and what to do next.</p>
      <div className="home-actions">
        <Link to="/register" className="button-link">Get started</Link>
        <Link to="/login" className="button-link button-link-secondary">Log in</Link>
      </div>
    </div>
  );
}