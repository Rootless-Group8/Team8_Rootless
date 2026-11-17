import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";

// Drop this into a navbar/header wherever a logged-in user should see a
// logout option.
export default function LogoutButton() {
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await signOut(auth); // clears Firebase's persisted session
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      navigate("/login");
    }
  }

  return (
    <Button
      label={loggingOut ? "Logging out..." : "Log out"}
      onClick={handleLogout}
      disabled={loggingOut}
      variant="secondary"
    />
  );
}
