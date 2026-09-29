import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

const sidebarLinks = [
  { to: "/dashboard", label: "Overview" },
  { to: "/visa-explorer", label: "Visa Explorer" },
  { to: "/visa-comparison", label: "Compare Visas" },
  { to: "/documents", label: "Documents" },
  { to: "/account", label: "Account" },
  { to: "/settings", label: "Settings" },
];

// The dashboard shell: a nav sidebar plus placeholder sections for
// progress, checklist, and alerts. Deliberately decoupled from any
// specific feature's data so later sprints can slot real content into
// these sections without restructuring this layout.
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="dashboard-shell">
      <div className="dashboard-grid">
        <nav className="dashboard-sidebar" aria-label="Dashboard navigation">
          {sidebarLinks.map((link) => (
            <Link key={link.to} to={link.to} className="dashboard-sidebar-link">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="dashboard-main">
          <h1>Welcome{user?.displayName ? `, ${user.displayName}` : ""}.</h1>

          <div className="dashboard-cards">
            <section className="dashboard-card">
              <h2>Progress</h2>
              <p className="placeholder-note">
                No relocation checklist started yet. Progress tracking gets built here in a
                later sprint.
              </p>
            </section>

            <section className="dashboard-card">
              <h2>Checklist</h2>
              <p className="placeholder-note">
                Your visa checklist will show up here once you pick a pathway in Visa Explorer.
              </p>
            </section>

            <section className="dashboard-card">
              <h2>Alerts</h2>
              <p className="placeholder-note">
                Document expiration alerts will appear here once documents are on file.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}