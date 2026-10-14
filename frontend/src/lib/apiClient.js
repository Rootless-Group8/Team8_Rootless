import { auth } from "../firebase/config";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Calls the Express backend (backend/src) with the current user's Firebase
 * ID token attached as `Authorization: Bearer <token>` — the exact format
 * backend/src/middleware/authMiddleware.js expects.
 *
 * This is the one place that needs to know the backend's base URL and
 * auth header format; every caller just passes a path and options.
 *
 * @param {string} path - e.g. "/api/documents" (leading slash required)
 * @param {RequestInit} options - same as fetch()'s second argument.
 *   For JSON bodies, pass a plain object as `options.json` instead of
 *   `options.body` and this sets the Content-Type header for you.
 *   For file uploads, pass a FormData instance as `options.body` directly
 *   — don't set Content-Type yourself, the browser sets the correct
 *   multipart boundary automatically.
 */
export async function apiFetch(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error(
      "VITE_API_BASE_URL is not set. Add it to your .env file (see .env.example).",
    );
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be logged in to do this.");
  }

  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  let body = options.body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Some responses (e.g. a 500 with no body) may not be valid JSON —
    // treat that as "no structured error info" rather than throwing here.
  }

  if (!response.ok) {
    const message = data?.message || `Request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.error;
    error.details = data?.details || data?.fields;
    throw error;
  }

  return data;
}