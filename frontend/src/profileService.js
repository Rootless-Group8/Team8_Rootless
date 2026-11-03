import { apiFetch } from "./lib/apiClient";

// Calls the real Express backend (backend/src/routes/profileRoutes.js),
// which reads/writes the profile at users/{uid}.profile via Firebase
// Admin SDK. This used to write directly to a separate profiles/{uid}
// Firestore collection with the client SDK — that was from an early
// scaffold, before the real backend API existed, and meant a saved
// profile was invisible to anything reading users/{uid}.profile,
// including the Checklist Generator API.

/**
 * Fetches the current user's relocation profile.
 * Returns null if they haven't completed profile setup yet.
 */
export async function fetchProfile() {
  const data = await apiFetch("/api/profile");
  return data.profile;
}

/**
 * Creates or updates the current user's relocation profile.
 * Supports partial updates — only fields present in profileData are
 * validated and saved, matching the backend's PATCH behavior.
 */
export async function saveProfile(profileData) {
  const data = await apiFetch("/api/profile", {
    method: "PATCH",
    json: profileData,
  });
  return data.profile;
}
