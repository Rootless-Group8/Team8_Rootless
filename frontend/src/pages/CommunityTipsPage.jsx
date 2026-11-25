import { useEffect, useState } from "react";
import { auth } from "../firebase/config";
import { apiFetch } from "../lib/apiClient";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import FormContainer from "../components/FormContainer";
import "./CommunityTipsPage.css";

// Matches backend/src/services/communityTipService.js's SUPPORTED_COUNTRIES
// and TIP_TOPICS exactly -- these aren't exported for the frontend to
// import directly, so keep these lists in sync if the backend's lists change.
const SUPPORTED_COUNTRIES = [
  "Canada",
  "UK",
  "Germany",
  "Portugal",
  "Mexico",
  "Spain",
  "Australia",
  "Japan",
  "Netherlands",
  "New Zealand",
];

const TIP_TOPICS = [
  { key: "housing", label: "Housing" },
  { key: "transportation", label: "Transportation" },
  { key: "healthcare", label: "Healthcare" },
  { key: "banking", label: "Banking" },
  { key: "language", label: "Language" },
  { key: "culture", label: "Culture" },
  { key: "jobs", label: "Jobs" },
  { key: "other", label: "Other" },
];

const EMPTY_FORM = {
  title: "",
  content: "",
  destinationCountry: "",
  city: "",
  topic: "housing",
};

export default function CommunityTipsPage() {
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Filters sent to the API as query params. destinationCountry and topic
  // are exact-match on the backend; city is matched case-insensitively.
  const [filters, setFilters] = useState({ destinationCountry: "", city: "", topic: "" });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formDetails, setFormDetails] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.destinationCountry, filters.city, filters.topic]);

  async function loadTips() {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams();
      if (filters.destinationCountry) params.set("destinationCountry", filters.destinationCountry);
      if (filters.city.trim()) params.set("city", filters.city.trim());
      if (filters.topic) params.set("topic", filters.topic);
      const query = params.toString();
      const data = await apiFetch(`/api/community-tips${query ? `?${query}` : ""}`);
      setTips(data.tips || []);
    } catch (err) {
      setLoadError(err.message || "Couldn't load community tips.");
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      // Default the new tip's destination to whatever the list is already
      // filtered to, since that's almost always what the person meant.
      destinationCountry: filters.destinationCountry || "",
    });
    setFormError("");
    setFormDetails([]);
    setShowForm(true);
  }

  function openEditForm(tip) {
    setEditingId(tip.id);
    setForm({
      title: tip.title,
      content: tip.content,
      destinationCountry: tip.destinationCountry,
      city: tip.city,
      topic: tip.topic,
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
      title: form.title,
      content: form.content,
      destinationCountry: form.destinationCountry,
      city: form.city,
      topic: form.topic,
    };

    try {
      if (editingId) {
        const updated = await apiFetch(`/api/community-tips/${editingId}`, {
          method: "PATCH",
          json: payload,
        });
        setTips((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      } else {
        const created = await apiFetch("/api/community-tips", {
          method: "POST",
          json: payload,
        });
        setTips((prev) => [created, ...prev]);
      }
      closeForm();
    } catch (err) {
      setFormError(err.message || "Something went wrong.");
      setFormDetails(Array.isArray(err.details) ? err.details : []);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(tip) {
    const confirmed = window.confirm("Delete this tip? This can't be undone.");
    if (!confirmed) return;

    try {
      await apiFetch(`/api/community-tips/${tip.id}`, { method: "DELETE" });
      setTips((prev) => prev.filter((t) => t.id !== tip.id));
    } catch (err) {
      // A failed delete is surfaced as a page-level error since there's no
      // form open at this point to show it in.
      setLoadError(err.message || "Couldn't delete that tip.");
    }
  }

  function topicLabel(key) {
    return TIP_TOPICS.find((t) => t.key === key)?.label || key;
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  const currentUid = auth.currentUser?.uid;

  return (
    <div className="community-tips-page">
      <div className="community-tips-header-row">
        <div>
          <h1>Community Tips</h1>
          <p>Real advice from people who've already made the move, by destination.</p>
        </div>
        <Button label="Share a tip" onClick={openCreateForm} />
      </div>

      <div className="community-tips-filters">
        <div className="form-field">
          <label htmlFor="filter-destination">Destination country</label>
          <select
            id="filter-destination"
            value={filters.destinationCountry}
            onChange={(e) => setFilters({ ...filters, destinationCountry: e.target.value })}
          >
            <option value="">All countries</option>
            {SUPPORTED_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <TextInput
          label="City"
          value={filters.city}
          onChange={(value) => setFilters({ ...filters, city: value })}
          placeholder="e.g. Toronto"
        />

        <div className="form-field">
          <label htmlFor="filter-topic">Topic</label>
          <select
            id="filter-topic"
            value={filters.topic}
            onChange={(e) => setFilters({ ...filters, topic: e.target.value })}
          >
            <option value="">All topics</option>
            {TIP_TOPICS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showForm && (
        <div className="community-tips-form">
          <FormContainer
            title={editingId ? "Edit tip" : "Share a tip"}
            onSubmit={handleSubmit}
          >
            <TextInput
              label="Title"
              value={form.title}
              onChange={(value) => setForm({ ...form, title: value })}
              placeholder="e.g. Opening a bank account as a newcomer"
            />

            <div className="form-field">
              <label htmlFor="tip-destination">Destination country</label>
              <select
                id="tip-destination"
                value={form.destinationCountry}
                onChange={(e) => setForm({ ...form, destinationCountry: e.target.value })}
              >
                <option value="">Select a country</option>
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <TextInput
              label="City"
              value={form.city}
              onChange={(value) => setForm({ ...form, city: value })}
              placeholder="e.g. Toronto"
            />

            <div className="form-field">
              <label htmlFor="tip-topic">Topic</label>
              <select
                id="tip-topic"
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
              >
                {TIP_TOPICS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="tip-content">Your tip</label>
              <textarea
                id="tip-content"
                rows={4}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="What do you wish you'd known before you got here?"
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

            <div className="community-tips-form-actions">
              <Button
                type="submit"
                label={submitting ? "Saving..." : editingId ? "Save changes" : "Share tip"}
                disabled={submitting}
              />
              <Button label="Cancel" variant="secondary" onClick={closeForm} disabled={submitting} />
            </div>
          </FormContainer>
        </div>
      )}

      {loading && <p className="loading-message">Loading tips...</p>}

      {!loading && loadError && (
        <p className="error-message" role="alert">
          {loadError}
        </p>
      )}

      {!loading && !loadError && tips.length === 0 && (
        <p className="placeholder-note">No tips match these filters yet. Be the first to share one.</p>
      )}

      {!loading && !loadError && tips.length > 0 && (
        <ul className="community-tips-list">
          {tips.map((tip) => (
            <li key={tip.id} className="community-tips-card">
              <div className="community-tips-card-header">
                <span className="community-tips-topic">{topicLabel(tip.topic)}</span>
                <span className="community-tips-date">{formatDate(tip.createdAt)}</span>
              </div>
              <h3>{tip.title}</h3>
              <p className="community-tips-location">
                {tip.city}, {tip.destinationCountry}
              </p>
              <p className="community-tips-text">{tip.content}</p>
              <div className="community-tips-card-footer">
                <span className="community-tips-author">— {tip.authorName}</span>
                {tip.ownerUid === currentUid && (
                  <div className="community-tips-card-actions">
                    <Button label="Edit" variant="secondary" onClick={() => openEditForm(tip)} />
                    <Button label="Delete" variant="secondary" onClick={() => handleDelete(tip)} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
