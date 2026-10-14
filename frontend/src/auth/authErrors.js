// Firebase returns specific error codes (e.g. "auth/user-not-found",
// "auth/wrong-password"). Our acceptance criteria require login errors to
// stay generic — this is where we collapse those specific codes into the
// message we're actually allowed to show.
export function getAuthErrorMessage(error, context) {
  const code = error?.code || "";

  if (context === "register") {
    if (code === "auth/email-already-in-use") {
      return "An account with this email already exists.";
    }
    if (code === "auth/invalid-email") {
      return "Enter a valid email address.";
    }
    if (code === "auth/weak-password") {
      return "Password must be at least 8 characters.";
    }
    return "Something went wrong. Please try again.";
  }

  if (context === "login") {
    // auth/user-not-found, auth/wrong-password, auth/invalid-credential all
    // collapse to the same generic message — don't reveal which was wrong.
    if (
      code === "auth/user-not-found" ||
      code === "auth/wrong-password" ||
      code === "auth/invalid-credential" ||
      code === "auth/invalid-email"
    ) {
      return "Invalid email or password.";
    }
    if (code === "auth/too-many-requests") {
      return "Too many attempts. Please wait a moment and try again.";
    }
    return "Something went wrong. Please try again.";
  }

  return "Something went wrong. Please try again.";
}
