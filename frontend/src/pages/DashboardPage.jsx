import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useChecklistProgress } from "../dashboard/useChecklistProgress";
import ProgressBar from "../components/ProgressBar";

const sidebarLinks = [
  { to: "/dashboard", label: "Overview" },
  { to: "/visa-explorer", label: "Visa Explorer" },
  { to: "/visa-comparison", label: "Compare Visas" },
  { to: "/cost-of-living", label: "Cost of Living" },
  { to: "/checklist", label: "Checklist" },
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
  const location = useLocation();
  const progress = useChecklistProgress(user?.uid);

  return (
    <div className="dashboard-shell">
      <div className="dashboard-grid">
        <nav className="dashboard-sidebar" aria-label="Dashboard navigation">
          {sidebarLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`dashboard-sidebar-link${isActive ? " dashboard-sidebar-link--active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="dashboard-main">
          <h1>Welcome{user?.displayName ? `, ${user.displayName}` : ""}.</h1>
          {user?.email && <p className="dashboard-signed-in-as">Signed in as {user.email}</p>}

          <div className="dashboard-cards">
            <section className="dashboard-card">
              <h2>Progress</h2>
              {progress.loading ? (
                <p className="loading-message">Loading...</p>
              ) : progress.hasChecklist ? (
                <ProgressBar
                  completed={progress.completed}
                  total={progress.total}
                  label="Relocation checklist progress"
                />
              ) : (
                <>
                  <p className="placeholder-note">
                    No relocation checklist started yet. Progress tracking will appear here
                    once you start one.
                  </p>
                  <Link to="/visa-explorer" className="dashboard-card-cta">
                    Find your visa →
                  </Link>
                </>
              )}
            </section>

            <section className="dashboard-card">
              <h2>Checklist</h2>
              <p className="placeholder-note">
                See the steps you need to complete for your move — currently a sample checklist
                until the real Checklist Generator API is wired in.
              </p>
              <Link to="/checklist" className="dashboard-card-cta">
                View your checklist →
              </Link>
            </section>

            <section className="dashboard-card">
              <h2>Alerts</h2>
              <p className="placeholder-note">
                Document expiration alerts will appear here once documents are on file.
              </p>
              <Link to="/documents" className="dashboard-card-cta">
                Add a document →
              </Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}