import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import DashboardPage from "./DashboardPage";
import { getDoc } from "firebase/firestore";

vi.mock("../firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    user: { uid: "test-uid-123", email: "test@example.com", displayName: "Test User" },
    loading: false,
  }),
}));

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPage — Progress card", () => {
  it("shows the zero-state with a CTA when no checklist exists yet", async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({}), // no checklistTotal/checklistCompleted fields yet
    });

    renderDashboard();

    expect(
      await screen.findByText("No relocation checklist started yet. Progress tracking will appear here once you start one."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Find your visa/ })).toBeInTheDocument();

    // Zero-state and the real progress bar are mutually exclusive —
    // confirms we're not accidentally showing both at once.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows the real progress bar once checklist fields exist", async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ checklistCompleted: 4, checklistTotal: 10 }),
    });

    renderDashboard();

    const bar = await screen.findByRole("progressbar", { name: "Relocation checklist progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("4 of 10 steps complete (40%)")).toBeInTheDocument();

    // The zero-state message should be gone once real data is showing.
    expect(screen.queryByText(/No relocation checklist started yet/)).not.toBeInTheDocument();
  });

  it("treats a missing user doc the same as no checklist, not an error", async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    });

    renderDashboard();

    expect(
      await screen.findByText("No relocation checklist started yet. Progress tracking will appear here once you start one."),
    ).toBeInTheDocument();
  });
});
