import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiClient";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import FormContainer from "../components/FormContainer";
import "./VisaLifePlannerPage.css";

// Matches backend/src/services/lifeEventService.js's EVENT_TYPES and
// EVENT_STATUSES exactly -- these aren't exported for the frontend to
// import directly, so keep this list in sync if the backend's lists change.
const EVENT_TYPES = [
  { key: "visa_expiry", label: "Visa Expiry" },
  { key: "renewal", label: "Renewal" },
  { key: "status_change", label: "Status Change" },
  { key: "appointment", label: "Appointment" },
  { key: "milestone", label: "Milestone" },
];

const EVENT_STATUSES = [
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const EMPTY_FORM = {
  type: "visa_expiry",
  title: "",
  date: "",
  status: "upcoming",
  visaType: "",
  destinationCountry: "",
  notes: "",
};

export default function VisaLifePlannerPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formDetails, setFormDetails] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiFetch("/api/life-events");
      setEvents(data.events || []);
    } catch (err) {
      setLoadError(err.message || "Couldn't load your life events.");
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormDetails([]);
    setShowForm(true);
  }

  function openEditForm(event) {
    setEditingId(event.id);
    setForm({
      type: event.type,
      title: event.title,
      // API returns a full ISO string (e.g. "2026-12-01T00:00:00.000Z");
      // the date input needs just the date portion.
      date: event.date ? event.date.slice(0, 10) : "",
      status: event.status,
      visaType: event.visaType || "",
      destinationCountry: event.destinationCountry || "",
      notes: event.notes || "",
    });
    setFormError("");
    setFormDetails([]);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
    setFormDetails([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setFormDetails([]);
    setSubmitting(true);

    const payload = {
      type: form.type,
      title: form.title,
      date: form.date,
      status: form.status,
      visaType: form.visaType || undefined,
      destinationCountry: form.destinationCountry || undefined,
      notes: form.notes || undefined,
    };

    try {
      if (editingId) {
        const updated = await apiFetch(`/api/life-events/${editingId}`, {
          method: "PATCH",
          json: payload,
        });
        setEvents((prev) => prev.map((ev) => (ev.id === editingId ? updated : ev)));
      } else {
        const created = await apiFetch("/api/life-events", {
          method: "POST",
          json: payload,
        });
        setEvents((prev) => [...prev, created].sort((a, b) => new Date(a.date) - new Date(b.date)));
      }
      closeForm();
    } catch (err) {
      setFormError(err.message || "Something went wrong.");
      setFormDetails(Array.isArray(err.details) ? err.details : []);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(event) {
    const confirmed = window.confirm(`Delete "${event.title}"? This can't be undone.`);
    if (!confirmed) return;

    try {
      await apiFetch(`/api/life-events/${event.id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((ev) => ev.id !== event.id));
    } catch (err) {
      // A failed delete is surfaced as a page-level error since there's no
      // form open at this point to show it in.
      setLoadError(err.message || "Couldn't delete that event.");
    }
  }

  function typeLabel(key) {
    return EVENT_TYPES.find((t) => t.key === key)?.label || key;
  }

  function statusLabel(key) {
    return EVENT_STATUSES.find((s) => s.key === key)?.label || key;
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="visa-life-planner-page">
      <div className="visa-life-planner-header-row">
        <div>
          <h1>Visa Life Planner</h1>
          <p>Track the dates and milestones that affect your visa status.</p>
        </div>
        <Button label="Add event" onClick={openCreateForm} />
      </div>

      {showForm && (
        <div className="visa-life-planner-form">
          <FormContainer
            title={editingId ? "Edit event" : "Add a life event"}
            onSubmit={handleSubmit}
          >
            <div className="form-field">
              <label htmlFor="event-type">Type</label>
              <select
                id="event-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <TextInput
              label="Title"
              value={form.title}
              onChange={(value) => setForm({ ...form, title: value })}
              placeholder="e.g. Study permit expires"
            />

            <div className="form-field">
              <label htmlFor="event-date">Date</label>
              <input
                id="event-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label htmlFor="event-status">Status</label>
              <select
                id="event-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {EVENT_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <TextInput
              label="Visa type (optional)"
              value={form.visaType}
              onChange={(value) => setForm({ ...form, visaType: value })}
              placeholder="e.g. Study Permit"
            />

            <TextInput
              label="Destination country (optional)"
              value={form.destinationCountry}
              onChange={(value) => setForm({ ...form, destinationCountry: value })}
              placeholder="e.g. Canada"
            />

            <div className="form-field">
              <label htmlFor="event-notes">Notes (optional)</label>
              <textarea
                id="event-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {formError && (
              <div className="error-message" role="alert">
                <p>{formError}</p>
                {formDetails.length > 0 && (
                  <ul>
                    {formDetails.map((detail, i) => (
                      <li key={i}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="visa-life-planner-form-actions">
              <Button
                type="submit"
                label={submitting ? "Saving..." : editingId ? "Save changes" : "Add event"}
                disabled={submitting}
              />
              <Button label="Cancel" variant="secondary" onClick={closeForm} disabled={submitting} />
            </div>
          </FormContainer>
        </div>
      )}

      {loading && <p className="loading-message">Loading your events...</p>}

      {!loading && loadError && (
        <p className="error-message" role="alert">
          {loadError}
        </p>
      )}

      {!loading && !loadError && events.length === 0 && (
        <p className="placeholder-note">
          No life events yet. Add your visa expiry, renewal, or an upcoming appointment to get started.
        </p>
      )}

      {!loading && !loadError && events.length > 0 && (
        <ul className="visa-life-planner-list">
          {events.map((event) => (
            <li key={event.id} className="visa-life-planner-card">
              <div className="visa-life-planner-card-header">
                <span className="visa-life-planner-type">{typeLabel(event.type)}</span>
                <span className={`visa-life-planner-status visa-life-planner-status--${event.status}`}>
                  {statusLabel(event.status)}
                </span>
              </div>
              <h3>{event.title}</h3>
              <p className="visa-life-planner-date">{formatDate(event.date)}</p>
              {(event.visaType || event.destinationCountry) && (
                <p className="visa-life-planner-meta">
                  {[event.visaType, event.destinationCountry].filter(Boolean).join(" — ")}
                </p>
              )}
              {event.notes && <p className="visa-life-planner-notes">{event.notes}</p>}
              <div className="visa-life-planner-card-actions">
                <Button label="Edit" variant="secondary" onClick={() => openEditForm(event)} />
                <Button label="Delete" variant="secondary" onClick={() => handleDelete(event)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
