import { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { rtdb } from "../firebase/config";

// NOTE on scope: the sprint story describes this as comparing "2-3 visa
// types side by side" fed by a multi-select on the Visa Explorer results
// list. What we actually built for Visa Explorer is a single
// nationality->destination lookup, not a multi-result list to select
// from — our schema only stores one requirement record per
// nationality/destination pair, not multiple visa "types" per pair.
// So this page adapts the story to what the data actually supports:
// one passport country, compared across 2-3 destination countries,
// side by side. Same underlying value (compare your options before
// committing), just a different axis of comparison.

const EMPTY_SLOT = { destination: "", status: "idle", result: null };

// Requirement types that count as "no visa needed" for the best-option
// badge. Anything not in this list just shows its normal badge with no
// extra callout.
const NO_VISA_NEEDED_TYPES = new Set(["visa_free"]);

export default function VisaComparisonPage() {
  const [countries, setCountries] = useState({});
  const [visaTypes, setVisaTypes] = useState({});
  const [loadingReference, setLoadingReference] = useState(true);
  const [nationality, setNationality] = useState("");
  const [slots, setSlots] = useState([{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }, { ...EMPTY_SLOT }]);
  const [hasCompared, setHasCompared] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState("");

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
    .map(([code, data]) => ({ code, name: data.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function fetchSlot(index, passportCode, destinationCode) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], destination: destinationCode, status: "loading" };
      return next;
    });

    try {
      const snap = await get(ref(rtdb, `requirements/${passportCode}/${destinationCode}`));
      setSlots((prev) => {
        const next = [...prev];
        next[index] = {
          destination: destinationCode,
          status: snap.exists() ? "found" : "not_found",
          result: snap.exists() ? snap.val() : null,
        };
        return next;
      });
    } catch (err) {
      console.error("Comparison lookup failed:", err);
      setSlots((prev) => {
        const next = [...prev];
        next[index] = { destination: destinationCode, status: "error", result: null };
        return next;
      });
    }
  }

  function handleSlotChange(index, destinationCode) {
    setDuplicateWarning("");

    if (!destinationCode) {
      setSlots((prev) => {
        const next = [...prev];
        next[index] = { ...EMPTY_SLOT };
        return next;
      });
      return;
    }

    // Prevent comparing a destination against itself in two columns —
    // catch it before fetching anything, not after.
    const alreadyChosenElsewhere = slots.some(
      (slot, i) => i !== index && slot.destination === destinationCode,
    );
    if (alreadyChosenElsewhere) {
      setDuplicateWarning(
        `${countries[destinationCode]?.name || destinationCode} is already in another column. Pick a different destination.`,
      );
      return;
    }

    // Once an initial comparison has been run, changing a destination
    // swaps that one column in place — no need to re-select everything
    // or resubmit the whole form.
    if (hasCompared && nationality) {
      fetchSlot(index, nationality, destinationCode);
    } else {
      setSlots((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], destination: destinationCode };
        return next;
      });
    }
  }

  function handleClearSlot(index) {
    setDuplicateWarning("");
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...EMPTY_SLOT };
      return next;
    });
  }

  async function handleCompareSubmit(e) {
    e.preventDefault();
    if (!nationality) return;

    const filledSlots = slots
      .map((slot, index) => ({ index, destination: slot.destination }))
      .filter((s) => s.destination);

    if (filledSlots.length < 2) return;

    setHasCompared(true);
    await Promise.all(
      filledSlots.map(({ index, destination }) => fetchSlot(index, nationality, destination)),
    );
  }

  function handleStartOver() {
    setNationality("");
    setSlots([{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }, { ...EMPTY_SLOT }]);
    setHasCompared(false);
    setDuplicateWarning("");
  }

  const activeSlots = slots.filter((s) => s.destination);
  const canSubmit = nationality && activeSlots.length >= 2;

  // Once every filled slot has resolved (found or not_found — not still
  // loading), figure out whether any column is a clear "easiest" pick, so
  // we can badge it. Only bothers once there's more than one result to
  // actually compare.
  const resolvedFoundSlots = slots.filter((s) => s.destination && s.status === "found");
  const bestSlotIndexes = new Set();
  if (resolvedFoundSlots.length >= 2) {
    slots.forEach((slot, index) => {
      if (
        slot.status === "found" &&
        slot.result &&
        NO_VISA_NEEDED_TYPES.has(slot.result.requirementType)
      ) {
        bestSlotIndexes.add(index);
      }
    });
  }

  if (loadingReference) {
    return <p className="loading-message">Loading country data...</p>;
  }

  return (
    <div className="visa-comparison-page">
      <h1>Compare Visas</h1>
      <p>Pick your passport country and 2-3 destinations to compare side by side.</p>

      <form onSubmit={handleCompareSubmit} className="visa-comparison-form">
        <div className="form-field">
          <label htmlFor="nationality">Passport country</label>
          <select
            id="nationality"
            value={nationality}
            onChange={(e) => {
              setNationality(e.target.value);
              setHasCompared(false);
              setDuplicateWarning("");
              setSlots([{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }, { ...EMPTY_SLOT }]);
            }}
          >
            <option value="">Select a country</option>
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="comparison-slot-pickers">
          {slots.map((slot, index) => (
            <div className="form-field comparison-slot-field" key={index}>
              <label htmlFor={`destination-${index}`}>Destination {index + 1}</label>
              <div className="comparison-slot-input-row">
                <select
                  id={`destination-${index}`}
                  value={slot.destination}
                  onChange={(e) => handleSlotChange(index, e.target.value)}
                  disabled={!nationality}
                >
                  <option value="">{index < 2 ? "Select a country" : "Optional"}</option>
                  {countryOptions
                    .filter((c) => c.code !== nationality)
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                </select>
                {slot.destination && (
                  <button
                    type="button"
                    className="comparison-slot-clear"
                    onClick={() => handleClearSlot(index)}
                    aria-label={`Clear destination ${index + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {duplicateWarning && (
          <p role="alert" className="error-message">
            {duplicateWarning}
          </p>
        )}

        {!hasCompared && (
          <button type="submit" disabled={!canSubmit}>
            Compare
          </button>
        )}
      </form>

      {hasCompared && (
        <>
          <div
            className="comparison-grid"
            style={{ "--comparison-columns": activeSlots.length }}
            aria-live="polite"
          >
            {slots.map((slot, index) => {
              if (!slot.destination) return null;
              const destName = countries[slot.destination]?.name || slot.destination;
              const isBest = bestSlotIndexes.has(index);

              return (
                <div
                  className={`comparison-column${isBest ? " comparison-column--best" : ""}`}
                  key={index}
                >
                  <div className="comparison-column-header">
                    <h2>{destName}</h2>
                    {isBest && <span className="comparison-best-badge">Easiest option</span>}
                  </div>

                  {slot.status === "loading" && <p className="loading-message">Checking...</p>}

                  {slot.status === "not_found" && (
                    <p className="placeholder-note">
                      No requirement data seeded yet for this pair. Phase 1 only covers a small
                      set of passport countries so far.
                    </p>
                  )}

                  {slot.status === "error" && (
                    <p className="error-message" role="alert">
                      Couldn't load this comparison. Try again.
                    </p>
                  )}

                  {slot.status === "found" && slot.result && (
                    <>
                      <p className="visa-requirement-badge">
                        {visaTypes[slot.result.requirementType]?.label ||
                          slot.result.requirementType}
                      </p>
                      <dl className="comparison-fields">
                        <dt>Max stay</dt>
                        <dd>
                          {slot.result.maxStayDays != null
                            ? slot.result.maxStayRaw || `${slot.result.maxStayDays} days`
                            : "—"}
                        </dd>
                        <dt>Notes</dt>
                        <dd>{slot.result.notes || "—"}</dd>
                        <dt>Last verified</dt>
                        <dd>
                          {slot.result.lastVerifiedAt
                            ? new Date(slot.result.lastVerifiedAt).toLocaleDateString()
                            : "unknown"}
                        </dd>
                        <dt>Source</dt>
                        <dd>
                          {slot.result.sourceUrl ? (
                            <a href={slot.result.sourceUrl} target="_blank" rel="noreferrer">
                              Link
                            </a>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </dl>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="button-link-secondary comparison-start-over" onClick={handleStartOver}>
            Start over
          </button>
        </>
      )}
    </div>
  );
}
