import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import LoginPage from "./LoginPage";
import { signInWithEmailAndPassword } from "firebase/auth";

vi.mock("../firebase/config", () => ({
  auth: {},
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// checks email and password fields are properly rendering
// also checks form is accessible
it("renders email and password fields", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
});

// checks that empty submission shows a client side error and does not call Firebase
// check the early-exit validation
it("shows an error and does not call Firebase when fields are empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
});

// successful login navigates to the dashboard
it("navigates to /dashboard on successful login", async () => {
  signInWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: "abc123" } });
  const user = userEvent.setup();
  render(<LoginPage />);

  await user.type(screen.getByLabelText("Email"), "Test@Example.com");
  await user.type(screen.getByLabelText("Password"), "password123");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
    {},
    "test@example.com",
    "password123",
  );

  await waitFor(() => {
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});

// a failed login shows the generic error message
it("shows a generic error when credentials are wrong", async () => {
  signInWithEmailAndPassword.mockRejectedValueOnce({ code: "auth/wrong-password" });
  const user = userEvent.setup();
  render(<LoginPage />);

  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.type(screen.getByLabelText("Password"), "wrongpassword");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  expect(mockNavigate).not.toHaveBeenCalled();
});