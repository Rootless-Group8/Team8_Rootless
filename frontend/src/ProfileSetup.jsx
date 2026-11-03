import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, rtdb } from "./firebase/config";
import { fetchProfile, saveProfile } from "./profileService";
import FormContainer from "./components/FormContainer";
import TextInput from "./components/TextInput";
import Select from "./components/Select";
import Button from "./components/Button";
import ProgressIndicator from "./components/ProgressIndicator";

// Matches backend/src/services/profileService.js's RELOCATION_GOALS exactly.
const RELOCATION_GOALS = [
  { value: "tourist_visit", label: "Tourist Visit" },
  { value: "work", label: "Work" },
  { value: "digital_nomad", label: "Digital Nomad" },
  { value: "student", label: "Student" },
  { value: "long_term_residency", label: "Long-Term Residency" },
  { value: "permanent_move", label: "Permanent Move" },
];

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  citizenship: "",
  currentCountry: "",
  destinationCountry: "",
  relocationGoal: "",
  plannedArrivalDate: "",
};

export default function ProfileSetup() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ loading: true, saving: false, message: "" });
  const [authReady, setAuthReady] = useState(false);
  const [countries, setCountries] = useState({});
  const [loadingCountries, setLoadingCountries] = useState(true);

  // Same real country data used by CostOfLivingPage and
  // AffordabilityCalculatorPage, instead of a separate hardcoded list.
  // Storing the iso2 code (not the full name) also matches what
  // checklistRules.js's resolveCountry() checks for first, so this is
  // the most reliable value to save, not just the most consistent one.
  useEffect(() => {
    async function loadCountries() {
      try {
        const snap = await get(ref(rtdb, "countries"));
        setCountries(snap.val() || {});
      } catch (err) {
        console.error("Failed to load countries:", err);
      } finally {
        setLoadingCountries(false);
      }
    }
    loadCountries();
  }, []);

  const countryOptions = Object.entries(countries)
    .map(([code, c]) => ({ value: code, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthReady(true);
      if (!user) {
        setStatus({
          loading: false,
          saving: false,
          message: "You must be logged in to set up your profile.",
        });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authReady || !auth.currentUser) return;

    async function loadProfile() {
      try {
        const existing = await fetchProfile();
        if (existing) {
          setForm({
            ...EMPTY_FORM,
            ...existing,
            email: existing.email || auth.currentUser.email || "",
          });
        } else {
          setForm((prev) => ({ ...prev, email: auth.currentUser.email || "" }));
        }
      } catch {
        setStatus((s) => ({ ...s, message: "Could not load your profile. Please try again." }));
      } finally {
        setStatus((s) => ({ ...s, loading: false }));
      }
    }
    loadProfile();
  }, [authReady]);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    const newErrors = {};

    if (!form.firstName.trim()) newErrors.firstName = "First name is required.";
    if (!form.lastName.trim()) newErrors.lastName = "Last name is required.";

    if (!form.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!form.phoneNumber.trim()) {
      newErrors.phoneNumber = "Phone number is required.";
    } else if (!/^\+?[0-9]{7,15}$/.test(form.phoneNumber)) {
      newErrors.phoneNumber = "Please enter a valid phone number.";
    }

    if (!form.citizenship) newErrors.citizenship = "Citizenship/passport country is required.";
    if (!form.currentCountry) newErrors.currentCountry = "Current country is required.";
    if (!form.destinationCountry) newErrors.destinationCountry = "Destination country is required.";
    if (!form.relocationGoal) newErrors.relocationGoal = "Please select a relocation goal.";

    if (!form.plannedArrivalDate) {
      newErrors.plannedArrivalDate = "Planned arrival date is required.";
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(form.plannedArrivalDate) < today) {
        newErrors.plannedArrivalDate = "Arrival date cannot be in the past.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus((s) => ({ ...s, message: "" }));

    if (!auth.currentUser) {
      setStatus((s) => ({ ...s, message: "You must be logged in to save your profile." }));
      return;
    }

    if (!validate()) {
      setStatus((s) => ({ ...s, message: "Please fix the errors below and try again." }));
      return;
    }

    setStatus((s) => ({ ...s, saving: true }));
    try {
      await saveProfile(form);
      setStatus({ loading: false, saving: false, message: "Profile saved successfully." });
    } catch (err) {
      setStatus({
        loading: false,
        saving: false,
        message: err.message || "Something went wrong saving your profile. Please try again.",
      });
    }
  }

  if (!authReady || status.loading || loadingCountries) {
    return <ProgressIndicator label="Loading profile..." />;
  }

  return (
    <FormContainer
      title="Set up your profile"
      description="Tell us about yourself so we can personalize your relocation checklist."
      onSubmit={handleSubmit}
    >
      {status.message && <p role="alert">{status.message}</p>}

      <TextInput
        label="First name"
        value={form.firstName}
        onChange={(v) => updateField("firstName", v)}
        error={errors.firstName}
      />
      <TextInput
        label="Last name"
        value={form.lastName}
        onChange={(v) => updateField("lastName", v)}
        error={errors.lastName}
      />
      <TextInput
        label="Email"
        type="email"
        value={form.email}
        onChange={(v) => updateField("email", v)}
        error={errors.email}
      />
      <TextInput
        label="Phone number"
        placeholder="+15551234567"
        value={form.phoneNumber}
        onChange={(v) => updateField("phoneNumber", v)}
        error={errors.phoneNumber}
      />
      <Select
        label="Citizenship / Passport country"
        placeholder="Select a country"
        value={form.citizenship}
        onChange={(v) => updateField("citizenship", v)}
        options={countryOptions}
        error={errors.citizenship}
      />
      <Select
        label="Current country"
        placeholder="Select a country"
        value={form.currentCountry}
        onChange={(v) => updateField("currentCountry", v)}
        options={countryOptions}
        error={errors.currentCountry}
      />
      <Select
        label="Destination country"
        placeholder="Select a country"
        value={form.destinationCountry}
        onChange={(v) => updateField("destinationCountry", v)}
        options={countryOptions}
        error={errors.destinationCountry}
      />
      <Select
        label="Relocation goal"
        placeholder="Select a goal"
        value={form.relocationGoal}
        onChange={(v) => updateField("relocationGoal", v)}
        options={RELOCATION_GOALS}
        error={errors.relocationGoal}
      />
      <TextInput
        label="Planned arrival date"
        type="date"
        value={form.plannedArrivalDate}
        onChange={(v) => updateField("plannedArrivalDate", v)}
        error={errors.plannedArrivalDate}
      />

      <Button label={status.saving ? "Saving..." : "Save Profile"} type="submit" disabled={status.saving} />
    </FormContainer>
  );
}
