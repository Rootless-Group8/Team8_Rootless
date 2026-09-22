import { useAuth } from "../auth/useAuth";

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="dashboard-page">
      <h1>Dashboard</h1>
      <p>Welcome{user?.displayName ? `, ${user.displayName}` : ""}.</p>
      <p className="placeholder-note">
        Checklist, progress tracking, and alerts get built here in later sprints.
      </p>
    </div>
  );
}