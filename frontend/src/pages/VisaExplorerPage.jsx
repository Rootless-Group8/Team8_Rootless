import { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { rtdb } from "../firebase/config";
import Select from "../components/Select";
import Button from "../components/Button";

export default function VisaExplorerPage() {
  const [countries, setCountries] = useState({});
  const [visaTypes, setVisaTypes] = useState({});
  const [loadingReference, setLoadingReference] = useState(true);
  const [nationality, setNationality] = useState("");
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState(null);
  const [searchState, setSearchState] = useState("idle"); // idle | loading | found | not_found | error

  useEffect(() => {
    async function loadReferenceData() {
      try {
        const [countriesSnap, visaTypesSnap] = await Promise.all([
          get(ref(rtdb, "countries")),
          get(ref(rtdb, "visaTypes")),
        ]);
        setCountries(countriesSnap.val() || {});
        setVisaTypes(visaTypesSnap.val() || {});
      } catch (err) {
        console.error("Failed to load reference data:", err);
      } finally {
        setLoadingReference(false);
      }
    }
    loadReferenceData();
  }, []);

  const countryOptions = Object.entries(countries)
    .map(([code, data]) => ({ value: code, label: data.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  async function handleSearch(e) {
    e.preventDefault();
    if (!nationality || !destination) return;

    if (nationality === destination) {
      setSearchState("error");
      setResult(null);
      return;
    }

    setSearchState("loading");
    try {
      // Single-path lookup — pulls just this one requirement record instead
      // of downloading the entire requirements tree client-side.
      const snap = await get(ref(rtdb, `requirements/${nationality}/${destination}`));
      if (snap.exists()) {
        setResult(snap.val());
        setSearchState("found");
      } else {
        setResult(null);
        setSearchState("not_found");
      }
    } catch (err) {
      console.error("Visa lookup failed:", err);
      setSearchState("error");
    }
  }

  if (loadingReference) {
    return <p className="loading-message">Loading country data...</p>;
  }

  return (
    <div className="visa-explorer-page">
      <h1>Visa Explorer</h1>
      <p>Select your passport country and where you want to go.</p>

      <form onSubmit={handleSearch} className="visa-explorer-form">
        <Select
          label="Passport country"
          placeholder="Select a country"
          value={nationality}
          onChange={setNationality}
          options={countryOptions}
        />

        <Select
          label="Destination country"
          placeholder="Select a country"
          value={destination}
          onChange={setDestination}
          options={countryOptions}
        />

        <Button type="submit" label="Check requirements" disabled={!nationality || !destination} />
      </form>

      <div aria-live="polite" className="visa-explorer-result">
        {searchState === "error" && nationality === destination && (
          <p role="alert" className="error-message">
            Passport country and destination can't be the same.
          </p>
        )}

        {searchState === "loading" && <p className="loading-message">Checking...</p>}

        {searchState === "not_found" && (
          <p className="placeholder-note">
            No requirement data is seeded yet for {countries[nationality]?.name} →{" "}
            {countries[destination]?.name}. Phase 1 only covers a small set of passport
            countries so far.
          </p>
        )}

        {searchState === "found" && result && (
          <div className="visa-result-card">
            <h2>
              {countries[nationality]?.name} → {countries[destination]?.name}
            </h2>
            <p className="visa-requirement-badge">
              {visaTypes[result.requirementType]?.label || result.requirementType}
            </p>
            {result.maxStayDays != null && (
              <p>
                <strong>Max stay:</strong>{" "}
                {result.maxStayRaw || `${result.maxStayDays} days`}
              </p>
            )}
            {result.notes && (
              <p>
                <strong>Notes:</strong> {result.notes}
              </p>
            )}
            <p className="placeholder-note">
              Last verified:{" "}
              {result.lastVerifiedAt
                ? new Date(result.lastVerifiedAt).toLocaleDateString()
                : "unknown"}
            </p>
            {result.sourceUrl && (
              <p>
                <a href={result.sourceUrl} target="_blank" rel="noreferrer">
                  Source
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
