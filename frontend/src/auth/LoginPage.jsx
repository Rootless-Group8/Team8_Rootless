import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config";
import { getAuthErrorMessage } from "./authErrors";
import { useNavigate } from "react-router-dom";
import TextInput from "../components/TextInput";
import Button from "../components/Button";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  function updateField(name, value) {
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
      navigate("/dashboard");
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
        <TextInput
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => updateField("email", v)}
          autoComplete="email"
        />

        <TextInput
          label="Password"
          type="password"
          value={form.password}
          onChange={(v) => updateField("password", v)}
          autoComplete="current-password"
        />

        <Button
          type="submit"
          label={submitting ? "Logging in..." : "Log in"}
          disabled={submitting}
        />
      </form>
    </div>
  );
}
