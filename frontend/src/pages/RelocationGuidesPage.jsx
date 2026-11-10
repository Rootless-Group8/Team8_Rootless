import { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { rtdb } from "../firebase/config";
import "./RelocationGuidesPage.css";

// Order controls both tab order and which section shows by default.
// Adding a second country only ever requires new data at
// relocationGuides/{iso2} in RTDB — this array, and everything below it,
// stays the same regardless of how many countries exist.
const SECTIONS = [
  { key: "housing", label: "Housing" },
  { key: "healthcare", label: "Healthcare" },
  { key: "banking", label: "Banking" },
  { key: "transport", label: "Transport" },
];

export default function RelocationGuidesPage() {
  const [countries, setCountries] = useState({});
  const [loadingReference, setLoadingReference] = useState(true);
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | found | not_found | error
  const [guide, setGuide] = useState(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key);

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

  async function handleDestinationChange(code) {
    setDestination(code);
    setActiveSection(SECTIONS[0].key);

    if (!code) {
      setStatus("idle");
      setGuide(null);
      return;
    }

    setStatus("loading");
    try {
      const snap = await get(ref(rtdb, `relocationGuides/${code}`));
      if (snap.exists()) {
        setGuide(snap.val());
        setStatus("found");
      } else {
        setGuide(null);
        setStatus("not_found");
      }
    } catch (err) {
      console.error("Relocation guide lookup failed:", err);
      setStatus("error");
    }
  }

  if (loadingReference) {
    return <p className="loading-message">Loading country data...</p>;
  }

  const activeSectionData = guide ? guide[activeSection] : null;

  return (
    <div className="relocation-guides-page">
      <h1>Relocation Guides</h1>
      <p>See what to expect for housing, healthcare, banking, and transport before you move.</p>

      <div className="form-field relocation-guides-select">
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

      {status === "loading" && <p className="loading-message">Loading guide...</p>}

      {status === "not_found" && (
        <p className="placeholder-note">
          No relocation guide is available yet for {countries[destination]?.name}. Phase 1 only
          covers a small set of destinations so far.
        </p>
      )}

      {status === "error" && (
        <p className="error-message" role="alert">
          Couldn't load the relocation guide. Try again.
        </p>
      )}

      {status === "found" && guide && (
        <div className="relocation-guides-content">
          {/* Plain state-driven tabs, not routing — switching sections
              never reloads the page or changes the URL. */}
          <div className="relocation-guides-tabs" role="tablist">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                role="tab"
                aria-selected={activeSection === section.key}
                className={`relocation-guides-tab${
                  activeSection === section.key ? " relocation-guides-tab--active" : ""
                }`}
                onClick={() => setActiveSection(section.key)}
              >
                {section.label}
              </button>
            ))}
          </div>

          {activeSectionData && (
            <div className="relocation-guides-panel" role="tabpanel">
              <p className="relocation-guides-summary">{activeSectionData.summary}</p>
              <ul className="relocation-guides-tips">
                {activeSectionData.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
              {activeSectionData.sourceUrl && (
                <a
                  href={activeSectionData.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="relocation-guides-source"
                >
                  Source
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
