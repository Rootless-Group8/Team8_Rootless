import { useAuth } from "../auth/useAuth";
import { useNotificationPreferences } from "../settings/useNotificationPreferences";
import Toggle from "../components/Toggle";
import "./SettingsPage.css";

// NOTE on scope: if a teammate added other placeholder content to this
// file since the stabilization pass, merge it back in rather than
// overwriting — this version only replaces the notification-preferences
// placeholder specifically, per this story's acceptance criteria.
const CATEGORIES = [
  {
    key: "deadlineReminders",
    label: "Deadline reminders",
    description: "Visa application and document deadlines coming up",
  },
  {
    key: "documentExpirationAlerts",
    label: "Document expiration alerts",
    description: "Passport, visa, and other document expirations",
  },
  {
    key: "checklistUpdates",
    label: "Checklist updates",
    description: "New or updated steps on your relocation checklist",
  },
  {
    key: "communityUpdates",
    label: "Community updates",
    description: "New relocation guides and general app announcements",
  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { loading, preferences, error, saveError, updatePreference } = useNotificationPreferences(
    user?.uid,
  );

  return (
    <div className="dashboard-shell settings-page">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Notifications</h2>

        {loading && <p className="loading-message">Loading preferences...</p>}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {saveError && (
          <p className="error-message" role="alert">
            {saveError}
          </p>
        )}

        {!loading && !error && (
          <div className="settings-toggle-list">
            {CATEGORIES.map((category) => (
              <div className="settings-toggle-row" key={category.key}>
                <Toggle
                  id={`pref-${category.key}`}
                  checked={preferences[category.key]}
                  onChange={(next) => updatePreference(category.key, next)}
                  label={category.label}
                />
                <p className="settings-toggle-description">{category.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
