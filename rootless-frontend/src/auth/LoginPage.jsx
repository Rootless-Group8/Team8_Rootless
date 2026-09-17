import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config";
import { getAuthErrorMessage } from "./authErrors";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.email.trim() || !form.password) {
      setError("Invalid email or password.");
      return;
    }

    setSubmitting(true);
    try {
      // Firebase Authentication checks the credentials and, on success,
      // persists the session in the browser automatically — no manual
      // token/cookie handling needed on our end.
      await signInWithEmailAndPassword(auth, form.email.trim().toLowerCase(), form.password);

      // Login succeeded — redirect to dashboard/home.
      NavigateEvent("/dashboard");
    } catch (err) {
      // Collapses "no such user" and "wrong password" into one generic
      // message — see authErrors.js.
      setError(getAuthErrorMessage(err, "login"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <h1>Log in</h1>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
          />
        </div>

        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            autoComplete="current-password"
          />
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
