import { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { rtdb } from "../firebase/config";

const CATEGORY_LABELS = {
  rent: "Rent",
  utilities: "Utilities",
  transport: "Transport",
  healthcare: "Healthcare",
};

const CATEGORY_ORDER = ["rent", "utilities", "transport", "healthcare"];

export default function CostOfLivingPage() {
  const [countries, setCountries] = useState({});
  const [loadingReference, setLoadingReference] = useState(true);
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | found | not_found | error
  const [data, setData] = useState(null);

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

    if (!code) {
      setStatus("idle");
      setData(null);
      return;
    }

    setStatus("loading");
    try {
      const snap = await get(ref(rtdb, `costOfLiving/${code}`));
      if (snap.exists()) {
        setData(snap.val());
        setStatus("found");
      } else {
        setData(null);
        setStatus("not_found");
      }
    } catch (err) {
      console.error("Cost-of-living lookup failed:", err);
      setStatus("error");
    }
  }

  // Scale each category's bar relative to the highest numeric amount for
  // this destination, so the visual breakdown is meaningful even though
  // currencies and absolute values differ country to country. Categories
  // with amount: null (e.g. Canada's healthcare) are excluded from the
  // scale calculation and rendered as a note instead of a bar.
  const numericAmounts = data
    ? CATEGORY_ORDER.map((key) => data.categories[key]?.amount).filter(
        (amt) => typeof amt === "number",
      )
    : [];
  const maxAmount = numericAmounts.length > 0 ? Math.max(...numericAmounts) : 1;

  if (loadingReference) {
    return <p className="loading-message">Loading country data...</p>;
  }

  return (
    <div className="cost-of-living-page">
      <h1>Cost of Living</h1>
      <p>See a monthly cost breakdown for a destination before you commit to moving there.</p>

      <div className="form-field cost-of-living-select">
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

      {status === "loading" && <p className="loading-message">Loading cost data...</p>}

      {status === "not_found" && (
        <p className="placeholder-note">
          Cost-of-living data isn't available yet for {countries[destination]?.name}. Phase 1
          only covers a small set of destinations so far.
        </p>
      )}

      {status === "error" && (
        <p className="error-message" role="alert">
          Couldn't load cost-of-living data. Try again.
        </p>
      )}

      {status === "found" && data && (
        <div className="cost-of-living-breakdown">
          {CATEGORY_ORDER.map((key) => {
            const category = data.categories[key];
            if (!category) return null;
            const hasAmount = typeof category.amount === "number";
            const barWidth = hasAmount ? Math.round((category.amount / maxAmount) * 100) : 0;

            return (
              <div className="cost-of-living-row" key={key}>
                <div className="cost-of-living-row-label">
                  <span>{CATEGORY_LABELS[key]}</span>
                  {hasAmount && (
                    <span className="cost-of-living-amount">
                      {data.currency} {category.amount} / {data.period}
                    </span>
                  )}
                </div>

                {hasAmount ? (
                  <div className="cost-of-living-bar-track">
                    <div
                      className="cost-of-living-bar-fill"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                ) : (
                  <p className="placeholder-note cost-of-living-na-note">
                    Not applicable — {category.note}
                  </p>
                )}

                {hasAmount && category.note && (
                  <p className="cost-of-living-note">{category.note}</p>
                )}

                {category.sourceUrl && (
                  <a
                    href={category.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cost-of-living-source"
                  >
                    Source
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
