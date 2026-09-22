import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { fetchProfile, saveProfile } from './profileService';

const COUNTRIES = [
  'United States', 'Canada', 'Mexico', 'United Kingdom', 'Germany', 'France',
  'Portugal', 'Spain', 'Australia', 'Japan', 'Netherlands', 'New Zealand',
];

const RELOCATION_GOALS = [
  { value: 'tourist_visit', label: 'Tourist Visit' },
  { value: 'work', label: 'Work' },
  { value: 'digital_nomad', label: 'Digital Nomad' },
  { value: 'student', label: 'Student' },
  { value: 'long_term_residency', label: 'Long-Term Residency' },
  { value: 'permanent_move', label: 'Permanent Move' },
];

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  citizenship: '',
  currentCountry: '',
  destinationCountry: '',
  relocationGoal: '',
  plannedArrivalDate: '',
};

export default function ProfileSetup() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ loading: true, saving: false, message: '' });
  const [authReady, setAuthReady] = useState(false);

  // Wait for Firebase to confirm the logged-in user before touching Firestore.
  // This is Firebase's version of "user must be logged in before accessing
  // profile setup" — fetchProfile/saveProfile would otherwise fire before
  // auth.currentUser exists.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthReady(true);
      if (!user) {
        setStatus({ loading: false, saving: false, message: 'You must be logged in to set up your profile.' });
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
            email: existing.email || auth.currentUser.email || '',
          });
        } else {
          // Prefill email from the Firebase Auth account for new profiles
          setForm((prev) => ({ ...prev, email: auth.currentUser.email || '' }));
        }
      } catch (err) {
        setStatus((s) => ({ ...s, message: 'Could not load your profile. Please try again.' }));
      } finally {
        setStatus((s) => ({ ...s, loading: false }));
      }
    }
    loadProfile();
  }, [authReady]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    const newErrors = {};

    if (!form.firstName.trim()) newErrors.firstName = 'First name is required.';
    if (!form.lastName.trim()) newErrors.lastName = 'Last name is required.';

    if (!form.email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!form.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required.';
    } else if (!/^\+?[0-9]{7,15}$/.test(form.phoneNumber)) {
      newErrors.phoneNumber = 'Please enter a valid phone number.';
    }

    if (!form.citizenship) newErrors.citizenship = 'Citizenship/passport country is required.';
    if (!form.currentCountry) newErrors.currentCountry = 'Current country is required.';
    if (!form.destinationCountry) newErrors.destinationCountry = 'Destination country is required.';
    if (!form.relocationGoal) newErrors.relocationGoal = 'Please select a relocation goal.';

    if (!form.plannedArrivalDate) {
      newErrors.plannedArrivalDate = 'Planned arrival date is required.';
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(form.plannedArrivalDate) < today) {
        newErrors.plannedArrivalDate = 'Arrival date cannot be in the past.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus((s) => ({ ...s, message: '' }));

    if (!auth.currentUser) {
      setStatus((s) => ({ ...s, message: 'You must be logged in to save your profile.' }));
      return;
    }

    if (!validate()) {
      setStatus((s) => ({ ...s, message: 'Please fix the errors below and try again.' }));
      return;
    }

    setStatus((s) => ({ ...s, saving: true }));
    try {
      await saveProfile(form);
      setStatus({ loading: false, saving: false, message: 'Profile saved successfully.' });
    } catch (err) {
      setStatus({
        loading: false,
        saving: false,
        message: err.message || 'Something went wrong saving your profile. Please try again.',
      });
    }
  }

  if (!authReady || status.loading) {
    return <p>Loading profile...</p>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2>Set Up Your Profile</h2>

      {status.message && <p role="alert">{status.message}</p>}

      <label>
        First Name
        <input name="firstName" value={form.firstName} onChange={handleChange} />
        {errors.firstName && <span className="error">{errors.firstName}</span>}
      </label>

      <label>
        Last Name
        <input name="lastName" value={form.lastName} onChange={handleChange} />
        {errors.lastName && <span className="error">{errors.lastName}</span>}
      </label>

      <label>
        Email
        <input name="email" type="email" value={form.email} onChange={handleChange} />
        {errors.email && <span className="error">{errors.email}</span>}
      </label>

      <label>
        Phone Number
        <input name="phoneNumber" value={form.phoneNumber} onChange={handleChange} placeholder="+15551234567" />
        {errors.phoneNumber && <span className="error">{errors.phoneNumber}</span>}
      </label>

      <label>
        Citizenship / Passport Country
        <select name="citizenship" value={form.citizenship} onChange={handleChange}>
          <option value="">Select a country</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {errors.citizenship && <span className="error">{errors.citizenship}</span>}
      </label>

      <label>
        Current Country
        <select name="currentCountry" value={form.currentCountry} onChange={handleChange}>
          <option value="">Select a country</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {errors.currentCountry && <span className="error">{errors.currentCountry}</span>}
      </label>

      <label>
        Destination Country
        <select name="destinationCountry" value={form.destinationCountry} onChange={handleChange}>
          <option value="">Select a country</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {errors.destinationCountry && <span className="error">{errors.destinationCountry}</span>}
      </label>

      <label>
        Relocation Goal
        <select name="relocationGoal" value={form.relocationGoal} onChange={handleChange}>
          <option value="">Select a goal</option>
          {RELOCATION_GOALS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
        {errors.relocationGoal && <span className="error">{errors.relocationGoal}</span>}
      </label>

      <label>
        Planned Arrival Date
        <input
          name="plannedArrivalDate"
          type="date"
          value={form.plannedArrivalDate}
          onChange={handleChange}
        />
        {errors.plannedArrivalDate && <span className="error">{errors.plannedArrivalDate}</span>}
      </label>

      <button type="submit" disabled={status.saving}>
        {status.saving ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}
