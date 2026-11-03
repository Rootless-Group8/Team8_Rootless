import { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { rtdb } from "../firebase/config";
import FormContainer from "../components/FormContainer";
import Select from "../components/Select";
import TextInput from "../components/TextInput";
import Button from "../components/Button";
import ProgressIndicator from "../components/ProgressIndicator";
import "./AffordabilityCalculatorPage.css";

// Mirrors the category labels/order already established in
// CostOfLivingPage, so the two features stay visually and
// conceptually consistent since they read from the same
// costOfLiving/{countryCode} data in Firebase.
const CATEGORY_LABELS = {
  rent: "Rent",
  utilities: "Utilities",
  transport: "Transport",
  healthcare: "Healthcare",
};
const CATEGORY_ORDER = ["rent", "utilities", "transport", "healthcare"];

const VISA_TYPES = [
  { value: "tourist", label: "Tourist / Visitor" },
  { value: "student", label: "Student" },
];

/**
 * AffordabilityCalculatorPage
 * Lets a user estimate whether their budget (tourist) or available
 * funds (student) realistically covers the cost of their trip or
 * move, using real cost-of-living data already seeded in Firebase
 * at costOfLiving/{countryCode} (the same data CostOfLivingPage reads).
 *
 * For student visas, this estimate can also double as a rough gut
 * check against the "proof of funds" requirement many countries have
 * — it is NOT an official calculation and says so on screen.
 *
 * This is a self-contained page (handles its own data fetching, same
 * pattern as CostOfLivingPage), so there's nothing to import it with
 * beyond the component itself.
 *
 * ---- Usage example ----
 *
 *   import AffordabilityCalculatorPage from "./pages/AffordabilityCalculatorPage";
 *
 *   <Route path="/affordability" element={<AffordabilityCalculatorPage />} />
 */
export default function AffordabilityCalculatorPage() {
  const [countries, setCountries] = useState({});
  const [loadingReference, setLoadingReference] = useState(true);

  const [destination, setDestination] = useState("");
  const [visaType, setVisaType] = useState("");
  const [budget, setBudget] = useState("");
  const [tripDays, setTripDays] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [tuition, setTuition] = useState("");

  const [costStatus, setCostStatus] = useState("idle"); // idle | loading | found | not_found | error
  const [costData, setCostData] = useState(null);
  const [result, setResult] = useState(null);

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
    .map(([code, c]) => ({ code: code, label: c.name }))
    .map((c) => ({ value: c.code, label: c.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  async function handleDestinationChange(code) {
    setDestination(code);
    setResult(null);

    if (!code) {
      setCostStatus("idle");
      setCostData(null);
      return;
    }

    setCostStatus("loading");
    try {
      const snap = await get(ref(rtdb, `costOfLiving/${code}`));
      if (snap.exists()) {
        setCostData(snap.val());
        setCostStatus("found");
      } else {
        setCostData(null);
        setCostStatus("not_found");
      }
    } catch (err) {
      console.error("Cost-of-living lookup failed:", err);
      setCostStatus("error");
    }
  }

  function handleCalculate(e) {
    e.preventDefault();
    if (!costData || !visaType || !budget) return;

    const monthlyTotal = CATEGORY_ORDER.reduce((sum, key) => {
      const amount = costData.categories[key]?.amount;
      return typeof amount === "number" ? sum + amount : sum;
    }, 0);

    let estimatedCost;
    if (visaType === "tourist") {
      const days = Number(tripDays) || 0;
      estimatedCost = (monthlyTotal / 30) * days;
    } else {
      const months = Number(durationMonths) || 0;
      estimatedCost = monthlyTotal * months + (Number(tuition) || 0);
    }

    const budgetNum = Number(budget) || 0;
    setResult({
      estimatedCost: Math.round(estimatedCost),
      budget: budgetNum,
      covered: budgetNum >= estimatedCost,
      currency: costData.currency,
    });
  }

  const canCalculate =
    destination &&
    visaType &&
    budget &&
    costStatus === "found" &&
    (visaType === "tourist" ? tripDays : durationMonths);

  if (loadingReference) {
    return (
      <div className="affordability-page">
        <ProgressIndicator label="Loading country data..." />
      </div>
    );
  }

  return (
    <div className="affordability-page">
      <FormContainer
        title="Affordability calculator"
        description="See whether your budget realistically covers your trip or move."
        onSubmit={handleCalculate}
      >
        <Select
          label="Destination country"
          placeholder="Select a country"
          value={destination}
          onChange={handleDestinationChange}
          options={countryOptions}
        />

        <Select
          label="Visa type"
          placeholder="Select a visa type"
          value={visaType}
          onChange={setVisaType}
          options={VISA_TYPES}
        />

        {visaType === "tourist" && (
          <TextInput
            label="Trip length (days)"
            type="number"
            placeholder="e.g. 14"
            value={tripDays}
            onChange={setTripDays}
          />
        )}

        {visaType === "student" && (
          <>
            <TextInput
              label="Program length (months)"
              type="number"
              placeholder="e.g. 10"
              value={durationMonths}
              onChange={setDurationMonths}
            />
            <TextInput
              label="Tuition (optional)"
              type="number"
              placeholder="e.g. 8000"
              value={tuition}
              onChange={setTuition}
            />
          </>
        )}

        <TextInput
          label={visaType === "student" ? "Available funds" : "Your budget"}
          type="number"
          placeholder="e.g. 3000"
          value={budget}
          onChange={setBudget}
        />

        <Button label="Calculate" type="submit" disabled={!canCalculate} />
      </FormContainer>

      <div className="affordability-results">
        {costStatus === "loading" && <ProgressIndicator label="Loading cost data..." />}

        {costStatus === "not_found" && destination && (
          <p className="placeholder-note">
            Cost-of-living data isn't available yet for {countries[destination]?.name}.
          </p>
        )}

        {costStatus === "error" && (
          <p className="error-message" role="alert">
            Couldn't load cost-of-living data. Try again.
          </p>
        )}

        {!result && costStatus === "found" && (
          <p className="placeholder-note">Fill in the form and calculate to see your estimate.</p>
        )}

        {result && (
          <div className="affordability-result-card">
            <h2>Estimated cost breakdown</h2>
            <ul className="affordability-breakdown-list">
              {CATEGORY_ORDER.map((key) => {
                const category = costData.categories[key];
                if (!category || typeof category.amount !== "number") return null;
                return (
                  <li key={key}>
                    <span>{CATEGORY_LABELS[key]}</span>
                    <span>
                      {costData.currency} {category.amount} / {costData.period}
                    </span>
                  </li>
                );
              })}
              {visaType === "student" && Number(tuition) > 0 && (
                <li>
                  <span>Tuition</span>
                  <span>
                    {costData.currency} {tuition}
                  </span>
                </li>
              )}
            </ul>

            <p className="affordability-total">
              Estimated total: {result.currency} {result.estimatedCost}
            </p>

            <p
              className={`affordability-verdict ${
                result.covered ? "affordability-verdict--covered" : "affordability-verdict--short"
              }`}
            >
              {result.covered
                ? "Your budget covers this estimate."
                : `You may be short by ${result.currency} ${result.estimatedCost - result.budget}.`}
            </p>

            {visaType === "student" && (
              <p className="affordability-disclaimer">
                This is a rough estimate, not an official proof-of-funds calculation. Always
                check the destination's actual visa requirements.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
