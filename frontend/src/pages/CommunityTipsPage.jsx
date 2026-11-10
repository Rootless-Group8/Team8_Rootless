import { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { rtdb } from "../firebase/config";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import FormContainer from "../components/FormContainer";
import { MOCK_TIPS, CATEGORIES } from "../mockData/mockCommunityTips";
import "./CommunityTipsPage.css";

// TODO: once the real Community Tips API exists, replace MOCK_TIPS and
// the local-only handleSubmit below with real GET/POST calls via
// apiFetch, following the same pattern used in useChecklist.js and
// profileService.js. Nothing else about this page's structure should
// need to change -- just swap the data source.

export default function CommunityTipsPage() {
  const [countries, setCountries] = useState({});
  const [loadingReference, setLoadingReference] = useState(true);
  const [destination, setDestination] = useState("");
  // User-submitted tips persist in sessionStorage, so they survive
  // navigating away and back (not a full page refresh, and not across
  // devices -- this is still throwaway scaffolding for testing the UI
  // before the real Community Tips API exists, see the TODO above).
  const [submittedTips, setSubmittedTips] = useState(() => {
    try {
      const stored = sessionStorage.getItem("communityTips_submitted");
      return stored ? JSON.parse(stored) : [];
    } catch (err) {
      console.error("Failed to read saved tips from sessionStorage:", err);
      return [];
    }
  });
  // Single source of truth for all tips (submitted + mock). Filtering
  // happens at render time below, so switching destinations and back
  // never loses a locally-added tip.
  const allTips = [...submittedTips, ...MOCK_TIPS];
  const [showForm, setShowForm] = useState(false);
  const [newTip, setNewTip] = useState({ authorName: "", category: "general", content: "" });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    async function loadCountries() {
      try {
        const snap = await get(ref(rtdb, "countries"));
        setCountries(snap.val() || {});
      } catch (err) {
        console.error("Failed to load countries:", err);
      } finally {
        setLoadingReference(false);
      }
    }
    loadCountries();
  }, []);

  const countryOptions = Object.entries(countries)
    .map(([code, c]) => ({ code, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function handleDestinationChange(code) {
    setDestination(code);
    setShowForm(false);
  }

  const tips = allTips.filter((tip) => tip.destinationCountry === destination);

  function handleSubmitTip(e) {
    e.preventDefault();
    if (!newTip.content.trim()) {
      setFormError("Write your tip before sharing it.");
      return;
    }
    if (!newTip.authorName.trim()) {
      setFormError("Add your name so other travelers know who shared this.");
      return;
    }
    // Local-only for now -- see TODO above. New tips won't persist
    // across a page refresh until this is wired to the real API.
    const createdTip = {
      id: `local-${Date.now()}`,
      destinationCountry: destination,
      authorName: newTip.authorName.trim(),
      category: newTip.category,
      content: newTip.content.trim(),
      createdAt: new Date().toISOString(),
      helpfulCount: 0,
    };
    const updatedSubmittedTips = [createdTip, ...submittedTips];
    setSubmittedTips(updatedSubmittedTips);
    try {
      sessionStorage.setItem("communityTips_submitted", JSON.stringify(updatedSubmittedTips));
    } catch (err) {
      console.error("Failed to save tip to sessionStorage:", err);
    }
    setNewTip({ authorName: "", category: "general", content: "" });
    setFormError("");
    setShowForm(false);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function categoryLabel(key) {
    return CATEGORIES.find((c) => c.key === key)?.label || key;
  }

  if (loadingReference) {
    return <p className="loading-message">Loading country data...</p>;
  }

  return (
    <div className="community-tips-page">
      <h1>Community Tips</h1>
      <p>Real advice from people who've already made the move, by destination.</p>

      <div className="form-field community-tips-select">
        <label htmlFor="destination">Destination country</label>
        <select
          id="destination"
          value={destination}
          onChange={(e) => handleDestinationChange(e.target.value)}
        >
          <option value="">Select a country</option>
          {countryOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {destination && (
        <div className="community-tips-content">
          <div className="community-tips-header-row">
            <h2>{countries[destination]?.name}</h2>
            <Button
              label={showForm ? "Cancel" : "Share a tip"}
              variant="secondary"
              onClick={() => setShowForm((prev) => !prev)}
            />
          </div>

          {showForm && (
            <div className="community-tips-form">
              <FormContainer onSubmit={handleSubmitTip}>
                <TextInput
                  label="Your name"
                  value={newTip.authorName}
                  onChange={(value) => setNewTip({ ...newTip, authorName: value })}
                  placeholder="How should we credit this tip?"
                />
                <div className="form-field">
                  <label htmlFor="tip-category">Category</label>
                  <select
                    id="tip-category"
                    value={newTip.category}
                    onChange={(e) => setNewTip({ ...newTip, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="tip-content">Your tip</label>
                  <textarea
                    id="tip-content"
                    rows={4}
                    value={newTip.content}
                    onChange={(e) => setNewTip({ ...newTip, content: e.target.value })}
                    placeholder="What do you wish you'd known before you got here?"
                  />
                </div>
                {formError && (
                  <p className="error-message" role="alert">
                    {formError}
                  </p>
                )}
                <Button type="submit" label="Share tip" />
              </FormContainer>
            </div>
          )}

          {tips.length === 0 ? (
            <p className="placeholder-note">
              No tips yet for {countries[destination]?.name}. Be the first to share one.
            </p>
          ) : (
            <ul className="community-tips-list">
              {tips.map((tip) => (
                <li key={tip.id} className="community-tips-card">
                  <div className="community-tips-card-header">
                    <span className="community-tips-category">{categoryLabel(tip.category)}</span>
                    <span className="community-tips-date">{formatDate(tip.createdAt)}</span>
                  </div>
                  <p className="community-tips-text">{tip.content}</p>
                  <div className="community-tips-card-footer">
                    <span className="community-tips-author">— {tip.authorName}</span>
                    <span className="community-tips-helpful">{tip.helpfulCount} found this helpful</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
