import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { getAuthErrorMessage } from "./authErrors";
import TextInput from "../components/TextInput";
import Button from "../components/Button";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8; // Firebase's own minimum is 6 — we enforce 8 ourselves client-side

export default function RegistrationPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    const newErrors = {};

    if (!form.fullName.trim()) {
      newErrors.fullName = "Full name is required.";
    }
    if (!form.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      newErrors.email = "Enter a valid email address.";
    }
    if (!form.password) {
      newErrors.password = "Password is required.";
    } else if (form.password.length < MIN_PASSWORD_LENGTH) {
      newErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (form.confirmPassword !== form.password) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    return newErrors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError("");
    setSuccess(false);

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const email = form.email.trim().toLowerCase();

      // Firebase Authentication creates the account and handles password
      // hashing/storage entirely on its own — we never see or store the
      // password ourselves. Duplicate emails throw "auth/email-already-in-use".
      const credential = await createUserWithEmailAndPassword(auth, email, form.password);
      const user = credential.user;

      // Firebase Auth doesn't have a "full name" field by default, but it
      // does support a displayName — set it so it's available via auth.currentUser too.
      await updateProfile(user, { displayName: form.fullName.trim() });

      // Everything else about the user (beyond what Firebase Auth stores)
      // lives in Firestore, keyed by the Firebase Auth UID.
      await setDoc(doc(db, "users", user.uid), {
        fullName: form.fullName.trim(),
        email,
        createdAt: serverTimestamp(),
      });

      setSuccess(true);
      setForm({ fullName: "", email: "", password: "", confirmPassword: "" });
    } catch (err) {
      setServerError(getAuthErrorMessage(err, "register"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="registration-page">
      <h1>Create your account</h1>

      {success && (
        <p role="status" className="success-message">
          Account created! You can now log in.
        </p>
      )}

      {serverError && (
        <p role="alert" className="error-message">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <TextInput
          label="Full name"
          value={form.fullName}
          onChange={(v) => updateField("fullName", v)}
          autoComplete="name"
          error={errors.fullName}
        />

        <TextInput
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => updateField("email", v)}
          autoComplete="email"
          error={errors.email}
        />

        <TextInput
          label="Password"
          type="password"
          value={form.password}
          onChange={(v) => updateField("password", v)}
          autoComplete="new-password"
          error={errors.password}
        />

        <TextInput
          label="Confirm password"
          type="password"
          value={form.confirmPassword}
          onChange={(v) => updateField("confirmPassword", v)}
          autoComplete="new-password"
          error={errors.confirmPassword}
        />

        <Button
          type="submit"
          label={submitting ? "Creating account..." : "Create account"}
          disabled={submitting}
        />
      </form>
    </div>
  );
}
